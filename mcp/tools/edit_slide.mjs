import fs from "node:fs";
import { findBlockInSlide } from "../lib/blocks.mjs";
import { lintSlideTexts } from "../lib/narrative.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { clone, slug } from "../lib/text.mjs";

export default {
  name: "edit_slide",
  description:
    "Edita una slide de un carrusel persistido sin manipular el JSON crudo. Acciones: update_text (cambia kicker/título/highlight/body por blockId o blockType), move (reordena la slide a otra posición), duplicate (duplica la slide) y delete (elimina la slide). Persiste carousel.json, re-renderiza el preview y devuelve styleWarnings del bloque afectado. Usalo para refinar copy u orden según el NARRATIVE_REVIEW_PROTOCOL.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      slide: { type: "number", description: "Número de slide a editar (1-based)." },
      slideIndex: { type: "number", description: "Alias de slide." },
      action: { type: "string", enum: ["update_text", "move", "duplicate", "delete"], description: "Acción a realizar." },
      payload: {
        type: "object",
        description: "Parámetros de la acción. update_text: {blockId?, blockType?, text, field?} (field solo para items: title|desc|emoji). move: {to} (posición destino 1-based). duplicate/delete: vacío {}.",
        properties: {
          blockId: { type: "string", description: "ID preciso del bloque (update_text)." },
          blockType: { type: "string", description: "Tipo del primer bloque a ubicar: kicker | text | highlight | body | slogan | foot | item (update_text)." },
          text: { type: "string", description: "Nuevo texto (update_text)." },
          field: { type: "string", description: "Campo a sobreescribir si el bloque es item: title | desc | emoji." },
          to: { type: "number", description: "Posición destino 1-based (move)." },
        },
      },
      blockId: { type: "string", description: "Alias top-level de payload.blockId." },
      blockType: { type: "string", description: "Alias top-level de payload.blockType." },
      text: { type: "string", description: "Alias top-level de payload.text." },
      to: { type: "number", description: "Alias top-level de payload.to." },
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
    const ACTIONS = ["update_text", "move", "duplicate", "delete"];
    if (!ACTIONS.includes(action)) throw new Error(`Falta o es inválida \`action\`. Valores: ${ACTIONS.join(" | ")}.`);
    const record = readCarousel(company, name);
    const stored = record.stored;
    const slides = stored.slides || [];
    const idx = Math.max(0, (+a.slide || +a.slideIndex || 1) - 1);
    if (idx >= slides.length) throw new Error(`Slide ${idx + 1} inexistente (${slides.length} slides).`);
    const payload = (a.payload && typeof a.payload === "object") ? a.payload : {};
    const original = clone(slides[idx]);

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
    }

    stored.slides = slides;
    stored.updatedAt = new Date().toISOString();
    fs.writeFileSync(record.file, JSON.stringify(stored, null, 2), "utf8");
    const runtime = hydrateCarousel(stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    const html = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName, open: a.open === true, stable: true });
    const affectedIdx = action === "move" ? +payload.to - 1 : action === "duplicate" ? idx + 1 : action === "delete" ? Math.min(idx, slides.length - 1) : idx;
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
      appliedTo: `slide ${idx + 1}`,
      ...(action === "move" ? { from: idx + 1, to: +payload.to } : {}),
      ...(action === "duplicate" ? { newSlideAt: idx + 2, newId: slides[idx + 1].id } : {}),
      ...(action === "delete" ? { deleted: original.id || `slide ${idx + 1}`, remaining: slides.length } : {}),
      ...(action === "update_text" ? { block: payload.blockId || payload.blockType || a.blockType || a.blockId } : {}),
      slides: slides.length,
      ...handoff,
      styleWarnings,
    };
    return JSON.stringify(summary, null, 2);
  },
};
