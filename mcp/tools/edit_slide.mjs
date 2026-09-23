import fs from "node:fs";
import { findBlockInSlide, normSlideArg } from "../lib/blocks.mjs";
import { TEMPLATES } from "../lib/const.mjs";
import { lintSlideTexts } from "../lib/narrative.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { clone, slug } from "../lib/text.mjs";

export default {
  name: "edit_slide",
  description:
    "Edita slides de un carrusel persistido sin manipular el JSON crudo. Acciones: update_text (cambia kicker/título/highlight/body por blockId o blockType), move (reordena), duplicate, delete, add (inserta una slide nueva vacía con template cover|fact|map|list|cta). Persiste carousel.json, re-renderiza el preview y devuelve styleWarnings del bloque afectado. Usalo para refinar copy u orden según el NARRATIVE_REVIEW_PROTOCOL.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      slide: { type: "number", description: "Número de slide a editar (1-based). No requerido para add." },
      slideIndex: { type: "number", description: "Alias de slide." },
      action: { type: "string", enum: ["update_text", "move", "duplicate", "delete", "add"], description: "Acción a realizar." },
      payload: {
        type: "object",
        description: "Parámetros de la acción. update_text: {blockId?, blockType?, text, field?} (field solo para items: title|desc|emoji). move: {to}. duplicate/delete: {}. add: {template?, at?} (template cover|fact|map|list|cta; at = posición 1-based, default al final).",
        properties: {
          blockId: { type: "string", description: "ID preciso del bloque (update_text)." },
          blockType: { type: "string", description: "Tipo del primer bloque a ubicar: kicker | text | highlight | body | slogan | foot | item (update_text)." },
          text: { type: "string", description: "Nuevo texto (update_text)." },
          field: { type: "string", description: "Campo a sobreescribir si el bloque es item: title | desc | emoji." },
          to: { type: "number", description: "Posición destino 1-based (move)." },
          template: { type: "string", enum: ["cover", "fact", "map", "list", "cta"], description: "Plantilla de la slide nueva (add). Default list." },
          at: { type: "number", description: "Posición de inserción 1-based (add). Default: al final." },
        },
      },
      blockId: { type: "string", description: "Alias top-level de payload.blockId." },
      blockType: { type: "string", description: "Alias top-level de payload.blockType." },
      text: { type: "string", description: "Alias top-level de payload.text." },
      to: { type: "number", description: "Alias top-level de payload.to." },
      template: { type: "string", enum: ["cover", "fact", "map", "list", "cta"], description: "Alias top-level de payload.template (add)." },
      at: { type: "number", description: "Alias top-level de payload.at (add)." },
      outputDir: { type: "string", description: "Directorio del HTML re-renderizado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML re-renderizado." },
      open: { type: "boolean", description: "Abrir el HTML (default true para load/generate/from_url; default false para tools iterativas)." },
    },
    required: ["company", "name", "action"],
  },
  async handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
    const action = String(a.action || "").trim();
    const ACTIONS = ["update_text", "move", "duplicate", "delete", "add"];
    if (!ACTIONS.includes(action)) throw new Error(`Falta o es inválida \`action\`. Valores: ${ACTIONS.join(" | ")}.`);
    const record = readCarousel(company, name);
    const stored = record.stored;
    const slides = stored.slides || [];
    const payload = (a.payload && typeof a.payload === "object") ? a.payload : {};
    const idx = Math.max(0, (+a.slide || +a.slideIndex || 1) - 1);
    if (action !== "add" && idx >= slides.length) throw new Error(`Slide ${idx + 1} inexistente (${slides.length} slides).`);
    const original = action !== "add" ? clone(slides[idx]) : null;

    if (action === "update_text") {
      const blockId = payload.blockId || a.blockId || "";
      const blockType = payload.blockType || a.blockType || "";
      const text = payload.text !== undefined ? payload.text : a.text;
      if (text === undefined || text === null) throw new Error("Falta `payload.text` para update_text.");
      if (!blockId && !blockType) throw new Error("Falta `payload.blockId` o `payload.blockType` para ubicar el bloque (ej: kicker | text | highlight | body, o un blockId preciso como box-title).");
      const block = findBlockInSlide(slides[idx], blockId, blockType);
      if (!block) throw new Error(`Bloque no encontrado en slide ${idx + 1} (blockId="${blockId || "-"}", blockType="${blockType || "-"}").`);
      const field = payload.field || a.field || (block.type === "item" && payload.title === undefined && payload.desc === undefined && payload.emoji === undefined ? "title" : "text");
      if (block.type === "item" && ["title", "desc", "emoji"].includes(field)) {
        block[field] = String(text);
      } else if (block.text !== undefined || ["kicker", "text", "highlight", "body", "slogan", "foot", "pill"].includes(block.type)) {
        block.text = String(text);
      } else {
        throw new Error(`El bloque tipo "${block.type}" no tiene campo de texto editable con update_text. Usá field: title|desc|emoji si es un item.`);
      }
    } else if (action === "move") {
      const to = payload.to !== undefined ? +payload.to : +a.to;
      if (!Number.isFinite(to) || to < 1 || to > slides.length) {
        throw new Error(`\`payload.to\` debe ser la posición destino entre 1 y ${slides.length} (1-based). Recibiste: ${payload.to !== undefined ? payload.to : a.to}.`);
      }
      const moved = slides.splice(idx, 1)[0];
      slides.splice(to - 1, 0, moved);
    } else if (action === "duplicate") {
      const copy = clone(slides[idx]);
      let newId = `${slides[idx].id || "slide-" + (idx + 1)}-copy`;
      while (slides.some((s) => s.id === newId)) newId += "-" + Math.random().toString(36).slice(2, 5);
      copy.id = newId;
      slides.splice(idx + 1, 0, copy);
    } else if (action === "delete") {
      if (slides.length <= 1) throw new Error("No se puede eliminar la única slide del carrusel.");
      slides.splice(idx, 1);
    } else if (action === "add") {
      const template = payload.template || a.template || "list";
      if (!TEMPLATES.includes(template)) {
        throw new Error(`\`payload.template\` debe ser uno de: ${TEMPLATES.join(", ")}. Recibiste: ${template}.`);
      }
      const atRaw = payload.at !== undefined ? payload.at : a.at;
      let at = Number.isFinite(+atRaw) && +atRaw >= 1 ? Math.floor(+atRaw) : slides.length + 1;
      if (at > slides.length + 1) at = slides.length + 1;
      const created = normSlideArg({ template });
      let newId = created.id || `slide-${slides.length + 1}`;
      while (slides.some((s) => s.id === newId)) newId += "-" + Math.random().toString(36).slice(2, 5);
      created.id = newId;
      slides.splice(at - 1, 0, created);
    }

    stored.slides = slides;
    stored.updatedAt = new Date().toISOString();
    fs.writeFileSync(record.file, JSON.stringify(stored, null, 2), "utf8");
    const runtime = hydrateCarousel(stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    const html = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName, open: a.open === true, stable: true });
    const affectedIdx =
      action === "move" ? +payload.to - 1 :
      action === "duplicate" ? idx + 1 :
      action === "delete" ? Math.min(idx, slides.length - 1) :
      action === "add" ? Math.max(0, (payload.at !== undefined ? +payload.at : +a.at || slides.length) - 1) :
      idx;
    const styleWarnings = lintSlideTexts([slides[affectedIdx]]).map((w) => ({ ...w, slide: affectedIdx + 1 }));
    const handoff = handoffRender(html, record.file, runtime, {
      nextSteps: [
        "Cambio persistido en carousel.json.",
        "Si editaste copy: re-visá narrativeAudit / cohesión entre slides.",
        ...(styleWarnings.length ? ["Corregí los styleWarnings del bloque afectado."] : []),
      ],
    });
    const summary = {
      action,
      appliedTo: action === "add" ? `slide ${affectedIdx + 1}` : `slide ${idx + 1}`,
      ...(action === "move" ? { from: idx + 1, to: +payload.to } : {}),
      ...(action === "duplicate" ? { newSlideAt: idx + 2, newId: slides[idx + 1].id } : {}),
      ...(action === "delete" ? { deleted: original.id || `slide ${idx + 1}`, remaining: slides.length } : {}),
      ...(action === "add" ? { addedAt: affectedIdx + 1, newId: slides[affectedIdx] && slides[affectedIdx].id, template: slides[affectedIdx] && slides[affectedIdx].template } : {}),
      ...(action === "update_text" ? { block: payload.blockId || payload.blockType || a.blockType || a.blockId } : {}),
      slides: slides.length,
      ...handoff,
      styleWarnings,
    };
    return JSON.stringify(summary, null, 2);
  },
};
