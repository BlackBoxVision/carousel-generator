import fs from "node:fs";
import path from "node:path";
import { BLOCK_TYPES, CONVERTIBLE_EXTS, IMG_EXTS, MAX_LIST_ITEMS, TEMPLATES } from "./const.mjs";
import { clone, expandHome, slug } from "./text.mjs";
import { convertToJpeg } from "./images.mjs";

export function blockId(type, index) { return `${type || "block"}-${index + 1}`; }

export function normalizeBlock(block, index = 0) {
  if (!block || typeof block !== "object") return { id: blockId("block", index), type: "body", text: String(block || ""), style: {} };
  const type = BLOCK_TYPES.includes(block.type) ? block.type : "body";
  const out = { id: String(block.id || blockId(type, index)), type };
  if (block.text !== undefined) out.text = String(block.text);
  for (const key of ["emoji", "title", "desc", "layout", "visible"]) {
    if (block[key] !== undefined) out[key] = key === "visible" ? !!block[key] : String(block[key]);
  }
  if (block.style && typeof block.style === "object") out.style = clone(block.style);
  else out.style = {};
  out.pos = block.pos && typeof block.pos === "object" ? clone(block.pos) : null;
  if (block.children !== undefined) out.children = (Array.isArray(block.children) ? block.children : []).map(normalizeBlock);
  return out;
}

export function legacyElements(s, out) {
  const align = out.align || { eyebrow: "left", title: "left", body: "left" };
  const children = [];
  if (out.eyebrow) children.push({ type: "kicker", text: out.eyebrow, style: { align: align.eyebrow } });
  if (out.titleWhite) children.push({ type: "text", text: out.titleWhite, style: { align: align.title, sizePct: 60 } });
  if (out.titleOrange) children.push({ type: "highlight", text: out.titleOrange, style: { align: align.title, sizePct: 100 } });
  for (const text of out.paragraphs || []) children.push({ type: "body", text, style: { align: align.body } });
  if (out.items && out.items.length) children.push({
    type: "items",
    layout: "stack",
    style: { align: align.body },
    children: out.items.map((item, i) => ({ id: `item-${i + 1}`, type: "item", emoji: item.emoji, title: item.title, desc: item.desc, style: { align: align.body } })),
  });
  if (out.ctaBox && (out.ctaBox.title || out.ctaBox.text)) children.push({
    type: "box",
    style: { align: align.body, background: "secondary" },
    children: [
      { type: "text", text: out.ctaBox.title, style: { align: align.body, role: "box-title" } },
      { type: "body", text: out.ctaBox.text, style: { align: align.body } },
    ],
  });
  if (out.slogan) children.push({ type: "slogan", text: out.slogan, style: { align: align.body } });
  if (out.foot) children.push({ type: "foot", text: out.foot, style: { align: align.body } });
  return [
    { type: "brand", style: { topPct: 3.8, leftPct: 6.2, logoH: 48 } },
    { type: "count", visible: true, style: { topPct: 3.8, rightPct: 6.2 } },
    {
      type: "stack",
      style: {
        anchor: out.copyPos && out.copyPos.anchor || "bottom",
        offsetPct: out.copyPos && out.copyPos.offset || 0,
        widthPct: 87.6,
        maxHeightPct: out.template === "cta" ? 76 : 62,
      },
      children,
    },
    ...(out.pills || []).map((pill, i) => ({
      id: `pill-${i + 1}`,
      type: "pill",
      text: pill.text,
      pos: { topPct: pill.top, side: pill.side, offsetPct: pill.offset },
    })),
  ].map(normalizeBlock);
}

export function normSlideArg(s) {
  if (typeof s !== "object" || s === null) s = {};
  const out = { template: TEMPLATES.includes(s.template) ? s.template : "list" };
  out.id = String(s.id || "");
  for (const f of ["eyebrow", "titleWhite", "titleOrange", "slogan", "foot"]) {
    out[f] = s[f] !== undefined ? String(s[f]) : "";
  }
  out.paragraphs = (s.paragraphs !== undefined ? (Array.isArray(s.paragraphs) ? s.paragraphs : [s.paragraphs]) : []).map(String);
  out.items = (s.items !== undefined ? (Array.isArray(s.items) ? s.items : []) : []).map((x) => ({
    emoji: String((x && x.emoji) || "✨"),
    title: String((x && x.title) || ""),
    desc: String((x && x.desc) || ""),
  }));
  out.pills = (s.pills !== undefined ? (Array.isArray(s.pills) ? s.pills : []) : []).map((x) => ({
    text: String((x && x.text) || ""),
    top: Number((x && x.top) || 30),
    side: x && x.side === "right" ? "right" : "left",
    offset: Number((x && x.offset) || 8),
  }));
  out.ctaBox = s.ctaBox !== undefined && s.ctaBox
    ? { title: String(s.ctaBox.title || ""), text: String(s.ctaBox.text || "") }
    : { title: "", text: "" };
  const background = s.background !== undefined ? s.background : s.bg;
  if (typeof background === "string") {
    if (background.startsWith("file:")) {
      const fp0 = expandHome(background.replace(/^file:(\/\/)?/, ""));
      if (!fs.existsSync(fp0)) throw new Error(`Foto no encontrada: ${fp0}`);
      const fp = CONVERTIBLE_EXTS.has(path.extname(fp0).toLowerCase()) ? convertToJpeg(fp0) : fp0;
      const ext = path.extname(fp).toLowerCase();
      const mime = IMG_EXTS[ext] || "image/jpeg";
      out.bg = { type: "photo", src: `data:${mime};base64,` + fs.readFileSync(fp).toString("base64"), sourcePath: fp };
    } else {
      out.bg = background.includes("gradient")
        ? { type: "css", css: background }
        : { type: "gradient", value: slug(background) };
    }
  } else if (background && typeof background === "object") {
    out.bg = clone(background);
  }
  if (s.overlayLight !== undefined) out.overlayLight = !!s.overlayLight;
  if (s.scrim !== undefined) out.scrim = Math.max(0, Math.min(85, +s.scrim || 0));
  if (s.bgPos !== undefined) {
    const v = String(s.bgPos).trim();
    out.bgPos = /^(top|bottom|center|left|right|\d+%?|\s|-){1,20}$/.test(v) ? v : "center";
  }
  if (s.align !== undefined && s.align) {
    const va = ["left", "center", "right"];
    out.align = {
      eyebrow: va.includes(s.align.eyebrow) ? s.align.eyebrow : "left",
      title: va.includes(s.align.title) ? s.align.title : "left",
      body: va.includes(s.align.body) ? s.align.body : "left",
    };
  }
  if (s.copyPos !== undefined && s.copyPos) {
    const vc = ["top", "center", "bottom"];
    out.copyPos = {
      anchor: vc.includes(s.copyPos.anchor) ? s.copyPos.anchor : "bottom",
      offset: Math.max(-10, Math.min(10, +s.copyPos.offset || 0)),
    };
  }
  out.elements = Array.isArray(s.elements) ? s.elements.map(normalizeBlock) : legacyElements(s, out);
  out.__mcp = true;
  return out;
}

export function walkBlocks(nodes, fn) {
  for (const n of nodes || []) {
    if (fn(n)) return n;
    if (n.children) {
      const hit = walkBlocks(n.children, fn);
      if (hit) return hit;
    }
  }
  return null;
}
export function findBlockInSlide(slide, blockId, blockType) {
  if (blockId) return walkBlocks(slide.elements, (n) => n.id === blockId);
  if (blockType) return walkBlocks(slide.elements, (n) => n.type === blockType);
  return null;
}
export function findItemsBlock(slide) {
  for (const el of slide.elements || []) {
    if (el.type === "items") return el;
    for (const ch of el.children || []) if (ch.type === "items") return ch;
  }
  return null;
}
export function partitionListSlides(slides) {
  const out = [];
  for (const s of slides) {
    const itemsBlock = findItemsBlock(s);
    const items = itemsBlock ? (itemsBlock.children || []) : (Array.isArray(s.items) ? s.items : []);
    if (items.length <= MAX_LIST_ITEMS) { out.push(s); continue; }
    const baseId = s.id || "slide";
    for (let i = 0, part = 1; i < items.length; i += MAX_LIST_ITEMS, part++) {
      const chunk = items.slice(i, i + MAX_LIST_ITEMS);
      const partSlide = part === 1 ? s : clone(s);
      if (part > 1) {
        partSlide.id = `${baseId}-p${part}`;
        const kb = (partSlide.elements || []).find((el) => el.type === "stack" && (el.children || []).some((c) => c.type === "kicker"))
          || (partSlide.elements || []).find((el) => el.type === "kicker");
        const kicker = kb && kb.type === "kicker" ? kb : kb && (kb.children || []).find((c) => c.type === "kicker");
        if (kicker) kicker.text = `${kicker.text || ""} (PARTE ${part})`.trim();
        if (partSlide.eyebrow) partSlide.eyebrow = `${partSlide.eyebrow} (PARTE ${part})`;
        const sb = (partSlide.elements || []).find((el) => el.type === "stack");
        if (sb) sb.children = (sb.children || []).filter((c) => c.type !== "body");
      }
      const pb = findItemsBlock(partSlide);
      if (pb) pb.children = chunk;
      if (Array.isArray(partSlide.items)) partSlide.items = chunk;
      out.push(partSlide);
    }
  }
  return out;
}

const ALIGN_TYPES = new Set(["kicker", "text", "highlight", "body", "items", "item", "box", "slogan", "foot"]);
const PROTECT_ROOTS = new Set(["brand", "count", "stack"]);

export function findBlockPath(slide, blockId, blockType) {
  function walk(list, parent) {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (blockId && n.id === blockId) return { block: n, parent, list, index: i };
      if (!blockId && blockType && n.type === blockType) return { block: n, parent, list, index: i };
      if (n.children) {
        const hit = walk(n.children, n);
        if (hit) return hit;
      }
    }
    return null;
  }
  return walk(slide.elements || [], null);
}

export function findStackBlock(slide) {
  return (slide.elements || []).find((el) => el.type === "stack") || null;
}

export function applyAlignToSlide(slide, align) {
  if (!align || typeof align !== "object") return false;
  const va = ["left", "center", "right"];
  const cur = slide.align || { eyebrow: "left", title: "left", body: "left" };
  const next = { ...cur };
  if (align.eyebrow !== undefined && va.includes(align.eyebrow)) next.eyebrow = align.eyebrow;
  if (align.title !== undefined && va.includes(align.title)) next.title = align.title;
  if (align.body !== undefined && va.includes(align.body)) next.body = align.body;
  slide.align = next;

  const mapType = (type) => (type === "kicker" ? next.eyebrow : type === "text" || type === "highlight" ? next.title : next.body);
  const apply = (nodes) => {
    for (const n of nodes || []) {
      if (ALIGN_TYPES.has(n.type)) {
        n.style = n.style && typeof n.style === "object" ? n.style : {};
        n.style.align = mapType(n.type);
      }
      if (n.children) apply(n.children);
    }
  };
  apply(slide.elements);
  return true;
}

export function applyCopyPosToSlide(slide, copyPos) {
  if (!copyPos || typeof copyPos !== "object") return false;
  const vc = ["top", "center", "bottom"];
  const cur = slide.copyPos || { anchor: "bottom", offset: 0 };
  const next = { ...cur };
  if (copyPos.anchor !== undefined && vc.includes(copyPos.anchor)) next.anchor = copyPos.anchor;
  if (copyPos.offset !== undefined) next.offset = Math.max(-10, Math.min(10, +copyPos.offset || 0));
  slide.copyPos = next;
  const stack = findStackBlock(slide);
  if (stack) {
    stack.style = stack.style && typeof stack.style === "object" ? stack.style : {};
    stack.style.anchor = next.anchor;
    stack.style.offsetPct = next.offset;
  }
  return true;
}

export function applyPhotoLayout(slide, { scrim, bgPos, overlayLight }) {
  let changed = false;
  const isPhoto = slide.bg && slide.bg.type === "photo";
  if (overlayLight !== undefined) {
    slide.overlayLight = !!overlayLight;
    if (slide.bg) slide.bg.overlayLight = !!overlayLight;
    changed = true;
  }
  if (isPhoto && scrim !== undefined) {
    const v = Math.max(0, Math.min(85, +scrim || 0));
    slide.scrim = v;
    slide.bg.scrim = v;
    changed = true;
  }
  if (isPhoto && bgPos !== undefined) {
    const v = String(bgPos).trim();
    if (/^(top|bottom|center|left|right|\d+%?|\s|-){1,20}$/.test(v)) {
      slide.bgPos = v;
      slide.bg.bgPos = v;
      changed = true;
    }
  }
  return changed;
}

export function splitListSlide(slide, atItems = MAX_LIST_ITEMS) {
  const itemsBlock = findItemsBlock(slide);
  const items = itemsBlock ? (itemsBlock.children || []) : (Array.isArray(slide.items) ? slide.items : []);
  if (items.length < 2) return { error: `Slide has ${items.length} item(s) — nothing to split (need at least 2).` };
  const cut = Math.max(1, Math.min(items.length - 1, +atItems || MAX_LIST_ITEMS));
  const first = items.slice(0, cut);
  const rest = items.slice(cut);
  if (itemsBlock) itemsBlock.children = first.slice();
  if (Array.isArray(slide.items)) slide.items = first.slice();
  const part = clone(slide);
  const nib = findItemsBlock(part);
  if (nib) nib.children = rest;
  if (Array.isArray(part.items)) part.items = rest;
  const baseId = slide.id || "slide";
  const existingParts = (slide.__parts || 1);
  const partN = existingParts + 1;
  slide.__parts = partN;
  part.__parts = partN;
  part.id = `${baseId}-p${partN}`;
  const nk = (part.elements || []).find((el) => el.type === "kicker")
    || (part.elements || []).reduce((acc, el) => acc || (el.children || []).find((c) => c.type === "kicker"), null);
  if (nk) nk.text = nk.text ? `${nk.text} (PARTE ${partN})` : `PARTE ${partN}`;
  if (part.eyebrow) part.eyebrow = `${part.eyebrow} (PARTE ${partN})`;
  return { newSlide: part, kept: first.length, moved: rest.length };
}

export function uniqueBlockId(slide, type) {
  const base = type || "block";
  let i = 1;
  let id = `${base}-${i}`;
  const seen = new Set();
  const collect = (nodes) => { for (const n of nodes || []) { if (n.id) seen.add(n.id); if (n.children) collect(n.children); } };
  collect(slide.elements);
  while (seen.has(id)) { i += 1; id = `${base}-${i}`; }
  return id;
}

export function createBlockNode(type, text, style) {
  const t = BLOCK_TYPES.includes(type) ? type : "body";
  const node = { type: t };
  if (text !== undefined) node.text = String(text);
  if (style && typeof style === "object") node.style = { ...style };
  if (t === "item") {
    node.emoji = node.emoji || "✨";
    node.title = node.title || (text !== undefined ? String(text) : "");
    node.desc = node.desc || "";
  }
  if (t === "items") node.children = node.children || [];
  if (t === "box") node.children = node.children || [];
  return normalizeBlock(node, 0);
}

export function findOrCreateItemsBlock(slide) {
  let found = findItemsBlock(slide);
  if (found) return found;
  let stack = findStackBlock(slide);
  if (!stack) {
    stack = normalizeBlock({ type: "stack", style: { anchor: "bottom", offsetPct: 0, widthPct: 87.6, maxHeightPct: 62 }, children: [] }, 0);
    slide.elements = slide.elements || [];
    slide.elements.push(stack);
  }
  const node = normalizeBlock({ type: "items", layout: "stack", style: {}, children: [] }, 0);
  node.id = uniqueBlockId(slide, "items");
  stack.children = stack.children || [];
  stack.children.push(node);
  return node;
}

export function listPillElements(slide) {
  return (slide.elements || []).filter((el) => el.type === "pill");
}
