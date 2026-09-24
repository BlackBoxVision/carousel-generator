import { NARRATIVE_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { narrativeAudit } from "../lib/narrative.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
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
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel." },
      slug: { type: "string", description: "Alias de name." },
      outputDir: { type: "string", description: "Directorio del HTML renderizado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre del HTML renderizado." },
      open: { type: "boolean", description: "Abrir el HTML en navegador (default true en generate/load/from_url; default false en edit_slide/set_slide_photo)." },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
    const record = readCarousel(company, name);
    const runtime = hydrateCarousel(record.stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    const file = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName, open: a.open !== false, stable: true });
    const narrative = narrativeAudit(record.stored.slides || [], record.stored.meta && record.stored.meta.title);
    const handoff = handoffRender(file, record.file, runtime, {
      nextSteps: [
        a.open === false ? "HTML listo sin abrir (open:false)." : "Se abrió en el navegador.",
        "Inspeccioná el JSON nested y editá con edit_slide / save_carousel.",
        "Narrativa: revisá narrativeAudit.flags y NARRATIVE_REVIEW_PROTOCOL.",
      ],
    });
    return JSON.stringify({ ...record.stored, narrativeAudit: narrative, protocol: NARRATIVE_REVIEW_PROTOCOL, ...handoff }, null, 2);
  },
};
