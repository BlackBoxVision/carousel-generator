import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { handoffRender } from "../lib/handoff.mjs";
import { slug } from "../lib/text.mjs";
import saveCarousel from "./save_carousel.mjs";

export default {
  name: "import_editor_state",
  description:
    "Importa el estado del editor visual (botón Push al MCP) hacia carousel.json. Acepta el objeto JSON copiado desde el editor ({action, company, name, carousel}) o un carousel v2 armado a mano. Reutiliza la misma validación y copia de assets que save_carousel (las fotos base64 van a assets/, nunca se guardan base64 grande en el JSON). Ideal para sincronizar ediciones hechas en el browser de vuelta al MCP.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa (opcional si viene en payload/carousel)." },
      name: { type: "string", description: "Slug del carrusel (alias: slug). Opcional si viene en payload." },
      slug: { type: "string", description: "Alias de name." },
      payload: {
        type: ["object", "string"],
        description: "Objeto o string JSON copiado desde el editor: {action:'upsert', company, name, carousel}. Si es string, se parsea.",
      },
      carousel: { type: "object", description: "carousel.json v2 completo (alternativa a payload)." },
      open: { type: "boolean", description: "Abrir el HTML regenerado (default false)." },
    },
  },
  async handler(args) {
    const a = args || {};
    let payload = a.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (e) { throw new Error("No se pudo parsear `payload` como JSON: " + e.message); }
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
      throw new Error("Falta el estado del editor. Pegá el JSON del botón Push al MCP en `payload`, o pasá `carousel` (v2) con company/name.");
    }
    const resultRaw = await saveCarousel.handler(a);
    let result;
    try { result = JSON.parse(resultRaw); } catch { result = { saved: resultRaw }; }
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
    const handoff = html ? handoffRender(html, result.saved || null, runtime || { company, slug: name, slides: [], meta: {} }, {
      nextSteps: [
        "Estado del editor importado a carousel.json.",
        "Las fotos base64 (si las hubo) quedaron en assets/.",
        "Podés seguir refinando con edit_slide / render_preview / social_copy.",
      ],
    }) : { nextSteps: ["Estado importado; no se pudo re-renderizar el HTML en este paso."] };
    return JSON.stringify({ imported: true, ...result, ...handoff }, null, 2);
  },
};
