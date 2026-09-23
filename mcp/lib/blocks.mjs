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
