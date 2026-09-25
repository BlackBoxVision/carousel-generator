import {
  applyAlignToSlide,
  applyCopyPosToSlide,
  applyPhotoLayout,
  createBlockNode,
  findBlockInSlide,
  findBlockPath,
  findItemsBlock,
  findOrCreateItemsBlock,
  findStackBlock,
  listPillElements,
  normSlideArg,
  splitListSlide,
  uniqueBlockId,
} from "../lib/blocks.mjs";
import { BLOCK_TYPES, MAX_LIST_ITEMS, TEMPLATES } from "../lib/const.mjs";
import { pruneAssets, writeJsonAtomic } from "../lib/fsutil.mjs";
import { handoffRender } from "../lib/handoff.mjs";
import { lintSlideTexts } from "../lib/narrative.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe } from "../lib/render.mjs";
import { safeCss, safeStyleObject } from "../lib/safe.mjs";
import { clone, slug } from "../lib/text.mjs";

const ACTIONS = [
  "update_text",
  "move",
  "duplicate",
  "delete",
  "add",
  "split",
  "set_layout",
  "add_block",
  "delete_block",
  "move_block",
  "set_block",
  "add_item",
  "delete_item",
  "add_pill",
  "update_pill",
  "delete_pill",
];

const PAYLOAD_PROPS = {
  blockId: { type: "string", description: "Precise block id (update_text / block ops)." },
  blockType: {
    type: "string",
    description:
      "First matching block type: kicker | text | highlight | body | slogan | foot | item | items | pill | box (update_text / block ops).",
  },
  text: { type: "string", description: "New text (update_text / add_block / pills)." },
  field: {
    type: "string",
    enum: ["title", "desc", "emoji"],
    description: "Item field to overwrite (update_text on item): title | desc | emoji.",
  },
  title: { type: "string", description: "Item title (update_text shortcut or add_item)." },
  desc: { type: "string", description: "Item description (update_text shortcut or add_item)." },
  emoji: { type: "string", description: "Item emoji (update_text shortcut or add_item)." },
  to: { type: "integer", description: "Destination position 1-based (move / move_block)." },
  template: {
    type: "string",
    enum: ["cover", "fact", "map", "list", "cta"],
    description: "New slide template (add). Default list.",
  },
  at: { type: "integer", description: "Insertion position 1-based (add / split cut index). Default: end / 3." },
  type: {
    type: "string",
    description:
      "Block type for add_block (brand | count | stack | kicker | text | highlight | body | items | item | box | pill | slogan | foot).",
  },
  style: {
    type: "object",
    description: "Partial style patch for set_block (align, sizePct, anchor, offsetPct, background, color, ...).",
  },
  align: {
    type: "object",
    description:
      "Slide-level alignment {eyebrow?, title?, body?} each left|center|right (set_layout). Also mirrors onto blocks.",
    properties: {
      eyebrow: { type: "string", enum: ["left", "center", "right"] },
      title: { type: "string", enum: ["left", "center", "right"] },
      body: { type: "string", enum: ["left", "center", "right"] },
    },
  },
  copyPos: {
    type: "object",
    description:
      "Copy stack position {anchor?: top|center|bottom, offset?: -10..10} (set_layout). Mirrors onto the stack block.",
    properties: {
      anchor: { type: "string", enum: ["top", "center", "bottom"] },
      offset: { type: "number" },
    },
  },
  overlayLight: { type: "boolean", description: "Light overlay / dark text (set_layout)." },
  scrim: { type: "number", minimum: 0, maximum: 85, description: "Dark scrim 0-85 on photo slides only (set_layout)." },
  bgPos: { type: "string", description: "Photo focal point e.g. 'center 30%' on photo slides only (set_layout)." },
  index: { type: "integer", description: "0-based item/pill index (delete_item / delete_pill)." },
  top: { type: "number", description: "Pill top % (add_pill / update_pill)." },
  side: { type: "string", enum: ["left", "right"], description: "Pill side (add_pill / update_pill)." },
  offset: { type: "number", description: "Pill offset % (add_pill / update_pill)." },
};

export default {
  name: "edit_slide",
  description: [
    "Structured slide editor for a persisted carousel. Never edit carousel.json on disk yourself.",
    "WHAT: mutate one slide or its blocks, then persist + re-render preview.",
    "WHEN: refine copy, reorder, split long lists, change layout/alignment, add/remove blocks, items or pills,",
    "  after generate_carousel / carousel_from_url / load_carousel, or while applying NARRATIVE_REVIEW_PROTOCOL.",
    "SISTERS: set_slide_photo (photo bg), set_slide_bg (gradient/css), set_carousel_meta (title/format),",
    "  validate_carousel (audit), render_preview (PNGs), save_carousel (bulk JSON upsert).",
    "ACTIONS: update_text (block by blockId/blockType; item field title|desc|emoji), move, duplicate, delete, add,",
    "  split (split list slide after first 3 items; pass payload.at to cut elsewhere, required when the slide has <=3 items),",
    "  set_layout (align / copyPos / overlayLight / scrim / bgPos),",
    "  add_block, delete_block (protect brand/count/stack roots), move_block, set_block (text/style),",
    "  add_item, delete_item, add_pill, update_pill, delete_pill.",
    "ANTI: do NOT pass carousel/kit JSON (that is save_carousel); do NOT invent actions outside the enum;",
    "  prefer blockId when two blocks share a type; run validate_carousel after large rewrites.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Company slug." },
      name: { type: "string", description: "Carousel slug (alias: slug)." },
      slug: { type: "string", description: "Alias of name." },
      slide: { type: "integer", minimum: 1, description: "1-based slide number. Not required for add." },
      slideIndex: { type: "integer", minimum: 1, description: "Alias of slide." },
      action: { type: "string", enum: ACTIONS, description: "Action to perform." },
      payload: {
        type: "object",
        description:
          "Action parameters. See each key description. Top-level aliases (blockId, field, ...) are merged over payload.",
        properties: PAYLOAD_PROPS,
      },
      blockId: { type: "string", description: "Top-level alias of payload.blockId." },
      blockType: { type: "string", description: "Top-level alias of payload.blockType." },
      text: { type: "string", description: "Top-level alias of payload.text." },
      field: { type: "string", enum: ["title", "desc", "emoji"], description: "Top-level alias of payload.field." },
      title: { type: "string", description: "Top-level alias of payload.title." },
      desc: { type: "string", description: "Top-level alias of payload.desc." },
      emoji: { type: "string", description: "Top-level alias of payload.emoji." },
      type: { type: "string", description: "Top-level alias of payload.type (add_block)." },
      style: { type: "object", description: "Top-level alias of payload.style (set_block)." },
      align: PAYLOAD_PROPS.align,
      copyPos: PAYLOAD_PROPS.copyPos,
      overlayLight: { type: "boolean", description: "Top-level alias of payload.overlayLight." },
      scrim: { type: "number", minimum: 0, maximum: 85, description: "Top-level alias of payload.scrim." },
      bgPos: { type: "string", description: "Top-level alias of payload.bgPos." },
      index: { type: "integer", description: "Top-level alias of payload.index." },
      to: { type: "integer", description: "Top-level alias of payload.to." },
      template: {
        type: "string",
        enum: ["cover", "fact", "map", "list", "cta"],
        description: "Top-level alias of payload.template (add).",
      },
      at: { type: "integer", description: "Top-level alias of payload.at (add / split)." },
      top: { type: "number", description: "Top-level alias of payload.top (pills)." },
      side: { type: "string", enum: ["left", "right"], description: "Top-level alias of payload.side (pills)." },
      offset: {
        type: "number",
        description: "Top-level alias of payload.offset (pills / set_layout copyPos is nested).",
      },
      outputDir: { type: "string", description: "Re-render HTML directory. Default ~/Downloads." },
      fileName: { type: "string", description: "Re-render HTML basename." },
      open: { type: "boolean", description: "Open HTML (default false for iterative tools)." },
    },
    required: ["company", "action"],
  },
  async handler(args) {
    const a = args || {};
    // Chequeo sobre el valor crudo: slug("") cae al fallback "carrusel" y escondía el error.
    const rawCompany = String(a.company ?? "").trim();
    const rawName = String(a.name ?? a.slug ?? "").trim();
    if (!rawCompany) throw new Error("Falta `company` (requerido).");
    if (!rawName) throw new Error("Falta `name`/`slug` (requerido).");
    const company = slug(rawCompany);
    const name = slug(rawName);
    const action = String(a.action || "").trim();
    if (!ACTIONS.includes(action)) throw new Error(`Falta o es inválida \`action\`. Valores: ${ACTIONS.join(" | ")}.`);
    const record = readCarousel(company, name);
    const stored = record.stored;
    const slides = stored.slides || [];
    const payload = a.payload && typeof a.payload === "object" ? a.payload : {};
    // Los alias top-level ganan sobre payload (así lo documenta inputSchema).
    const pick = (key) => (a[key] !== undefined ? a[key] : payload[key]);
    const rawSlide = a.slide ?? a.slideIndex;
    if (rawSlide !== undefined && rawSlide !== null) {
      const n = Number(rawSlide);
      if (!Number.isInteger(n) || n < 1) throw new Error("`slide` debe ser un entero >= 1 (1-based).");
    }
    const idx = Math.max(0, (+a.slide || +a.slideIndex || 1) - 1);
    const needsSlide = !["add"].includes(action);
    if (needsSlide && idx >= slides.length) throw new Error(`Slide ${idx + 1} inexistente (${slides.length} slides).`);
    // delete es destructivo: exigir slide explícito para no borrar la portada por default.
    if (action === "delete" && (rawSlide === undefined || rawSlide === null)) {
      throw new Error("Falta `slide` para action=delete (defaulting a slide 1 borraría la portada).");
    }
    const original = needsSlide ? clone(slides[idx]) : null;
    const summaryExtra = {};

    if (action === "update_text") {
      const blockId = pick("blockId") || "";
      const blockType = pick("blockType") || "";
      const text = pick("text");
      if (text === undefined || text === null) throw new Error("Falta `payload.text` para update_text.");
      if (!blockId && !blockType)
        throw new Error(
          "Falta `payload.blockId` o `payload.blockType` para ubicar el bloque (ej: kicker | text | highlight | body, o un blockId preciso como box-title).",
        );
      const block = findBlockInSlide(slides[idx], blockId, blockType);
      if (!block)
        throw new Error(
          `Bloque no encontrado en slide ${idx + 1} (blockId="${blockId || "-"}", blockType="${blockType || "-"}").`,
        );
      let field = pick("field");
      if (!field) {
        if (block.type === "item") {
          if (pick("title") !== undefined) field = "title";
          else if (pick("desc") !== undefined) field = "desc";
          else if (pick("emoji") !== undefined) field = "emoji";
          else field = "title";
        } else field = "text";
      }
      if (block.type === "item" && ["title", "desc", "emoji"].includes(field)) {
        const direct = pick(field);
        block[field] = String(direct !== undefined ? direct : text);
      } else if (
        block.text !== undefined ||
        ["kicker", "text", "highlight", "body", "slogan", "foot", "pill"].includes(block.type)
      ) {
        block.text = String(text);
      } else {
        throw new Error(
          `El bloque tipo "${block.type}" no tiene campo de texto editable con update_text. Usá field: title|desc|emoji si es un item.`,
        );
      }
      summaryExtra.block = blockId || blockType;
      summaryExtra.field = field;
    } else if (action === "move") {
      const to = +pick("to");
      if (!Number.isFinite(to) || to < 1 || to > slides.length) {
        throw new Error(
          `\`payload.to\` debe ser la posición destino entre 1 y ${slides.length} (1-based). Recibiste: ${pick("to")}.`,
        );
      }
      const moved = slides.splice(idx, 1)[0];
      slides.splice(to - 1, 0, moved);
      summaryExtra.from = idx + 1;
      summaryExtra.to = to;
    } else if (action === "duplicate") {
      const copy = clone(slides[idx]);
      let newId = `${slides[idx].id || "slide-" + (idx + 1)}-copy`;
      while (slides.some((s) => s.id === newId)) newId += "-" + Math.random().toString(36).slice(2, 5);
      copy.id = newId;
      slides.splice(idx + 1, 0, copy);
      summaryExtra.newSlideAt = idx + 2;
      summaryExtra.newId = newId;
    } else if (action === "delete") {
      if (slides.length <= 1) throw new Error("No se puede eliminar la única slide del carrusel.");
      slides.splice(idx, 1);
      summaryExtra.deleted = original.id || `slide ${idx + 1}`;
      summaryExtra.remaining = slides.length;
    } else if (action === "add") {
      const template = pick("template") || "list";
      if (!TEMPLATES.includes(template)) {
        throw new Error(`\`payload.template\` debe ser uno de: ${TEMPLATES.join(", ")}. Recibiste: ${template}.`);
      }
      const atRaw = pick("at");
      let at = Number.isFinite(+atRaw) && +atRaw >= 1 ? Math.floor(+atRaw) : slides.length + 1;
      if (at > slides.length + 1) at = slides.length + 1;
      const created = normSlideArg({ template });
      let newId = created.id || `slide-${slides.length + 1}`;
      while (slides.some((s) => s.id === newId)) newId += "-" + Math.random().toString(36).slice(2, 5);
      created.id = newId;
      slides.splice(at - 1, 0, created);
      summaryExtra.addedAt = at;
      summaryExtra.newId = newId;
      summaryExtra.template = template;
    } else if (action === "split") {
      const atRaw = pick("at");
      const result = splitListSlide(slides[idx], atRaw !== undefined ? +atRaw : 3, { explicit: atRaw !== undefined });
      if (result.error) throw new Error(result.error);
      // Dedupe de id: sin esto, partir de nuevo reutiliza "-p2" y duplica ids.
      let newId = result.newSlide.id;
      while (slides.some((s) => s.id === newId)) newId += "-" + Math.random().toString(36).slice(2, 5);
      result.newSlide.id = newId;
      slides.splice(idx + 1, 0, result.newSlide);
      summaryExtra.kept = result.kept;
      summaryExtra.moved = result.moved;
      summaryExtra.newSlideAt = idx + 2;
      summaryExtra.newId = newId;
    } else if (action === "set_layout") {
      const slide = slides[idx];
      let ok = false;
      if (pick("align") !== undefined) ok = applyAlignToSlide(slide, pick("align")) || ok;
      if (pick("copyPos") !== undefined) ok = applyCopyPosToSlide(slide, pick("copyPos")) || ok;
      if (pick("overlayLight") !== undefined || pick("scrim") !== undefined || pick("bgPos") !== undefined) {
        ok =
          applyPhotoLayout(slide, {
            overlayLight: pick("overlayLight"),
            scrim: pick("scrim"),
            bgPos: pick("bgPos") !== undefined ? safeCss(pick("bgPos"), "bgPos") : undefined,
          }) || ok;
      }
      if (!ok)
        throw new Error("Falta payload con al menos uno de: align, copyPos, overlayLight, scrim (foto), bgPos (foto).");
      summaryExtra.layout = {
        ...(slide.align ? { align: slide.align } : {}),
        ...(slide.copyPos ? { copyPos: slide.copyPos } : {}),
        ...(slide.overlayLight !== undefined ? { overlayLight: slide.overlayLight } : {}),
        ...(slide.scrim !== undefined ? { scrim: slide.scrim } : {}),
        ...(slide.bgPos !== undefined ? { bgPos: slide.bgPos } : {}),
      };
    } else if (action === "add_block") {
      const slide = slides[idx];
      const type = pick("type") || pick("blockType") || "body";
      if (!BLOCK_TYPES.includes(type))
        throw new Error(`\`payload.type\` debe ser uno de: ${BLOCK_TYPES.join(", ")}. Recibiste: ${type}.`);
      const node = createBlockNode(type, pick("text"), safeStyleObject(pick("style")));
      node.id = uniqueBlockId(slide, type);
      let stack = findStackBlock(slide);
      if (!stack && ["kicker", "text", "highlight", "body", "slogan", "foot", "items", "box", "item"].includes(type)) {
        stack = normalizeStack(slide);
      }
      if (type === "pill") {
        // pos por default: un pill sin pos cae al 0/0 y tapa el título.
        node.pos = {
          topPct: pick("top") !== undefined ? +pick("top") : 30,
          side: pick("side") === "right" ? "right" : "left",
          offsetPct: pick("offset") !== undefined ? +pick("offset") : 8,
        };
        slide.elements = slide.elements || [];
        slide.elements.push(node);
      } else if (type === "brand" || type === "count") {
        slide.elements = slide.elements || [];
        slide.elements.unshift(node);
      } else if (stack) {
        stack.children = stack.children || [];
        const atRaw = pick("at");
        const at =
          Number.isFinite(+atRaw) && +atRaw >= 1
            ? Math.min(+atRaw, stack.children.length + 1)
            : stack.children.length + 1;
        stack.children.splice(at - 1, 0, node);
      } else {
        slide.elements = slide.elements || [];
        slide.elements.push(node);
      }
      summaryExtra.blockId = node.id;
      summaryExtra.type = type;
    } else if (action === "delete_block") {
      const slide = slides[idx];
      const blockId = pick("blockId") || "";
      const blockType = pick("blockType") || "";
      if (!blockId && !blockType) throw new Error("Falta `payload.blockId` o `payload.blockType` para delete_block.");
      const path = findBlockPath(slide, blockId, blockType);
      if (!path)
        throw new Error(
          `Bloque no encontrado en slide ${idx + 1} (blockId="${blockId || "-"}", blockType="${blockType || "-"}").`,
        );
      if (!blockId && PROTECT_ROOTS.has(path.block.type)) {
        throw new Error(
          `No se puede eliminar un root block tipo "${path.block.type}" sin blockId preciso. Usá blockId.`,
        );
      }
      path.list.splice(path.index, 1);
      summaryExtra.deletedBlock = path.block.id;
      summaryExtra.type = path.block.type;
    } else if (action === "move_block") {
      const slide = slides[idx];
      const blockId = pick("blockId") || "";
      const blockType = pick("blockType") || "";
      const to = +pick("to");
      if (!Number.isFinite(to) || to < 1) throw new Error("`payload.to` debe ser posición 1-based dentro del padre.");
      if (!blockId && !blockType) throw new Error("Falta `payload.blockId` o `payload.blockType` para move_block.");
      const path = findBlockPath(slide, blockId, blockType);
      if (!path)
        throw new Error(
          `Bloque no encontrado en slide ${idx + 1} (blockId="${blockId || "-"}", blockType="${blockType || "-"}").`,
        );
      const [node] = path.list.splice(path.index, 1);
      const dest = Math.max(0, Math.min(path.list.length, to - 1));
      path.list.splice(dest, 0, node);
      summaryExtra.movedBlock = node.id;
      summaryExtra.to = dest + 1;
    } else if (action === "set_block") {
      const slide = slides[idx];
      const blockId = pick("blockId") || "";
      const blockType = pick("blockType") || "";
      if (!blockId && !blockType) throw new Error("Falta `payload.blockId` o `payload.blockType` para set_block.");
      const block = findBlockInSlide(slide, blockId, blockType);
      if (!block)
        throw new Error(
          `Bloque no encontrado en slide ${idx + 1} (blockId="${blockId || "-"}", blockType="${blockType || "-"}").`,
        );
      const text = pick("text");
      if (text !== undefined && text !== null) {
        if (block.type === "item") {
          const field = pick("field") || "title";
          if (!["title", "desc", "emoji"].includes(field))
            throw new Error("`payload.field` debe ser title|desc|emoji para items.");
          const direct = pick(field);
          block[field] = String(direct !== undefined ? direct : text);
        } else if (
          block.text !== undefined ||
          ["kicker", "text", "highlight", "body", "slogan", "foot", "pill"].includes(block.type)
        ) {
          block.text = String(text);
        } else {
          throw new Error(`El bloque tipo "${block.type}" no tiene campo text.`);
        }
      }
      const style = pick("style");
      if (style && typeof style === "object") {
        block.style = block.style && typeof block.style === "object" ? block.style : {};
        Object.assign(block.style, safeStyleObject(style));
      }
      if (text === undefined && (!style || typeof style !== "object")) {
        throw new Error("set_block requiere `payload.text` y/o `payload.style`.");
      }
      summaryExtra.blockId = block.id;
      summaryExtra.type = block.type;
    } else if (action === "add_item") {
      const slide = slides[idx];
      const ib = findOrCreateItemsBlock(slide);
      ib.children = ib.children || [];
      if (ib.children.length >= MAX_LIST_ITEMS) {
        throw new Error(
          `La slide ya tiene ${ib.children.length} items (max ${MAX_LIST_ITEMS}): partí la lista con split o agregá en otra slide.`,
        );
      }
      const item = {
        id: uniqueBlockId(slide, "item"),
        type: "item",
        emoji: String(pick("emoji") || "✨"),
        title: String(pick("title") || pick("text") || ""),
        desc: String(pick("desc") || ""),
        style: ib.style && ib.style.align ? { align: ib.style.align } : {},
      };
      const atRaw = pick("at");
      const at =
        Number.isFinite(+atRaw) && +atRaw >= 1 ? Math.min(+atRaw, ib.children.length + 1) : ib.children.length + 1;
      ib.children.splice(at - 1, 0, item);
      if (Array.isArray(slide.items))
        slide.items = ib.children.map((c) => ({ emoji: c.emoji, title: c.title, desc: c.desc }));
      summaryExtra.itemId = item.id;
      summaryExtra.items = ib.children.length;
    } else if (action === "delete_item") {
      const slide = slides[idx];
      const ib = findItemsBlock(slide);
      if (!ib || !ib.children || !ib.children.length) throw new Error(`Slide ${idx + 1} no tiene items.`);
      let i = pick("index");
      if (i === undefined) {
        const title = pick("title") || pick("text");
        if (title) i = ib.children.findIndex((c) => c.title === String(title));
        else i = -1;
      } else i = +i;
      if (!Number.isFinite(i) || i < 0 || i >= ib.children.length) {
        throw new Error(`\`payload.index\` fuera de rango (0..${ib.children.length - 1}) o title no encontrado.`);
      }
      const [removed] = ib.children.splice(i, 1);
      if (Array.isArray(slide.items))
        slide.items = ib.children.map((c) => ({ emoji: c.emoji, title: c.title, desc: c.desc }));
      summaryExtra.deletedItem = removed.id;
      summaryExtra.items = ib.children.length;
    } else if (action === "add_pill") {
      const slide = slides[idx];
      const text = pick("text");
      if (text === undefined || text === null || text === "") throw new Error("Falta `payload.text` para add_pill.");
      const node = createBlockNode("pill", text);
      node.id = uniqueBlockId(slide, "pill");
      node.pos = {
        topPct: pick("top") !== undefined ? +pick("top") : 30,
        side: pick("side") === "right" ? "right" : "left",
        offsetPct: pick("offset") !== undefined ? +pick("offset") : 8,
      };
      slide.elements = slide.elements || [];
      slide.elements.push(node);
      if (Array.isArray(slide.pills)) {
        slide.pills.push({ text: String(text), top: node.pos.topPct, side: node.pos.side, offset: node.pos.offsetPct });
      }
      summaryExtra.pillId = node.id;
      summaryExtra.pills = listPillElements(slide).length;
    } else if (action === "update_pill") {
      const slide = slides[idx];
      const pills = listPillElements(slide);
      if (!pills.length) throw new Error(`Slide ${idx + 1} no tiene pills.`);
      let i = pick("index");
      if (i === undefined) {
        const text = pick("text");
        i = text !== undefined ? pills.findIndex((p) => p.text === String(text)) : 0;
      } else i = +i;
      if (!Number.isFinite(i) || i < 0 || i >= pills.length)
        throw new Error(`\`payload.index\` fuera de rango (0..${pills.length - 1}).`);
      const pill = pills[i];
      if (pick("text") !== undefined) pill.text = String(pick("text"));
      pill.pos = pill.pos && typeof pill.pos === "object" ? pill.pos : { topPct: 30, side: "left", offsetPct: 8 };
      if (pick("top") !== undefined) pill.pos.topPct = +pick("top");
      if (pick("side") !== undefined) pill.pos.side = pick("side") === "right" ? "right" : "left";
      if (pick("offset") !== undefined) pill.pos.offsetPct = +pick("offset");
      if (Array.isArray(slide.pills) && slide.pills[i]) {
        slide.pills[i] = { text: pill.text, top: pill.pos.topPct, side: pill.pos.side, offset: pill.pos.offsetPct };
      }
      summaryExtra.pillId = pill.id;
    } else if (action === "delete_pill") {
      const slide = slides[idx];
      const pills = listPillElements(slide);
      if (!pills.length) throw new Error(`Slide ${idx + 1} no tiene pills.`);
      let i = pick("index");
      if (i === undefined) {
        const text = pick("text");
        i = text !== undefined ? pills.findIndex((p) => p.text === String(text)) : 0;
      } else i = +i;
      if (!Number.isFinite(i) || i < 0 || i >= pills.length)
        throw new Error(`\`payload.index\` fuera de rango (0..${pills.length - 1}).`);
      const globalIdx = (slide.elements || []).indexOf(pills[i]);
      if (globalIdx >= 0) slide.elements.splice(globalIdx, 1);
      if (Array.isArray(slide.pills)) slide.pills.splice(i, 1);
      summaryExtra.pills = listPillElements(slide).length;
    }

    stored.slides = slides;
    stored.updatedAt = new Date().toISOString();
    pruneAssets(record.dir, stored.assets);
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
    const affectedIdx =
      action === "move"
        ? (summaryExtra.to || 1) - 1
        : action === "duplicate"
          ? idx + 1
          : action === "delete"
            ? Math.min(idx, slides.length - 1)
            : action === "add"
              ? Math.max(0, (summaryExtra.addedAt || slides.length) - 1)
              : action === "split"
                ? idx + 1
                : idx;
    const styleWarnings = lintSlideTexts([slides[affectedIdx]]).map((w) => ({ ...w, slide: affectedIdx + 1 }));
    const handoff = handoffRender(html, record.file, runtime, {
      nextSteps: [
        "Change persisted to carousel.json.",
        "If copy changed: re-check narrativeAudit / cohesion across slides (NARRATIVE_REVIEW_PROTOCOL).",
        ...(styleWarnings.length ? ["Fix the styleWarnings on the affected block."] : []),
      ],
    });
    const summary = {
      action,
      appliedTo: `slide ${action === "add" ? affectedIdx + 1 : idx + 1}`,
      ...summaryExtra,
      slides: slides.length,
      ...handoff,
      styleWarnings,
    };
    return JSON.stringify(summary, null, 2);
  },
};

const PROTECT_ROOTS = new Set(["brand", "count", "stack"]);

function normalizeStack(slide) {
  const stack = createBlockNode("stack", undefined, {
    anchor: "bottom",
    offsetPct: 0,
    widthPct: 87.6,
    maxHeightPct: 62,
  });
  stack.id = uniqueBlockId(slide, "stack");
  stack.children = [];
  slide.elements = slide.elements || [];
  const brandIdx = slide.elements.findIndex((el) => el.type === "brand");
  const countIdx = slide.elements.findIndex((el) => el.type === "count");
  const insertAt = Math.max(brandIdx, countIdx) + 1;
  slide.elements.splice(insertAt, 0, stack);
  return stack;
}
