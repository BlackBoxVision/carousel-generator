import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { canvasForFormat, MARKER } from "../lib/const.mjs";
import { loadAppTemplate } from "../lib/handoff.mjs";
import { brandKitsPayload } from "../lib/kits.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { chromeScreenshot, fileUrl, findChromeBin, normalizePreviewFormat } from "../lib/preview.mjs";
import { expandHome, slug } from "../lib/text.mjs";

export default {
  name: "render_preview",
  description: [
    "Render the carousel to real PNGs with headless Chrome.",
    "WHAT: format feed|4:5, square|1:1, story|9:16 (aliases 4:5|feed, 1:1|square, 9:16|story); optional slides (1-based, omit = all); return PNG path per slide.",
    "WHEN: user asks for PNGs ('todos los PNGs en 4:5', 'solo slide 3 en 1:1') or agent must verify photos/layout visually.",
    "SISTERS: export_pdf (PDF), load_carousel (HTML), set_carousel_meta (format), edit_slide (fix before re-render).",
    "ANTI: do NOT invent PNG paths — use returned paths; read them with vision before claiming success.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      format: {
        type: "string",
        description:
          "Formato: feed|4:5 (1080x1350), square|1:1 (1080x1080), story|9:16 (1080x1920). Default: el formato del carrusel.",
      },
      slides: {
        type: "array",
        items: { type: "integer", minimum: 1 },
        description: "Índices 1-based a renderizar. Omite para TODAS las slides.",
      },
      outputDir: {
        type: "string",
        description: "Directorio de salida. Default: carpeta del carrusel /previews/{format}/.",
      },
      open: { type: "boolean", description: "Abrir el primer PNG (default false)." },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company) throw new Error("Falta `company` (requerido).");
    if (!name) throw new Error("Falta `name`/`slug` (requerido).");
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
    const chrome = findChromeBin();
    const outDir = a.outputDir ? expandHome(a.outputDir) : path.join(record.dir, "previews", format);
    fs.mkdirSync(outDir, { recursive: true });
    const htmlFile = path.join(outDir, `${name}-preview.html`);
    const brands = brandKitsPayload(
      (runtime.kitSource && runtime.kitSource.slug) || (runtime.kit && runtime.kit.name) || "",
    );
    const payload =
      "<script>window.BRAND_KITS=" +
      JSON.stringify(brands).replace(/</g, "\\u003c") +
      ";</script>" +
      "<script>window.CAROUSEL_DATA=" +
      JSON.stringify(runtime).replace(/</g, "\\u003c") +
      ";</script>";
    const template = loadAppTemplate();
    fs.writeFileSync(
      htmlFile,
      template.replace(MARKER, () => payload),
      "utf8",
    );
    const pngs = [];
    const errors = [];
    // PNGs huérfanos: si el carrusel achicó, borra slides-NN.png fuera de rango
    const removedStale = [];
    for (const f of fs.readdirSync(outDir)) {
      const m = /^slide-(\d+)\.png$/.exec(f);
      if (m && Number(m[1]) > total) {
        try {
          fs.unlinkSync(path.join(outDir, f));
          removedStale.push(f);
        } catch {}
      }
    }
    if (!chrome) {
      return JSON.stringify(
        {
          preview: {
            ok: false,
            reason: "no-chrome",
            note: "No se encontró Chrome/Chromium headless. Abrí el HTML de preview y exportá PNGs desde el editor.",
            format,
            width: canvas.w,
            height: canvas.h,
            htmlPath: htmlFile,
            dir: outDir,
            slides: indices,
            pngs: [],
          },
          nextSteps: [
            "Instalá Google Chrome o pasá la ruta con CHROME_PATH.",
            "Abrí el HTML de preview con ?preview=1&slide=N&format=" + format + " y exportá a mano.",
          ],
        },
        null,
        2,
      );
    }
    for (const n of indices) {
      const pngPath = path.join(outDir, `slide-${String(n).padStart(2, "0")}.png`);
      const url = fileUrl(htmlFile) + `?preview=1&slide=${n}&format=${format}&t=${Date.now()}`;
      try {
        chromeScreenshot(chrome, url, pngPath, canvas.w, canvas.h);
        let bytes = 0;
        try {
          bytes = fs.statSync(pngPath).size;
        } catch {}
        pngs.push({ slide: n, path: pngPath, bytes, width: canvas.w, height: canvas.h });
      } catch (e) {
        errors.push({ slide: n, error: String((e && e.message) || e) });
      }
    }
    if (a.open === true && pngs[0]) {
      // spawn sin 'error' listener revienta el proceso MCP si no hay open/xdg-open
      try {
        const opened =
          process.platform === "darwin"
            ? spawn("open", [pngs[0].path], { stdio: "ignore", detached: true })
            : process.platform === "linux"
              ? spawn("xdg-open", [pngs[0].path], { stdio: "ignore", detached: true })
              : null;
        if (opened) {
          opened.on("error", () => {});
          opened.unref();
        }
      } catch {}
    }
    return JSON.stringify(
      {
        preview: {
          ok: pngs.length > 0 && !errors.length,
          format,
          width: canvas.w,
          height: canvas.h,
          dir: outDir,
          htmlPath: htmlFile,
          chrome,
          pngs,
          errors,
          count: pngs.length,
          requested: indices.length,
          ...(removedStale.length ? { removedStalePngs: removedStale } : {}),
        },
        nextSteps: [
          pngs.length
            ? `Leé/verificá los ${pngs.length} PNG(s) con visión (copy, fotos, layout).`
            : "No se generó ningún PNG — revisá errors.",
          errors.length
            ? "Hay slides con error de render: revisá errors."
            : "Si el copy o fotos cambiaron, volvé a correr render_preview.",
          "Formatos aceptados: 4:5|feed, 1:1|square, 9:16|story.",
        ],
      },
      null,
      2,
    );
  },
};
