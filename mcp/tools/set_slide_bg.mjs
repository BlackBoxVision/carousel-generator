import { writeJsonAtomic } from "../lib/fsutil.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe } from "../lib/render.mjs";
import { safeCss } from "../lib/safe.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "set_slide_bg",
  description: [
    "Change the background of a non-photo slide: kit gradient by name, custom CSS, or remove.",
    "WHAT: mode gradient|css|remove; remove clears photo/scrim and restores first kit gradient; persists carousel.json and re-renders preview.",
    "WHEN: adjusting non-photo slide backgrounds after generate / load / edit_slide.",
    "SISTERS: set_slide_photo (photos), edit_slide set_layout (align/overlayLight/scrim), set_carousel_meta, render_preview.",
    "ANTI: for photos use set_slide_photo, not this tool; do NOT edit carousel.json yourself.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      slide: { type: "integer", minimum: 1, description: "Número de slide (1-based)." },
      slideIndex: { type: "integer", minimum: 1, description: "Alias de slide." },
      mode: {
        type: "string",
        enum: ["gradient", "css", "remove"],
        description:
          "Tipo de fondo: gradient (nombre del kit), css (linear-gradient u otra regla), remove (quita foto y vuelve al gradiente default del kit).",
      },
      gradient: {
        type: "string",
        description: "Nombre del gradiente del kit (mode=gradient). Ej: navy, sunset, mint, deep.",
      },
      css: { type: "string", description: "Regla CSS de fondo (mode=css). Ej: linear-gradient(135deg,#111,#333)." },
      overlayLight: {
        type: "boolean",
        description: "Override de overlayLight (texto oscuro sobre fondo claro). Default: según el gradiente del kit.",
      },
      outputDir: { type: "string", description: "Directorio del HTML re-renderizado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML re-renderizado." },
      open: { type: "boolean", description: "Abrir el HTML (default false para tools iterativas)." },
    },
    required: ["company", "mode"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company) throw new Error("Falta `company` (requerido).");
    if (!name) throw new Error("Falta `name`/`slug` (requerido).");
    const mode = String(a.mode || "").trim();
    if (!["gradient", "css", "remove"].includes(mode)) {
      throw new Error("Falta o es inválida `mode`. Valores: gradient | css | remove.");
    }
    const record = readCarousel(company, name);
    const stored = record.stored;
    const slides = stored.slides || [];
    const rawSlide = a.slide ?? a.slideIndex;
    if (rawSlide !== undefined && rawSlide !== null) {
      const n = Number(rawSlide);
      if (!Number.isInteger(n) || n < 1) throw new Error("`slide` debe ser un entero >= 1 (1-based).");
      if (n > slides.length) throw new Error(`Slide ${n} inexistente (${slides.length} slides).`);
    }
    const idx = Math.max(0, (+a.slide || +a.slideIndex || 1) - 1);
    if (idx >= slides.length) throw new Error(`Slide ${idx + 1} inexistente (${slides.length} slides).`);
    const slide = slides[idx];
    const gradients =
      stored.kit && Array.isArray(stored.kit.gradients) && stored.kit.gradients.length
        ? stored.kit.gradients
        : [{ name: "navy", css: "linear-gradient(145deg,#1e3a5f,#0f172a 65%)" }];

    let applied;
    let overlayLight;
    if (mode === "gradient") {
      const gname = String(a.gradient || "").trim();
      if (!gname) throw new Error("Falta `gradient` (nombre del gradiente del kit) para mode=gradient.");
      const g = gradients.find((x) => slug(x.name) === slug(gname)) || gradients.find((x) => x.name === gname);
      if (!g)
        throw new Error(
          `Gradiente "${gname}" no existe en el kit. Disponibles: ${gradients.map((x) => x.name).join(", ")}.`,
        );
      // El editor resuelve por nombre EXACTO (g.name === bg.value): guardar el nombre real, no el slug.
      slide.bg = { type: "gradient", value: g.name };
      overlayLight = a.overlayLight !== undefined ? !!a.overlayLight : !!g.light;
      applied = { mode, gradient: g.name };
    } else if (mode === "css") {
      const css = safeCss(String(a.css || ""), "css");
      if (!css) throw new Error("Falta `css` (regla CSS de fondo) para mode=css.");
      if (!/gradient|url\(|color\(/i.test(css) && !css.startsWith("#") && !css.startsWith("rgb")) {
        throw new Error("`css` no parece un fondo válido (esperaba linear-gradient, url(...), color o hex).");
      }
      slide.bg = { type: "css", css };
      overlayLight = a.overlayLight !== undefined ? !!a.overlayLight : false;
      applied = { mode, css };
    } else {
      const fallback = gradients[0];
      slide.bg = { type: "gradient", value: fallback.name };
      overlayLight = a.overlayLight !== undefined ? !!a.overlayLight : !!fallback.light;
      applied = { mode, gradient: fallback.name };
    }
    delete slide.bg.scrim;
    delete slide.bg.bgPos;
    slide.overlayLight = overlayLight;
    stored.updatedAt = new Date().toISOString();
    writeJsonAtomic(record.file, stored);
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
    const handoff = handoffRender(html, record.file, runtime, {
      nextSteps: [
        "Fondo persistido en carousel.json.",
        "Si el texto no lee bien: ajustá overlayLight o cambiá el gradiente con set_slide_bg.",
        "Para foto: usá set_slide_photo en su lugar.",
        ...(rendered.warning ? [rendered.warning] : []),
      ],
    });
    return appendHandoff(
      `Fondo actualizado en slide ${idx + 1} de ${company}/${name}: ${JSON.stringify(applied)}\noverlayLight: ${overlayLight}\nPreview: ${html || "(no re-renderizado)"}${
        rendered.warning ? `\nWARNING: ${rendered.warning}` : ""
      }`,
      handoff,
    );
  },
};
