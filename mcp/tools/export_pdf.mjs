import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MARKER, canvasForFormat } from "../lib/const.mjs";
import { brandKitsPayload } from "../lib/kits.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { loadAppTemplate } from "../lib/handoff.mjs";
import { expandHome, slug } from "../lib/text.mjs";
import { fileUrl, findChromeBin, normalizePreviewFormat } from "../lib/preview.mjs";

export default {
  name: "export_pdf",
  description: [
    "Export the carousel to a multi-page PDF with headless Chrome (print-to-pdf).",
    "WHAT: accept format feed|4:5, square|1:1, story|9:16 (default: carousel format); write HTML preview then print PDF; return pdfPath + htmlPath.",
    "WHEN: user asks for a PDF export of the full carousel or selected slides.",
    "SISTERS: render_preview (PNGs), load_carousel (HTML), set_carousel_meta (format).",
    "ANTI: if Chrome is missing, return the HTML path with pdf.ok=false — do not invent a PDF path.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      format: {
        type: "string",
        description: "Formato de página: feed|4:5 (1080x1350), square|1:1 (1080x1080), story|9:16 (1080x1920). Default: formato del carrusel.",
      },
      slides: {
        type: "array",
        items: { type: "number" },
        description: "Índices 1-based a incluir. Omite para TODAS las slides.",
      },
      outputDir: { type: "string", description: "Directorio de salida. Default: carpeta del carrusel /exports/." },
      open: { type: "boolean", description: "Abrir el PDF generado (default false)." },
    },
    required: ["company", "name"],
  },
  handler(args) {
    const a = args || {};
    const company = a.company !== undefined && a.company !== null && String(a.company).trim()
      ? slug(String(a.company).trim())
      : "";
    const rawName = a.name !== undefined && a.name !== null && String(a.name).trim()
      ? String(a.name).trim()
      : a.slug !== undefined && a.slug !== null && String(a.slug).trim()
        ? String(a.slug).trim()
        : "";
    const name = rawName ? slug(rawName) : "";
    if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
    const record = readCarousel(company, name);
    const storedFormat = (record.stored.meta && record.stored.meta.format) || "feed";
    const format = normalizePreviewFormat(a.format, storedFormat);
    const canvas = canvasForFormat(format);
    const runtime = hydrateCarousel(record.stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    if (runtime.meta) {
      runtime.meta.format = format;
      runtime.meta.canvas = canvas;
    }
    const total = (runtime.slides || []).length;
    if (!total) throw new Error("El carrusel no tiene slides.");
    let indices;
    if (Array.isArray(a.slides) && a.slides.length) {
      indices = a.slides.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n >= 1 && n <= total);
      if (!indices.length) throw new Error("`slides` fuera de rango (1.." + total + ").");
    } else {
      indices = Array.from({ length: total }, (_, i) => i + 1);
    }
    // If subset requested, filter slides for the PDF HTML
    if (indices.length !== total) {
      runtime.slides = indices.map((n) => runtime.slides[n - 1]);
    }
    const chrome = findChromeBin();
    const outDir = a.outputDir
      ? expandHome(a.outputDir)
      : path.join(record.dir, "exports");
    fs.mkdirSync(outDir, { recursive: true });
    const htmlFile = path.join(outDir, `${name}-pdf.html`);
    const pdfFile = path.join(outDir, `${name}-${format}.pdf`);
    const brands = brandKitsPayload((runtime.kitSource && runtime.kitSource.slug) || (runtime.kit && runtime.kit.name) || "");
    const payload =
      "<script>window.BRAND_KITS=" + JSON.stringify(brands).replace(/</g, "\\u003c") + ";</script>" +
      "<script>window.CAROUSEL_DATA=" + JSON.stringify(runtime).replace(/</g, "\\u003c") + ";</script>";
    const template = loadAppTemplate();
    fs.writeFileSync(htmlFile, template.replace(MARKER, payload), "utf8");

    if (!chrome) {
      return JSON.stringify({
        pdf: {
          ok: false,
          reason: "no-chrome",
          note: "No se encontró Chrome/Chromium headless. Abrí el HTML y exportá PDF desde el editor (toolbar).",
          format,
          htmlPath: htmlFile,
          dir: outDir,
          pdfPath: null,
        },
        nextSteps: [
          "Instalá Google Chrome o pasá la ruta con CHROME_PATH.",
          `Abrí ${htmlFile} y usá el botón Exportar PDF del editor.`,
        ],
      }, null, 2);
    }

    const url = fileUrl(htmlFile) + `?preview=1&format=${format}&t=${Date.now()}`;
    const isHeadlessShell = /chrome-headless-shell|headless_shell/i.test(chrome);
    const chromeArgs = [];
    if (!isHeadlessShell) chromeArgs.push("--headless=new");
    chromeArgs.push(
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--disable-dev-shm-usage",
      "--allow-file-access-from-files",
      "--no-first-run",
      "--no-default-browser-check",
      "--virtual-time-budget=8000",
      "--run-all-compositor-stages-before-draw",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfFile}`,
      url
    );
    try { fs.rmSync(pdfFile, { force: true }); } catch {}
    const r = spawnSync(chrome, chromeArgs, { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    let bytes = 0;
    try { bytes = fs.statSync(pdfFile).size; } catch {}
    if (!fs.existsSync(pdfFile) || bytes < 100) {
      const err = (r.stderr || r.stdout || r.error && r.error.message || "").slice(0, 400);
      return JSON.stringify({
        pdf: {
          ok: false,
          reason: "chrome-failed",
          error: err || "Chrome no generó el PDF.",
          format,
          htmlPath: htmlFile,
          dir: outDir,
          pdfPath: null,
        },
        nextSteps: [
          "Revisá el error de Chrome o exportá a mano abriendo el HTML.",
          `HTML listo: ${htmlFile}`,
        ],
      }, null, 2);
    }
    if (a.open === true) {
      try {
        if (process.platform === "darwin") spawnSync("open", [pdfFile], { stdio: "ignore" });
        else if (process.platform === "linux") spawnSync("xdg-open", [pdfFile], { stdio: "ignore" });
      } catch {}
    }
    return JSON.stringify({
      pdf: {
        ok: true,
        format,
        width: canvas.w,
        height: canvas.h,
        pdfPath: pdfFile,
        bytes,
        slides: indices,
        count: indices.length,
        htmlPath: htmlFile,
        dir: outDir,
        chrome,
      },
      nextSteps: [
        `PDF generado (${bytes} bytes, ${indices.length} slides, formato ${format}).`,
        "Verificá que las páginas se vean bien (copy, fotos, layout).",
        "Si cambiaste copy o fotos: volvé a correr export_pdf.",
      ],
    }, null, 2);
  },
};
