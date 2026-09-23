import { NARRATIVE_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { narrativeAudit, lintSlideTexts } from "../lib/narrative.mjs";
import { canvasForFormat } from "../lib/const.mjs";
import { partitionListSlides } from "../lib/blocks.mjs";
import { normSlideArg } from "../lib/blocks.mjs";
import { persistCarousel, readCarousel } from "../lib/persist.mjs";
import { carouselPath } from "../lib/paths.mjs";
import { deepMerge, slug } from "../lib/text.mjs";
import { resolveKit } from "../lib/kits.mjs";

export default {
  name: "save_carousel",
  description: "Guarda o mergea un carousel.json v2 nested. Acepta carousel completo, slides nested o legacy; copia fotos/logo data URL o file: a assets/ y nunca guarda base64 en carousel.json. Sirve para el ciclo load -> refinar -> save. Devuelve styleWarnings si los textos usan raya larga (—), contrastes 'no es X, es Y' o clichés de IA: corregilos.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug persistido del carrusel." },
      slug: { type: "string", description: "Alias de name." },
      carousel: { type: "object", description: "Objeto carousel.json v2 completo, incluyendo meta, kit y slides." },
      slides: { type: "array", description: "Slides nested o legacy para crear/actualizar el carrusel." },
      meta: { type: "object", description: "Meta parcial: title, format, showCount." },
      kit: { type: "object", description: "Snapshot de brand kit opcional." },
      open: { type: "boolean", description: "Abrir el HTML regenerado (default true para load/generate; default false para tools iterativas)." },
    },
    required: ["company", "name"],
  },
  handler(args) {
    const a = args || {};
    const input = a.carousel && typeof a.carousel === "object" ? a.carousel : {};
    const existing = a.company && (a.name || a.slug) ? (() => { try { return readCarousel(a.company, a.name || a.slug).stored; } catch { return null; } })() : null;
    const company = slug(a.company || input.company || input.kitSource && input.kitSource.slug || input.kit && input.kit.name || "default");
    const name = slug(a.name || a.slug || input.slug || input.meta && input.meta.title || "carrusel");
    const rawSlides = a.slides || input.slides || existing && existing.slides || [];
    if (!Array.isArray(rawSlides)) {
      throw new Error("`slides` debe ser un array; recibiste " + (rawSlides === null ? "null" : typeof rawSlides) + ". Ejemplo: { slides: [{ template: 'fact', ... }] }. También podés pasar `carousel` con la propiedad slides, o `meta`/`kit` solos para actualizarlos sobre el existente.");
    }
    const sourceDir = existing ? carouselPath(company, name) : input.company && input.slug ? carouselPath(input.company, input.slug) : null;
    const kitBase = existing && existing.kit ? existing.kit : resolveKit(company);
    const kit = deepMerge(kitBase, input.kit || a.kit || {});
    const slides = partitionListSlides(rawSlides.map((slide, index) => {
      const out = normSlideArg(slide);
      out.id = slide && slide.id || out.id || `slide-${index + 1}`;
      return out;
    }));
    const requestedFormat = a.format || input.meta && input.meta.format || a.meta && a.meta.format || existing && existing.meta && existing.meta.format;
    const format = ["feed", "square", "story"].includes(requestedFormat) ? requestedFormat : "feed";
    const data = {
      version: 2,
      company,
      slug: name,
      kit,
      kitSource: input.kitSource || { store: "saved", slug: slug(kit.name || company) },
      meta: { ...(existing && existing.meta || {}), ...(input.meta || {}), ...(a.meta || {}), format, canvas: canvasForFormat(format) },
      slides,
    };
    const saved = persistCarousel(data, company, name, sourceDir);
    const styleWarnings = lintSlideTexts(slides);
    const narrative = narrativeAudit(slides, data.meta.title || name);
    return JSON.stringify({ saved: saved.file, company, slug: name, title: data.meta.title || name, slides: slides.length, assets: saved.data.assets, styleWarnings, narrativeAudit: narrative, protocol: NARRATIVE_REVIEW_PROTOCOL }, null, 2);
  },
};
