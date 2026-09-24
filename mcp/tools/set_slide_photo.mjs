import fs from "node:fs";
import path from "node:path";
import { CONVERTIBLE_EXTS, IMG_EXTS, PHOTO_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { pruneAssets, writeJsonAtomic } from "../lib/fsutil.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { convertToJpeg, downloadPhotoToTmp, imageSize } from "../lib/images.mjs";
import { assertPathAllowed } from "../lib/paths.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe } from "../lib/render.mjs";
import { expandHome, slug } from "../lib/text.mjs";
import { slideMetaForReview } from "./review_slide_images.mjs";

export default {
  name: "set_slide_photo",
  description: [
    "Replace the background photo of one slide in a persisted carousel.",
    "WHAT: accept http(s) URL (download) or absolute file: path; copy image to assets/, update carousel.json (asset, scrim, bgPos), re-render preview.",
    "WHEN: after carousel_from_url / generate / load, when a photo is missing or wrong; follow PHOTO_REVIEW_PROTOCOL after.",
    "SISTERS: set_slide_bg (gradient/css/remove), review_slide_images (audit), edit_slide set_layout (scrim/bgPos), validate_carousel.",
    "ANTI: do NOT edit carousel.json yourself; after applying, re-audit with review_slide_images before delivering.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      slide: { type: "integer", minimum: 1, description: "Número de slide (1-based)." },
      slideIndex: { type: "integer", minimum: 1, description: "Alias de slide." },
      source: { type: "string", description: "URL http(s) de la imagen o ruta local ('file:' + ruta o absoluta/~)." },
      scrim: {
        type: "number",
        minimum: 0,
        maximum: 85,
        description: "Velo de opacidad 0-85 (default: mantiene el actual).",
      },
      bgPos: { type: "string", description: "Punto focal CSS background-position (ej: 'center 30%')." },
      outputDir: { type: "string", description: "Directorio del HTML re-renderizado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML re-renderizado." },
      open: {
        type: "boolean",
        description: "Abrir el HTML (default true para load/generate/from_url; default false para tools iterativas).",
      },
    },
    required: ["company", "source"],
  },
  async handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company) throw new Error("Falta `company` (requerido).");
    if (!name) throw new Error("Falta `name`/`slug` (requerido).");
    const src = String(a.source || "");
    if (!src) throw new Error("Falta `source` (URL http(s) o ruta local).");
    // Todo lo asincronico (download / convert) ANTES de leer el carousel:
    // asi el write refleja el estado mas fresco en disco (no hay ventana de lost-update).
    let tmpFile = null;
    let file;
    if (/^https?:\/\//i.test(src)) {
      tmpFile = await downloadPhotoToTmp(src);
      file = tmpFile;
    } else {
      file = expandHome(src.replace(/^file:(\/\/)?/, ""));
      if (!fs.existsSync(file)) throw new Error(`Archivo no encontrado: ${file}`);
      // Contencion: solo rutas bajo $HOME/$TMPDIR/CAROUSEL_GENERATOR_HOME.
      assertPathAllowed(file, "source");
      if (CONVERTIBLE_EXTS.has(path.extname(file).toLowerCase())) {
        const converted = convertToJpeg(file);
        if (converted !== file) {
          tmpFile = converted;
          file = converted;
        }
      }
    }
    try {
      const record = readCarousel(company, name);
      const stored = record.stored;
      const rawSlide = a.slide ?? a.slideIndex;
      if (rawSlide !== undefined && rawSlide !== null) {
        const n = Number(rawSlide);
        if (!Number.isInteger(n) || n < 1) throw new Error("`slide` debe ser un entero >= 1 (1-based).");
      }
      const idx = Math.max(1, +a.slide || +a.slideIndex || 1) - 1;
      const slide = (stored.slides || [])[idx];
      if (!slide) throw new Error(`Slide ${idx + 1} inexistente (${(stored.slides || []).length} slides).`);
      const assetsDir = path.join(record.dir, "assets");
      fs.mkdirSync(assetsDir, { recursive: true });
      const ext = (path.extname(file).toLowerCase() || ".jpg").replace(".", "");
      const assetId = `${slide.id || "slide-" + (idx + 1)}-background`;
      const dest = path.join(assetsDir, `${assetId}.${ext}`);
      fs.copyFileSync(file, dest);
      slide.bg = { ...(slide.bg || {}), type: "photo", asset: `assets/${assetId}.${ext}` };
      delete slide.bg.src;
      delete slide.bg.css;
      delete slide.bg.value;
      if (a.scrim !== undefined) slide.bg.scrim = Math.max(0, Math.min(85, +a.scrim || 0));
      if (a.bgPos) slide.bg.bgPos = String(a.bgPos).trim() || "center";
      stored.assets = (stored.assets || []).filter((x) => x.id !== assetId);
      const dim = imageSize(dest);
      const mime = IMG_EXTS[`.${ext}`] || (ext === "png" ? "image/png" : "image/jpeg");
      stored.assets.push({
        id: assetId,
        file: `assets/${assetId}.${ext}`,
        kind: "photo",
        mime,
        width: dim ? dim.w : null,
        height: dim ? dim.h : null,
      });
      stored.updatedAt = new Date().toISOString();
      writeJsonAtomic(record.file, stored);
      // Borra el asset viejo si cambio la extension (slide-1-background.png -> .jpg)
      pruneAssets(record.dir, stored.assets);
      const runtime = hydrateCarousel(stored, record.dir);
      runtime.company = company;
      runtime.slug = name;
      const rendered = renderCarouselSafe(runtime, {
        outputDir: a.outputDir,
        fileName: a.fileName,
        open: a.open === true,
        stable: true,
      });
      const html = rendered.file;
      const photoNeeds = slideMetaForReview(stored, record.dir)
        .filter((s) => !s.hasPhoto)
        .map((s) => ({
          slide: s.slide,
          template: s.template,
          query: [s.title, s.highlight, s.kicker].filter(Boolean).join(" ") || s.template,
        }));
      const handoff = handoffRender(html, record.file, runtime, {
        nextSteps: [
          "Foto persistida en carousel.json + assets/.",
          "photoNeeds restantes: revisalas abajo.",
          "Re-auditá con review_slide_images antes de entregar.",
          ...(rendered.warning ? [rendered.warning] : []),
        ],
      });
      return appendHandoff(
        `Foto actualizada en slide ${idx + 1} de ${company}/${name}.\nImagen: ${dest}${
          dim ? ` (${dim.w}x${dim.h})` : ""
        }\nPreview: ${html || "(no re-renderizado)"}${
          rendered.warning ? `\nWARNING: ${rendered.warning}` : ""
        }\n\nphotoNeeds restantes (slides sin foto): ${
          photoNeeds.length ? JSON.stringify(photoNeeds) : "(ninguna)"
        }\n\nPaso 3 del protocolo: re-auditá con review_slide_images antes de entregar.\n${PHOTO_REVIEW_PROTOCOL}`,
        handoff,
      );
    } finally {
      if (tmpFile) {
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }
    }
  },
};
