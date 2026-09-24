import { handoffRender } from "../lib/handoff.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { slug } from "../lib/text.mjs";
import saveCarousel from "./save_carousel.mjs";

export default {
  name: "import_editor_state",
  description: [
    "Import visual editor state (Push to MCP button) into carousel.json.",
    "WHAT: prefer top-level company + name + carousel (v2) — most robust with clients that truncate nested JSON; alt payload string/object; reuses save_carousel validation and asset copy (base64 photos → assets/, never large base64 in JSON).",
    "WHEN: syncing browser editor edits back to the MCP after manual edits in app/index.html.",
    "SISTERS: save_carousel (API upsert), load_carousel (read), edit_slide (structured MCP edits), import only after editor Push.",
    "ANTI: do NOT write carousel.json yourself; prefer top-level args over payload when the client truncates nested objects.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa (opcional si viene en payload/carousel)." },
      name: { type: "string", description: "Slug del carrusel (alias: slug). Opcional si viene en payload." },
      slug: { type: "string", description: "Alias de name." },
      payload: {
        type: ["object", "string"],
        description:
          "Alternativa a args top-level: string JSON o objeto {action:'upsert', company, name, carousel}. Si es string, se parsea. Preferí company+name+carousel directos si el cliente trunca objetos anidados.",
      },
      carousel: { type: "object", description: "carousel.json v2 completo (preferido con company/name top-level)." },
      open: { type: "boolean", description: "Abrir el HTML regenerado (default false)." },
    },
  },
  async handler(args) {
    const a = args || {};
    let payload = a.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        throw new Error("No se pudo parsear `payload` como JSON: " + e.message);
      }
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      if (payload.carousel && typeof payload.carousel === "object") {
        a.carousel = payload.carousel;
        if (payload.company && !a.company) a.company = payload.company;
        if ((payload.name || payload.slug) && !(a.name || a.slug)) a.name = payload.name || payload.slug;
      } else if (payload.slides || payload.meta) {
        a.carousel = payload;
      } else if (payload.action && payload.carousel) {
        a.carousel = payload.carousel;
      }
    }
    if (!a.carousel || typeof a.carousel !== "object") {
      throw new Error(
        "Falta el estado del editor. Pegá el JSON del botón Push al MCP en `payload`, o pasá `carousel` (v2) con company/name.",
      );
    }
    const resultRaw = await saveCarousel.handler(a);
    let result;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { saved: resultRaw };
    }
    const company = slug(a.company || result.company || "");
    const name = slug(a.name || a.slug || result.slug || "");
    let html = null;
    let runtime = null;
    try {
      const record = readCarousel(company, name);
      runtime = hydrateCarousel(record.stored, record.dir);
      runtime.company = company;
      runtime.slug = name;
      html = renderCarousel(runtime, { open: a.open === true, stable: true });
    } catch (e) {
      process.stderr.write(`[import-editor] render skip: ${e.message}\n`);
    }
    const handoff = html
      ? handoffRender(html, result.saved || null, runtime || { company, slug: name, slides: [], meta: {} }, {
          nextSteps: [
            "Estado del editor importado a carousel.json.",
            "Las fotos base64 (si las hubo) quedaron en assets/.",
            "Podés seguir refinando con edit_slide / render_preview / social_copy.",
          ],
        })
      : { nextSteps: ["Estado importado; no se pudo re-renderizar el HTML en este paso."] };
    return JSON.stringify({ imported: true, ...result, ...handoff }, null, 2);
  },
};
