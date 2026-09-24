import { normSlideArg, partitionListSlides } from "../lib/blocks.mjs";
import { canvasForFormat, NARRATIVE_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { resolveKit } from "../lib/kits.mjs";
import { lintSlideTexts, narrativeAudit } from "../lib/narrative.mjs";
import { carouselPath } from "../lib/paths.mjs";
import { persistCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe } from "../lib/render.mjs";
import { deepMerge, slug } from "../lib/text.mjs";

export default {
  name: "save_carousel",
  description: [
    "Upsert a nested carousel.json v2 (full object, slides, or meta/kit partials).",
    "WHAT: accept carousel|slides|meta|kit; copy photo/logo data URLs or file: paths into assets/; never store large base64 in carousel.json.",
    "WHEN: after load/generate/edit when you need a bulk save; prefer edit_slide / set_slide_* / set_carousel_meta for single-field changes.",
    "SISTERS: edit_slide (structured slide edits), set_slide_photo / set_slide_bg, set_carousel_meta, import_editor_state (editor Push), validate_carousel (pre-save audit).",
    "ANTI: do NOT write carousel.json on disk yourself; fix styleWarnings (em-dash, 'no es X, es Y', AI clichés) before delivering.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug persistido del carrusel." },
      slug: { type: "string", description: "Alias de name." },
      carousel: { type: "object", description: "Objeto carousel.json v2 completo, incluyendo meta, kit y slides." },
      slides: { type: "array", description: "Slides nested o legacy para crear/actualizar el carrusel." },
      meta: { type: "object", description: "Meta parcial: title, format, showCount." },
      format: {
        type: "string",
        enum: ["feed", "square", "story"],
        description: "Alias top-level de meta.format (feed|square|story).",
      },
      kit: { type: "object", description: "Snapshot de brand kit opcional." },
      outputDir: { type: "string", description: "Directorio del HTML regenerado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML regenerado." },
      open: {
        type: "boolean",
        description: "Abrir el HTML regenerado (default true para load/generate; default false para tools iterativas).",
      },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    const input = a.carousel && typeof a.carousel === "object" ? a.carousel : {};
    let existing = null;
    if (a.company && (a.name || a.slug)) {
      try {
        existing = readCarousel(a.company, a.name || a.slug).stored;
      } catch (e) {
        // Solo "no existe" se trata como upsert nuevo; JSON corrupto debe fallar en voz alta.
        if (e && /no existe/.test(e.message)) existing = null;
        else throw e;
      }
    }
    const company = slug(
      a.company ||
        input.company ||
        (input.kitSource && input.kitSource.slug) ||
        (input.kit && input.kit.name) ||
        "default",
    );
    const name = slug(a.name || a.slug || input.slug || (input.meta && input.meta.title) || "carrusel");
    const rawSlides = a.slides || input.slides || (existing && existing.slides) || [];
    if (!Array.isArray(rawSlides)) {
      throw new Error(
        "`slides` debe ser un array; recibiste " +
          (rawSlides === null ? "null" : typeof rawSlides) +
          ". Ejemplo: { slides: [{ template: 'fact', ... }] }. También podés pasar `carousel` con la propiedad slides, o `meta`/`kit` solos para actualizarlos sobre el existente.",
      );
    }
    const sourceDir = existing
      ? carouselPath(company, name)
      : input.company && input.slug
        ? carouselPath(input.company, input.slug)
        : null;
    let kitBase;
    if (existing && existing.kit) kitBase = existing.kit;
    else {
      try {
        kitBase = resolveKit(company);
      } catch {
        kitBase = resolveKit();
      }
    }
    const kit = deepMerge(kitBase, input.kit || a.kit || {});
    const slides = partitionListSlides(
      rawSlides.map((slide, index) => {
        const out = normSlideArg(slide);
        out.id = (slide && slide.id) || out.id || `slide-${index + 1}`;
        return out;
      }),
    );
    const requestedFormat =
      a.format ||
      (input.meta && input.meta.format) ||
      (a.meta && a.meta.format) ||
      (existing && existing.meta && existing.meta.format);
    const format = ["feed", "square", "story"].includes(requestedFormat) ? requestedFormat : "feed";
    const data = {
      version: 2,
      company,
      slug: name,
      kit,
      kitSource: input.kitSource || { store: "saved", slug: slug(kit.name || company) },
      meta: {
        ...((existing && existing.meta) || {}),
        ...(input.meta || {}),
        ...(a.meta || {}),
        format,
        canvas: canvasForFormat(format),
      },
      slides,
    };
    const saved = persistCarousel(data, company, name, sourceDir);
    const styleWarnings = lintSlideTexts(slides);
    const narrative = narrativeAudit(slides, data.meta.title || name);
    const rendered = renderCarouselSafe(
      { ...data, company, slug: name },
      { outputDir: a.outputDir, fileName: a.fileName, open: a.open === true, stable: true },
    );
    return JSON.stringify(
      {
        saved: saved.file,
        company,
        slug: name,
        title: data.meta.title || name,
        slides: slides.length,
        assets: saved.data.assets,
        ...(rendered.file ? { htmlPath: rendered.file } : {}),
        ...(rendered.warning ? { warnings: [rendered.warning] } : {}),
        styleWarnings,
        narrativeAudit: narrative,
        protocol: NARRATIVE_REVIEW_PROTOCOL,
      },
      null,
      2,
    );
  },
};
