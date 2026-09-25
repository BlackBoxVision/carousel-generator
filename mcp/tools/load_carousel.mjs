import { NARRATIVE_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { handoffRender } from "../lib/handoff.mjs";
import { narrativeAudit } from "../lib/narrative.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "load_carousel",
  description: [
    "Load a persisted carousel.json v2 by company/slug, resolve assets, render editable HTML.",
    "WHAT: return full nested JSON plus render/json paths; HTML opens for inspection.",
    "WHEN: resuming work on an existing carousel before edit_slide / save_carousel / set_*.",
    "SISTERS: list_carousels (find), save_carousel (upsert), edit_slide (mutate slides), validate_carousel (audit), render_preview (PNGs).",
    "ANTI: do NOT open carousel.json with shell/file tools; use this tool's returned JSON. Follow NARRATIVE_REVIEW_PROTOCOL on the returned narrativeAudit.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Company slug." },
      name: { type: "string", description: "Carousel slug." },
      slug: { type: "string", description: "Alias of name." },
      outputDir: { type: "string", description: "Rendered HTML directory. Default ~/Downloads." },
      fileName: { type: "string", description: "Rendered HTML file name." },
      open: {
        type: "boolean",
        description:
          "Open the HTML in the browser (default true in generate/load/from_url; default false in edit_slide/set_slide_photo).",
      },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    // Chequeo sobre el valor crudo: slug("") cae al fallback "carrusel" y escondía el error.
    const rawCompany = String(a.company ?? "").trim();
    const rawName = String(a.name ?? a.slug ?? "").trim();
    if (!rawCompany) throw new Error("Falta `company` (requerido).");
    if (!rawName) throw new Error("Falta `name`/`slug` (requerido).");
    const company = slug(rawCompany);
    const name = slug(rawName);
    const record = readCarousel(company, name);
    const runtime = hydrateCarousel(record.stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    const file = renderCarousel(runtime, {
      outputDir: a.outputDir,
      fileName: a.fileName,
      open: a.open !== false,
      stable: true,
    });
    const narrative = narrativeAudit(record.stored.slides || [], record.stored.meta && record.stored.meta.title);
    const handoff = handoffRender(file, record.file, runtime, {
      nextSteps: [
        a.open === false ? "HTML ready without opening it (open:false)." : "Opened in the browser.",
        "Inspect the nested JSON and edit with edit_slide / save_carousel.",
        "Narrative: review narrativeAudit.flags and NARRATIVE_REVIEW_PROTOCOL.",
      ],
    });
    return JSON.stringify(
      { ...record.stored, narrativeAudit: narrative, protocol: NARRATIVE_REVIEW_PROTOCOL, ...handoff },
      null,
      2,
    );
  },
};
