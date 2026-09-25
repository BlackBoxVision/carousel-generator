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
      company: { type: "string", description: "Company slug (omit when passing standalone `slides`)." },
      name: { type: "string", description: "Carousel slug (alias: slug)." },
      slug: { type: "string", description: "Alias of name." },
      slides: {
        type: "array",
        description:
          "Nested or legacy slides to validate in dry-run mode without persisting. If omitted, reads from the persisted carousel.",
      },
      title: {
        type: "string",
        description: "Title to use in the narrative audit (default: the persisted meta.title).",
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
            ? "No solid flags nor styleWarnings: ready to deliver (verify photos with review_slide_images if applicable)."
            : "Fix narrativeAudit.flags (solid severity) and styleWarnings with edit_slide / save_carousel, then validate again.",
          "validate_carousel does not write: apply changes with edit_slide or save_carousel.",
        ],
      },
      null,
      2,
    );
  },
};
