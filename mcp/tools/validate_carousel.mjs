import { normSlideArg } from "../lib/blocks.mjs";
import { NARRATIVE_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { formatStyleWarnings, lintSlideTexts, narrativeAudit } from "../lib/narrative.mjs";
import { readCarousel } from "../lib/persist.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "validate_carousel",
  description: [
    "Quality dry-run on a persisted carousel (or unsaved slides): narrativeAudit + styleWarnings.",
    "WHAT: cover/cta/figures/kickers/orphans audit + em-dash / 'no es X, es Y' / AI cliché warnings; NO write, NO re-render.",
    "WHEN: before delivering or when auditing without mutating; also after large rewrites.",
    "SISTERS: edit_slide (fix findings), load_carousel (inspect), review_slide_images (photo audit), social_copy (after green).",
    "ANTI: never persist from this tool; follow NARRATIVE_REVIEW_PROTOCOL when flags are non-empty.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa (omitir si pasás `slides` sueltos)." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      slides: {
        type: "array",
        description:
          "Slides nested o legacy a validar en modo dry-run sin persistir. Si se omite, se leen del carousel persistido.",
      },
      title: {
        type: "string",
        description: "Título a usar en el audit de narrativa (default: meta.title del persistido).",
      },
    },
    required: [],
  },
  handler(args) {
    const a = args || {};
    let slides;
    let title = a.title !== undefined && a.title !== null ? String(a.title) : "";
    if (Array.isArray(a.slides)) {
      if (!a.slides.length) throw new Error("No hay slides para validar.");
      slides = a.slides.map((s) => normSlideArg(s));
      if (!title) title = "";
    } else {
      const rawCompany = String(a.company || "").trim();
      const rawName = String(a.name || a.slug || "").trim();
      if (!rawCompany || !rawName)
        throw new Error("Faltan `company` y `name`/`slug` (o pasá `slides` para dry-run suelto).");
      const company = slug(rawCompany);
      const name = slug(rawName);
      const record = readCarousel(company, name);
      const stored = record.stored;
      slides = stored.slides || [];
      if (!title) title = (stored.meta && stored.meta.title) || name;
    }
    if (!slides.length) throw new Error("No hay slides para validar.");
    const styleWarnings = lintSlideTexts(slides);
    const narrative = narrativeAudit(slides, title);
    const ok = narrative.ok && styleWarnings.length === 0;
    return JSON.stringify(
      {
        ok,
        slides: slides.length,
        title: title || "(sin título)",
        styleWarnings,
        narrativeAudit: narrative,
        protocol: NARRATIVE_REVIEW_PROTOCOL,
        styleLines: formatStyleWarnings(styleWarnings),
        nextSteps: [
          ok
            ? "Sin flags sólidos ni styleWarnings: listo para entregar (revisá fotos con review_slide_images si aplica)."
            : "Corregí narrativeAudit.flags (severidad solid) y styleWarnings con edit_slide / save_carousel, y volvé a validar.",
          "validate_carousel no escribe: aplicá cambios con edit_slide o save_carousel.",
        ],
      },
      null,
      2,
    );
  },
};
