#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.join(__dirname, "..", "app", "index.html");
const REPO_KITS = path.join(__dirname, "kits");
const HOME_CG = path.join(os.homedir(), ".carousel-generator");
const BRAND_DIR = path.join(HOME_CG, "brand");
const CAROUSEL_DIR = path.join(HOME_CG, "carousels");
const LEGACY_KITS = path.join(HOME_CG, "kits");
const MARKER = "<!--CAROUSEL_DATA-->";
const TEMPLATES = ["cover", "fact", "map", "list", "cta"];
const BLOCK_TYPES = ["brand", "count", "stack", "kicker", "text", "highlight", "body", "items", "item", "box", "pill", "slogan", "foot"];
const IMG_EXTS = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };

const DEFAULT_KIT = {
  name: "Default",
  colors: { primary: "#0ea5e9", secondary: "#0f172a", tertiary: "#ffffff", slideBg: "#1e293b" },
  fonts: { heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" },
  logo: { letter: "c", text: "Carousel" },
  gradients: [
    { name: "navy", css: "linear-gradient(145deg,#1e3a5f,#0f172a 65%)" },
    { name: "sunset", css: "linear-gradient(145deg,#b4653a,#1c2b3a 50%,#0b1420 100%)" },
    { name: "mint", css: "linear-gradient(135deg,#bfe3d8,#dcead2 55%,#5ea3b8)", light: true },
    { name: "deep", css: "linear-gradient(145deg,#16283c,#0b1420 70%)" },
  ],
};

function expandHome(p) {
  return String(p).replace(/^~(?=\/|$)/, os.homedir());
}
function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "carrusel";
}
function deepMerge(base, over) {
  if (over === null || over === undefined) return base;
  if (typeof base !== "object" || typeof over !== "object" || Array.isArray(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function blockId(type, index) { return `${type || "block"}-${index + 1}`; }

function normalizeBlock(block, index = 0) {
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

function legacyElements(s, out) {
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

function companyKitFile(sl) {
  return path.join(BRAND_DIR, sl, "kit.json");
}
function findKitFile(name) {
  const sl = slug(name);
  const company = companyKitFile(sl);
  if (fs.existsSync(company)) return { file: company, scope: sl };
  const legacy = path.join(LEGACY_KITS, sl + ".json");
  if (fs.existsSync(legacy)) {
    process.stderr.write(`[carousel-mcp] kit "${sl}" en layout anterior (${legacy}); movelo a ${company}\n`);
    return { file: legacy, scope: sl };
  }
  const repo = path.join(REPO_KITS, sl + ".json");
  if (fs.existsSync(repo)) return { file: repo, scope: null };
  return null;
}
function availableKitNames() {
  return Object.keys(allKitsRaw()).sort();
}
function allKitsRaw() {
  const out = {};
  if (fs.existsSync(BRAND_DIR)) {
    for (const sl of fs.readdirSync(BRAND_DIR).filter((x) => !x.startsWith("."))) {
      const f = companyKitFile(sl);
      if (!fs.existsSync(f) || out[sl]) continue;
      try {
        out[sl] = { kit: JSON.parse(fs.readFileSync(f, "utf8")), source: "personal", scope: sl };
      } catch {
        out[sl] = { kit: null, source: "personal", broken: f };
      }
    }
  }
  if (fs.existsSync(LEGACY_KITS)) {
    for (const f of fs.readdirSync(LEGACY_KITS).filter((x) => x.endsWith(".json"))) {
      const sl = f.replace(/\.json$/, "");
      if (out[sl]) continue;
      try {
        out[sl] = { kit: JSON.parse(fs.readFileSync(path.join(LEGACY_KITS, f), "utf8")), source: "personal-legacy", scope: sl };
      } catch {
        out[sl] = { kit: null, source: "personal-legacy", broken: f };
      }
    }
  }
  if (fs.existsSync(REPO_KITS)) {
    for (const f of fs.readdirSync(REPO_KITS).filter((x) => x.endsWith(".json"))) {
      const sl = f.replace(/\.json$/, "");
      if (out[sl]) continue;
      try {
        out[sl] = { kit: JSON.parse(fs.readFileSync(path.join(REPO_KITS, f), "utf8")), source: "repo", scope: null };
      } catch {
        out[sl] = { kit: null, source: "repo", broken: f };
      }
    }
  }
  return out;
}
function loadImageDataURL(ref, scope) {
  let p = String(ref);
  if (/^file:/.test(p)) p = p.replace(/^file:(\/\/)?/, "");
  p = expandHome(p);
  if (!path.isAbsolute(p)) {
    const scoped = scope ? path.join(BRAND_DIR, scope, p) : null;
    if (scoped && fs.existsSync(scoped)) p = scoped;
    else p = path.join(BRAND_DIR, p);
  }
  if (!fs.existsSync(p)) throw new Error(`Logo no encontrado: ${p}. Rutas relativas se buscan en la carpeta de la empresa (~/.carousel-generator/brand/{empresa}/) y luego en ~/.carousel-generator/brand/.`);
  const ext = path.extname(p).toLowerCase();
  const mime = IMG_EXTS[ext];
  if (!mime) throw new Error(`Formato de logo no soportado: "${ext}". Usá PNG, JPG, WEBP, GIF o SVG.`);
  return `data:${mime};base64,` + fs.readFileSync(p).toString("base64");
}
function resolveLogo(kit, scope) {
  const l = kit && kit.logo;
  if (l && typeof l.imagePath === "string" && l.imagePath.trim()) {
    l.img = loadImageDataURL(l.imagePath.trim(), scope);
    delete l.imagePath;
  }
  return kit;
}
function resolveKit(name, inline) {
  let base, scope = null;
  if (!name) {
    const kits = allKitsRaw();
    const firstUserKit = Object.values(kits).find((k) => k && k.kit && (k.source === "personal" || k.source === "injected"));
    if (firstUserKit) { base = JSON.parse(JSON.stringify(firstUserKit.kit)); scope = firstUserKit.scope; }
    else base = clone(DEFAULT_KIT);
  } else {
    const found = findKitFile(name);
    if (!found) {
      const avail = availableKitNames();
      throw new Error(`Brand kit "${name}" no existe. Disponibles: ${avail.length ? avail.join(", ") : "(ninguno)"}. Usá save_brand_kit para crear uno.`);
    }
    base = JSON.parse(fs.readFileSync(found.file, "utf8"));
    scope = found.scope;
  }
  if (inline && typeof inline === "object") {
    base = deepMerge(base, inline);
    if (inline.name) scope = slug(inline.name);
  }
  if (!scope && base && base.name) scope = slug(base.name);
  return resolveLogo(base, scope);
}
function brandKitsPayload() {
  const out = {};
  for (const [sl, entry] of Object.entries(allKitsRaw())) {
    if (!entry.kit) continue;
    try { out[sl] = resolveLogo(clone(entry.kit), entry.scope || sl); }
    catch (e) { process.stderr.write(`[carousel-mcp] kit "${sl}" sin logo (${e.message})\n`); out[sl] = entry.kit; }
  }
  return out;
}

function normSlideArg(s) {
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
      const fp = expandHome(background.replace(/^file:(\/\/)?/, ""));
      if (!fs.existsSync(fp)) throw new Error(`Foto no encontrada: ${fp}`);
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

const MAX_LIST_ITEMS = 3;
const PHOTO_REVIEW_PROTOCOL = [
  "PHOTO REVIEW PROTOCOL (ejecutalo antes de entregar el carrusel al usuario):",
  "1. VERIFY — para cada slide con foto: abrí/miniaturizá la imagen y verificá VISUALMENTE que coincida con el mensaje de la slide (kicker/título/body).",
  "2. REPLACE — si una foto no tiene sentido (infografía, logo, fuera de tema):",
  "   a. usá la query sugerida en photoNeeds (o refinála),",
  "   b. buscá fotos de stock con websearch (licencia libre: Unsplash/Pexels),",
  "   c. descargá la candidata y VERIFICALA VISUALMENTE antes de aplicarla,",
  "   d. aplicala con set_slide_photo(company, slug, slide, source).",
  "3. RE-AUDIT — volvé a correr review_slide_images y confirmá que cada slide tiene una foto coherente.",
  "Nunca entregues un carrusel con fotos sin verificar.",
].join("\n");
function boldifyData(text) {
  let t = String(text == null ? "" : text);
  if (!t || /\*\*|==/.test(t)) return t;
  const RE = /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*(?:\s?(?:millones|millón|miles|mil|MM)|\s?[Mm](?![a-záéíóúñ]))?|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s?(?:millones|millón|miles|mil|meses|mes|años|días|horas|puntos|personas|toneladas)\b|\b(?:[Dd]os|[Tt]res|[Cc]uatro|[Cc]inco|[Ss]eis|[Ss]iete|[Oo]cho|[Nn]ueve|[Dd]iez|[Oo]nce|[Dd]oce)\s+(?:meses|mes|años|días|semanas|puntos|personas|millones|miles)\b/gi;
  return t.replace(RE, (m) => `**${m.trim()}**`);
}
function applyBoldify(slides) {
  const walk = (nodes) => { for (const el of nodes || []) { if (el.type === "body") el.text = boldifyData(el.text); if (el.children) walk(el.children); } };
  for (const s of slides) {
    s.paragraphs = (s.paragraphs || []).map(boldifyData);
    walk(s.elements);
  }
  return slides;
}
// Regla de estilo de textos (lint advisory, no bloqueante): prohíbe muletillas
// típicas de IA en titulares y copys — raya larga (—), contrastes "no es X, es Y"
// y clichés. Devuelve [{slide, field, rule, detail, excerpt}] para que el agente corrija.
const STYLE_CLICHES = ["en un mundo", "cabe destacar", "es importante destacar", "es importante señalar", "no cabe duda", "al siguiente nivel", "punto de inflexión"];
function hasNoEsContrast(t) {
  const re = /\bno\s+(?:es|son|fue|fueron|será|serán|era|eran)\b|\bno\s+s[oó]lo\b/ig;
  let m;
  while ((m = re.exec(t))) {
    const rest = t.slice(m.index + m[0].length).split(/[.!?…\n]/, 1)[0].slice(0, 80);
    if (/\bsino\b/i.test(rest) || /\b(?:es|son)\b/i.test(rest)) return true;
  }
  return false;
}
function excerptText(t) {
  const s = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  return s.length > 70 ? s.slice(0, 67).trimEnd() + "…" : s;
}
function lintSlideTexts(slides) {
  const out = [];
  const label = { kicker: "kicker", text: "título", highlight: "highlight", body: "body", slogan: "slogan", foot: "foot" };
  const check = (slide, field, text) => {
    const t = String(text || "");
    if (!t) return;
    if (t.includes("—")) out.push({ slide, field, rule: "raya-larga", detail: "raya larga (—): usá coma, punto o guion corto (-)", excerpt: excerptText(t) });
    if (hasNoEsContrast(t)) out.push({ slide, field, rule: "contraste-no-es", detail: "contraste 'no es X, es Y' / 'no solo X, sino Y': afirmá directo, sin negar primero", excerpt: excerptText(t) });
    const cliche = STYLE_CLICHES.find((c) => t.toLowerCase().includes(c));
    if (cliche) out.push({ slide, field, rule: "cliche", detail: `cliché de IA ("${cliche}"): reformulá con palabras propias`, excerpt: excerptText(t) });
  };
  (slides || []).forEach((s, i) => {
    const walk = (nodes) => {
      for (const el of nodes || []) {
        if (label[el.type]) check(i + 1, label[el.type], el.text);
        else if (el.type === "item") { check(i + 1, "item (título)", el.title); check(i + 1, "item (desc)", el.desc); }
        if (el.children) walk(el.children);
      }
    };
    walk(s.elements);
  });
  return out;
}
function formatStyleWarnings(warnings) {
  if (!warnings.length) return [];
  return ["", "Advertencias de estilo (regla de textos: sin raya larga —, sin 'no es X, es Y', sin clichés de IA):",
    ...warnings.map((w) => `  - slide ${w.slide} (${w.field}): ${w.detail} en "${w.excerpt}"`)];
}
function applyCategoryColors(slides, kit, category) {
  if (!category) return slides;
  const color = kit && kit.highlightColors && kit.highlightColors[category];
  if (!color) return slides;
  const walk = (nodes) => {
    for (const el of nodes || []) {
      if (el.type === "highlight") {
        el.style = el.style || {};
        if (!el.style.background) el.style.background = color;
      }
      if (el.children) walk(el.children);
    }
  };
  for (const s of slides) walk(s.elements);
  return slides;
}
function detectCategory(html) {
  const section = metaContent(html, "property", "article:section");
  if (section && section.trim()) return { category: decodeEntities(section.trim()), source: "article:section" };
  const ldMatches = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldMatches) {
    try {
      const raw = block.replace(/<\/?script[^>]*>/gi, "").trim();
      const data = JSON.parse(raw);
      const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
      for (const node of graph) {
        if (node && node["@type"] === "BreadcrumbList" && Array.isArray(node.itemListElement)) {
          const names = node.itemListElement.map((x) => {
            const it = x && (x.item || x);
            return it && (typeof it === "string" ? it : (it.name || (typeof it.item === "string" ? null : it.item && it.item.name)));
          }).filter(Boolean).map((n) => String(n).trim());
          const pick = names.filter((n) => n && !/^(home|inicio|portada|principal)$/i.test(n) && !/^https?:/i.test(n)).pop();
          if (pick) return { category: decodeEntities(pick), source: "BreadcrumbList" };
        }
      }
    } catch {}
  }
  const bodyHtml = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const mainHtml = (bodyHtml.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i) || [bodyHtml])[1] || bodyHtml;
  const counts = {};
  const re = /<a[^>]+href=["'][^"']*\/(?:categor(?:y|ies|ia|ias)|secci[oó]n|seccion|tema|tags?)\/([a-z0-9\-_%]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(mainHtml))) {
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).trim();
    const key = (label || decodeURIComponent(m[1]).replace(/-/g, " ")).toLowerCase();
    if (!key || key.length > 40) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best) return { category: best[0].replace(/\b\w/g, (c) => c.toUpperCase()), source: "taxonomy-links" };
  return null;
}
function findItemsBlock(slide) {
  for (const el of slide.elements || []) {
    if (el.type === "items") return el;
    for (const ch of el.children || []) if (ch.type === "items") return ch;
  }
  return null;
}
function partitionListSlides(slides) {
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

function decodeEntities(t) {
  return String(t || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (x, n) => { try { return String.fromCodePoint(+n); } catch { return x; } })
    .replace(/\s+/g, " ").trim();
}
function imageSize(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(off + 7), h: buf.readUInt16BE(off + 5) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}
const BAD_IMG_HINTS = /flyer|infograf|logo|banner|icon|sprite|avatar|emoji|badge|placeholder|\bads?[-_/]|pixel|tracking/i;
const DATA_FIG_RE = /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d[\d.,]*(?:\s?(?:millones|millón|miles|mil))\b/i;
function normalizeImageUrl(raw, pageUrl) {
  let u = String(raw || "").trim();
  if (!u || u.startsWith("data:")) return null;
  try {
    const parsed = new URL(u, pageUrl);
    if (/\/_next\/image$/.test(parsed.pathname)) {
      const inner = parsed.searchParams.get("url");
      if (inner) return new URL(decodeURIComponent(inner), pageUrl).href;
    }
    return parsed.href;
  } catch { return null; }
}
function extractArticle(html, pageUrl) {
  const u = new URL(pageUrl);
  const site = metaContent(html, "property", "og:site_name") || u.hostname.replace(/^www\./, "");
  const title = decodeEntities(metaContent(html, "property", "og:title") || (html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i) || [])[1] || "");
  const dek = decodeEntities(metaContent(html, "property", "og:description") || metaContent(html, "name", "description") || "");
  const ogImage = metaContent(html, "property", "og:image") || metaContent(html, "name", "twitter:image") || "";
  const bodyHtml = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const clean = (raw) => decodeEntities(String(raw || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " "));
  const paras = [];
  const pre = /<(?:p|h2|h3)[^>]*>([\s\S]*?)<\/(?:p|h2|h3)>/gi;
  let m;
  while ((m = pre.exec(bodyHtml))) {
    const txt = clean(m[1]);
    if (txt.length >= 80 && txt.length <= 600 && paras.length < 40) paras.push(txt);
  }
  const items = [];
  const lis = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = lis.exec(bodyHtml))) {
    const txt = clean(m[1]);
    if (txt.length >= 15 && txt.length <= 140 && items.length < 12) items.push(txt);
  }
  const imgs = [];
  const imgRe = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
  while ((m = imgRe.exec(bodyHtml))) { const n = normalizeImageUrl(m[1], pageUrl); if (n) imgs.push(n); }
  const wpRe = /(?:https?:\/\/)?(?:i\d|wp\d?|s\d)?\.?wp\.com\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp)/gi;
  while ((m = wpRe.exec(html))) {
    let u2 = m[0];
    if (!/^https?:\/\//i.test(u2)) u2 = "https://" + u2;
    const n = normalizeImageUrl(u2, pageUrl);
    if (n) imgs.push(n);
  }
  return { site, title, dek, ogImage: normalizeImageUrl(ogImage, pageUrl) || "", paras, items, imgs: [...new Set(imgs)] };
}
function pickPhotoCandidates(article) {
  const out = [];
  const seen = new Set();
  for (const raw of [article.ogImage, ...article.imgs].filter(Boolean)) {
    let u = raw;
    if (seen.has(u)) continue;
    seen.add(u);
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
    if (BAD_IMG_HINTS.test(u)) continue;
    if (/w=\d+/.test(u)) u = u.replace(/w=\d+/, "w=1920");
    out.push(u);
    if (out.length >= 8) break;
  }
  return out;
}
async function downloadPhotoToTmp(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await globalThis.fetch(url, { signal: ctl.signal, headers: { "User-Agent": "carousel-generator/2.2 (+carousel-from-url)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) throw new Error(`no es imagen (${ct})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 15000) throw new Error("imagen muy chica (¿icono?)");
    if (buf.length > 6000000) throw new Error("imagen mayor a 6MB");
    const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
    const dir = path.join(os.tmpdir(), "carousel-from-url");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    fs.writeFileSync(file, buf);
    return file;
  } finally { clearTimeout(t); }
}
function splitTitleForCover(t) {
  const words = String(t).trim().split(/\s+/);
  if (words.length <= 3) return { white: words.join(" ").toUpperCase(), orange: "" };
  const target = Math.max(2, Math.round(words.length * 0.4));
  let idx = target;
  for (let i = target; i < Math.min(words.length, target + 4); i++) {
    if (/%|\d|millones/i.test(words[i])) { idx = i + 1; break; }
  }
  return { white: words.slice(0, idx).join(" ").toUpperCase(), orange: words.slice(idx).join(" ").toUpperCase() };
}
const LIST_EMOJIS = ["✅", "📈", "🔎", "💡", "⚙️", "🤝", "🌍", "📊", "🧭", "🚀", "🏷️", "📞"];
async function toolCarouselFromURL(args) {
  const a = args || {};
  if (!a.url) throw new Error("Falta `url`.");
  const pageUrl = new URL(a.url).href;
  const html = await fetchBrandHTML(pageUrl);
  const art = extractArticle(html, pageUrl);
  if (!art.title) throw new Error("No se pudo extraer el título de la nota.");
  const company = slug(a.company || art.site);
  const carouselName = slug(a.carouselName || a.fileName || art.title);
  const cover = splitTitleForCover(art.title);
  const figParas = art.paras.filter((p) => DATA_FIG_RE.test(p));
  const otherParas = art.paras.filter((p) => !figParas.includes(p));
  const slides = [
    { template: "cover", eyebrow: art.site.toUpperCase(), titleWhite: cover.white, titleOrange: cover.orange, paragraphs: [art.dek].filter(Boolean) },
  ];
  figParas.slice(0, 2).forEach((p, i) => {
    const fig = (p.match(DATA_FIG_RE) || [])[0] || "";
    const words = p.split(/\s+/);
    slides.push({
      template: "fact",
      eyebrow: i === 0 ? "EL DATO" : "EL CONTEXTO",
      titleWhite: words.slice(0, 3).join(" ").toUpperCase(),
      titleOrange: fig.toUpperCase(),
      paragraphs: [p.length > 220 ? p.slice(0, 217).trimEnd() + "…" : p],
    });
  });
  if (art.items.length >= 3) {
    slides.push({
      template: "list",
      eyebrow: "CLAVES DE LA NOTA",
      titleWhite: "LOS PUNTOS",
      titleOrange: "A SEGUIR",
      items: art.items.slice(0, 9).map((t, i) => ({ emoji: LIST_EMOJIS[i % LIST_EMOJIS.length], title: t.length > 70 ? t.slice(0, 67).trimEnd() + "…" : t, desc: "" })),
    });
  }
  if (otherParas.length) {
    const p = otherParas[0];
    slides.push({ template: "fact", eyebrow: "PARA TENER EN CUENTA", titleWhite: p.split(/\s+/).slice(0, 3).join(" ").toUpperCase(), titleOrange: "EL CONTEXTO", paragraphs: [p.length > 220 ? p.slice(0, 217).trimEnd() + "…" : p] });
  }
  slides.push({
    template: "cta",
    eyebrow: "SEGUÍ LA NOTA",
    titleWhite: "NOTA COMPLETA EN",
    titleOrange: art.site.toUpperCase(),
    paragraphs: [],
    ctaBox: { title: "LEER LA NOTA", text: pageUrl },
  });
  // Fotos: candidatos del artículo → asignar por orden; slides sin foto → photoNeeds
  const candidates = pickPhotoCandidates(art);
  const detected = detectCategory(html);
  const assigned = [];
  const photoNeeds = [];
  const slots = [];
  for (let i = 0; i < slides.length; i++) if (["cover", "fact", "list"].includes(slides[i].template)) slots.push(i);
  let ci = 0;
  for (const si of slots) {
    let file = null, src = null;
    while (ci < candidates.length && !file) {
      try { file = await downloadPhotoToTmp(candidates[ci]); src = candidates[ci]; }
      catch (e) { process.stderr.write(`[carousel-from-url] foto descartada ${candidates[ci]}: ${(e && e.message) || e}\n`); ci++; }
    }
    if (file) {
      slides[si].background = `file:${file}`;
      slides[si].scrim = slides[si].template === "cover" ? 55 : 50;
      slides[si].bgPos = "center";
      assigned.push({ slide: si + 1, source: src });
      ci++;
    } else {
      photoNeeds.push({ slide: si + 1, template: slides[si].template, query: `${art.title} ${slides[si].eyebrow}`.trim() });
    }
  }
  if (!photoNeeds.length && !assigned.length) {
    photoNeeds.push({ slide: 1, template: "cover", query: art.title });
  }
  const runtime = runtimeDataFromArgs({ ...a, title: art.title, company, carouselName, slides, category: a.category || detected && detected.category });
  let persisted = null;
  if (a.persist !== false) persisted = persistCarousel(runtime, company, carouselName);
  const file = renderCarousel(runtime, a);
  const lines = [
    `Carrusel desde URL creado (${runtime.slides.length} slides):`,
    file,
    `JSON persistido: ${persisted ? persisted.file : "no (persist:false)"}`,
    "",
    detected
      ? `Categoría detectada: "${runtime.meta.category || detected.category}" (señal: ${detected.source})${runtime.kit.highlightColors && runtime.kit.highlightColors[runtime.meta.category || detected.category] ? ` → highlight: ${runtime.kit.highlightColors[runtime.meta.category || detected.category]}` : " (sin color en kit.highlightColors — se usa el primario)"}`
      : "Categoría no detectada — seteá meta.category manualmente si el kit define highlightColors.",
    "",
    `Fotos del artículo asignadas: ${assigned.length ? assigned.map((x) => `slide ${x.slide} ← ${x.source}`).join("; ") : "(ninguna candidata válida)"}`,
  ];
  if (photoNeeds.length) {
    lines.push("", "photoNeeds (slides sin foto coherente):");
    for (const n of photoNeeds) lines.push(`  - slide ${n.slide} (${n.template}) → query sugerida: "${n.query}"`);
  }
  lines.push("", "IMPORTANTE — Verificá cada foto asignada con visión (descargá/miniaturizá y confirmá que coincide con el mensaje de la slide).", PHOTO_REVIEW_PROTOCOL);
  lines.push(...formatStyleWarnings(lintSlideTexts(runtime.slides)));
  return lines.join("\n");
}
function slideMetaForReview(stored, dir) {
  const out = [];
  (stored.slides || []).forEach((s, i) => {
    const texts = { kicker: "", title: "", highlight: "", body: "" };
    const walk = (nodes) => {
      for (const b of nodes || []) {
        if (b.type === "kicker" && !texts.kicker) texts.kicker = b.text;
        if (b.type === "text" && !texts.title) texts.title = b.text;
        if (b.type === "highlight" && !texts.highlight) texts.highlight = b.text;
        if (b.type === "body" && !texts.body) texts.body = b.text;
        if (b.children) walk(b.children);
      }
    };
    walk(s.elements);
    let photo = null;
    if (s.bg && s.bg.type === "photo" && s.bg.asset) {
      const f = path.resolve(dir, s.bg.asset);
      if (fs.existsSync(f)) {
        const dim = imageSize(f);
        photo = { file: f, dimensions: dim ? `${dim.w}x${dim.h}` : null, asset: s.bg.asset, scrim: s.bg.scrim };
      }
    }
    out.push({ slide: i + 1, id: s.id, template: s.template, ...texts, photo, hasPhoto: !!photo });
  });
  return out;
}
function toolReviewSlideImages(args) {
  const a = args || {};
  const company = slug(a.company || "");
  const name = slug(a.name || a.slug || "");
  if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
  const record = readCarousel(company, name);
  const slides = slideMetaForReview(record.stored, record.dir);
  const photoNeeds = slides.filter((s) => !s.hasPhoto).map((s) => ({
    slide: s.slide,
    template: s.template,
    query: [s.title, s.highlight, s.kicker].filter(Boolean).join(" ") || s.template,
  }));
  return JSON.stringify({ company, slug: name, slides, photoNeeds, protocol: PHOTO_REVIEW_PROTOCOL }, null, 2);
}
function toolDeleteCarousel(args) {
  const a = args || {};
  const company = slug(a.company || "");
  const name = slug(a.name || a.slug || "");
  if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
  const dir = path.resolve(CAROUSEL_DIR, company, name);
  if (dir !== CAROUSEL_DIR && !dir.startsWith(CAROUSEL_DIR + path.sep)) throw new Error("Ruta inválida (fuera del directorio de carruseles).");
  if (!fs.existsSync(path.join(dir, "carousel.json"))) throw new Error(`Carrusel "${company}/${name}" no existe.`);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, "carousel.json"), "utf8"));
  if (!a.confirm) {
    let sizeBytes = 0;
    try { for (const f of fs.readdirSync(dir)) sizeBytes += fs.statSync(path.join(dir, f)).size; } catch {}
    return JSON.stringify({
      company, name,
      title: stored.meta && stored.meta.title,
      slides: (stored.slides || []).length,
      updatedAt: stored.updatedAt,
      folder: dir,
      sizeBytes,
      deleted: false,
      hint: "Llamá de nuevo con confirm:true para borrar permanentemente esta carpeta y sus assets.",
    }, null, 2);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return `Carrusel "${company}/${name}" eliminado (${dir}).`;
}

async function toolSetSlidePhoto(args) {
  const a = args || {};
  const company = slug(a.company || "");
  const name = slug(a.name || a.slug || "");
  if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
  const record = readCarousel(company, name);
  const stored = record.stored;
  const idx = (Math.max(1, +a.slide || +a.slideIndex || 1)) - 1;
  const slide = (stored.slides || [])[idx];
  if (!slide) throw new Error(`Slide ${idx + 1} inexistente (${(stored.slides || []).length} slides).`);
  const src = String(a.source || "");
  if (!src) throw new Error("Falta `source` (URL http(s) o ruta local).");
  let tmpFile = null, file;
  if (/^https?:\/\//i.test(src)) { tmpFile = await downloadPhotoToTmp(src); file = tmpFile; }
  else {
    file = expandHome(src.replace(/^file:(\/\/)?/, ""));
    if (!fs.existsSync(file)) throw new Error(`Archivo no encontrado: ${file}`);
  }
  const assetsDir = path.join(record.dir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const ext = (path.extname(file).toLowerCase() || ".jpg").replace(".", "");
  const assetId = `${slide.id || "slide-" + (idx + 1)}-background`;
  const dest = path.join(assetsDir, `${assetId}.${ext}`);
  fs.copyFileSync(file, dest);
  slide.bg = { ...(slide.bg || {}), type: "photo", asset: `assets/${assetId}.${ext}` };
  delete slide.bg.src; delete slide.bg.css; delete slide.bg.value;
  if (a.scrim !== undefined) slide.bg.scrim = Math.max(0, Math.min(85, +a.scrim || 0));
  if (a.bgPos) slide.bg.bgPos = String(a.bgPos).trim() || "center";
  stored.assets = (stored.assets || []).filter((x) => x.id !== assetId);
  const dim = imageSize(dest);
  stored.assets.push({ id: assetId, file: `assets/${assetId}.${ext}`, kind: "photo", mime: ext === "png" ? "image/png" : "image/jpeg", width: dim ? dim.w : null, height: dim ? dim.h : null });
  stored.updatedAt = new Date().toISOString();
  fs.writeFileSync(record.file, JSON.stringify(stored, null, 2), "utf8");
  if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch {} }
  const runtime = hydrateCarousel(stored, record.dir);
  const html = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName || `${name}-photo-${idx + 1}`, open: a.open !== false });
  return `Foto actualizada en slide ${idx + 1} de ${company}/${name}.\nImagen: ${dest}${dim ? ` (${dim.w}x${dim.h})` : ""}\nPreview: ${html}\n\nPaso 3 del protocolo: re-auditá con review_slide_images antes de entregar.\n${PHOTO_REVIEW_PROTOCOL}`;
}

const tools = [
  {
    name: "generate_carousel",
    description:
      "Genera un carrusel HTML editable y lo abre. La definición se persiste por defecto como carousel.json v2 en un árbol nested de bloques (brand, stack, text, highlight, body, items, box, etc.) con posiciones, tamaños, estilos y assets referenciados por archivo. El HTML incluye TODOS los brand kits guardados para cambiar de kit en vivo. La respuesta incluye advertencias de estilo si los textos usan raya larga (—), contrastes 'no es X, es Y' o clichés de IA: corregilos.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del carrusel (se usa en el header y en los nombres de archivo al exportar). Default: 'Carrusel'." },
        fileName: { type: "string", description: "Nombre base del archivo HTML (sin extensión). Default: slug del title + timestamp." },
        carouselName: { type: "string", description: "Slug persistido del carrusel dentro de ~/.carousel-generator/carousels/{company}/." },
        company: { type: "string", description: "Empresa/brand slug que agrupa el carrusel. Default: kitName o nombre del kit." },
        outputDir: { type: "string", description: "Directorio de salida. Acepta ~. Default: ~/Downloads." },
        format: { type: "string", enum: ["feed", "square", "story"], description: "Formato inicial: feed (4:5, 1080x1350, default), square (1:1, 1080x1080 para IG/LinkedIn), story (9:16, 1080x1920 para stories/reels/TikTok). Se puede cambiar en vivo en el editor." },
        showNumbers: { type: "boolean", description: "Muestra el chip de numeración N/M arriba a la derecha de cada slide (default true). Pasá false para un look limpio sin números." },
        category: { type: "string", description: "Categoría de la nota (ej: Turismo, Diplomacia, Comercio Internacional). Si el kit define highlightColors[category], los bloques highlight sin override usan ese color de fondo. Se guarda en meta.category." },
        persist: { type: "boolean", description: "Guarda carousel.json v2 y copia los assets en ~/.carousel-generator/carousels/{company}/{carouselName}/. Default true." },
        kitName: { type: "string", description: "Nombre del brand kit (ver list_brand_kits). Se busca en ~/.carousel-generator/brand/{empresa}/kit.json y luego en mcp/kits/ del repo. Default: primer kit del usuario, o Default si no hay ninguno." },
        kit: { type: "object", description: "Brand kit inline (se mergea sobre el kit base): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, logoBackground, logoShape, logoSize, photoOverlay:{enabled,css}, gradients:[{name,css,light}] }. logo.imagePath: ruta de logo — 'logo.png' relativo a la carpeta de la empresa (~/.carousel-generator/brand/{empresa}/), o 'file:' + ruta absoluta. Se embebe en base64. logoBackground: color de fondo del logo (ej: '#fff', 'transparent'). Default: transparent. logoShape: forma del fondo del logo ('square' o 'rectangular'). Default: square. logoSize: tamaño del logo en px (default: 43). photoOverlay: gradiente entre foto y texto {enabled:boolean, css:string}. Default: gradiente oscuro inferior." },
        slides: {
          type: "array",
          description: "Slides del carrusel. Si se omite, genera 5 slides default (una de cada plantilla).",
          items: {
            type: "object",
            properties: {
              template: { type: "string", enum: TEMPLATES, description: "Plantilla base: cover (portada con título hero φ³), fact (dato + items), map (pills de ubicación, fondo claro), list (items con emoji), cta (cierre con box de marca)." },
              eyebrow: { type: "string", description: "Kicker superior en mayúsculas." },
              titleWhite: { type: "string", description: "Formato legacy. Preferí elements con un bloque text blanco más chico; no mezcles el resaltado naranja inline." },
              titleOrange: { type: "string", description: "Formato legacy. Preferí elements con un bloque highlight naranja más grande debajo del text blanco." },
              paragraphs: { type: "array", items: { type: "string" }, description: "Párrafos. Soporta **negrita** y ==resaltado==." },
              items: { type: "array", items: { type: "object", properties: { emoji: { type: "string" }, title: { type: "string" }, desc: { type: "string" } } }, description: "Items con emoji (grilla icono + título + descripción)." },
              pills: { type: "array", items: { type: "object", properties: { text: { type: "string" }, top: { type: "number" }, side: { type: "string", enum: ["left", "right"] }, offset: { type: "number" } } }, description: "Pills de ubicación (para template map)." },
              ctaBox: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, description: "Box de marca del cierre." },
              slogan: { type: "string", description: "Slogan final en mayúsculas." },
              foot: { type: "string", description: "Texto chico del pie." },
              background: { type: "string", description: "Nombre de un gradient del kit ('navy','dusk','mapa',...), CSS de linear-gradient completo, o 'file:' + ruta local a una foto (ej: 'file:/tmp/foto.jpg', acepta ~) que se embebe como background." },
              overlayLight: { type: "boolean", description: "Fondo claro con texto oscuro (estilo mapa)." },
              scrim: { type: "number", description: "Velo de opacidad oscura sobre foto (0-85, default 45 en fotos). Capa sólida html2canvas-safe para que el texto no se pierda." },
              bgPos: { type: "string", description: "Punto focal de la foto: 'center', 'center 30%', 'top', 'left bottom', etc. Evita que el sujeto quede cortado al cambiar de formato." },
              align: { type: "object", description: "Alineación por bloque: {eyebrow,title,body} cada uno left|center|right (default left).", properties: { eyebrow: { type: "string" }, title: { type: "string" }, body: { type: "string" } } },
              copyPos: { type: "object", description: "Posición estructurada del bloque de texto: {anchor: top|center|bottom, offset: -10..10}.", properties: { anchor: { type: "string" }, offset: { type: "number" } } },
              elements: { type: "array", description: "Árbol nested v2. Cada nodo es {id,type,style,pos,text,children}; tipos: brand,count,stack,kicker,text,highlight,body,items,item,box,pill,slogan,foot. Si se pasa, reemplaza la forma plana y se persiste tal cual normalizada." },
            },
          },
        },
      },
    },
  },
  {
    name: "list_carousels",
    description: "Lista los carouseles persistidos por empresa en ~/.carousel-generator/carousels/. Devuelve company, slug, título, formato, cantidad de slides, fecha y ruta JSON para elegir cuál cargar.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "load_carousel",
    description: "Carga un carousel.json v2 por empresa/slug, resuelve sus assets, genera un HTML editable y lo abre. Devuelve el JSON nested completo más las rutas render/json. Usalo para inspeccionar y refinar un carrusel existente.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug del carrusel." },
        slug: { type: "string", description: "Alias de name." },
        outputDir: { type: "string", description: "Directorio del HTML renderizado. Default ~/Downloads." },
        fileName: { type: "string", description: "Nombre del HTML renderizado." },
        open: { type: "boolean", description: "Abrir el HTML en navegador. Default true." },
      },
      required: ["company"],
    },
  },
  {
    name: "save_carousel",
    description: "Guarda o mergea un carousel.json v2 nested. Acepta carousel completo, slides nested o legacy; copia fotos/logo data URL o file: a assets/ y nunca guarda base64 en carousel.json. Sirve para el ciclo load -> refinar -> save. Devuelve styleWarnings si los textos usan raya larga (—), contrastes 'no es X, es Y' o clichés de IA: corregilos.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug persistido del carrusel." },
        slug: { type: "string", description: "Alias de name." },
        carousel: { type: "object", description: "Objeto carousel.json v2 completo, incluyendo meta, kit y slides." },
        slides: { type: "array", description: "Slides nested o legacy para crear/actualizar el carrusel." },
        meta: { type: "object", description: "Meta parcial: title, format, showCount." },
        kit: { type: "object", description: "Snapshot de brand kit opcional." },
      },
      required: ["company", "name"],
    },
  },
  {
    name: "save_brand_kit",
    description: "Guarda un brand kit en ~/.carousel-generator/brand/{empresa}/kit.json para reutilizarlo con generate_carousel y verlo en el picker multi-kit del editor. Acepta logo.imagePath (ruta de imagen relativa a la carpeta de la empresa, o 'file:' + absoluta) que se embebe en base64 dentro del kit. Si el kit ya existe, se mergea sobre él.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre/slug del kit (a-z, 0-9, -)." },
        kit: {
          type: "object",
          description: "El kit (completo o parcial): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, logoBackground, logoShape, logoSize, photoOverlay:{enabled,css}, gradients:[{name,css,light}] }.",
        },
      },
      required: ["name", "kit"],
    },
  },
  {
    name: "list_brand_kits",
    description: "Lista los brand kits disponibles: primero las carpetas de empresa en ~/.carousel-generator/brand/ (personales), luego mcp/kits/ del repo (ejemplos). Los personales tienen prioridad ante colisiones de nombre.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "load_brand_kit",
    description: "Devuelve el JSON completo de un brand kit guardado (busca en ~/.carousel-generator/brand/{empresa}/kit.json y en mcp/kits/ del repo).",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "brand_kit_from_url",
    description:
      "Genera un brand kit desde la homepage de un sitio (fetch + heurística, sin dependencias) y lo guarda en ~/.carousel-generator/brand/{empresa}/kit.json. Extrae nombre, theme-color, colores frecuentes, Google Fonts y logo/favicon. Devuelve resumen con confianza por campo y qué revisar. Loop de ajuste: previsualizá con generate_carousel (kitName) y refiná con save_brand_kit pasando solo los campos a cambiar (ej: {\"colors\":{\"primary\":\"#ff5a00\"}}).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL http(s) del sitio (se analiza solo la homepage)." },
        name: { type: "string", description: "Slug/nombre del kit. Default: og:site_name, <title> o hostname." },
        save: { type: "boolean", description: "Guardar en ~/.carousel-generator/brand/{empresa}/kit.json (default true). Con false solo devuelve el JSON inferido sin guardar." },
      },
      required: ["url"],
    },
  },
  {
    name: "carousel_from_url",
    description:
      "Crea un carrusel borrador desde la URL de una nota/artículo (fetch + extracción de título, bajada, datos e imágenes). Aplica boldifyData (negrita automática a cifras) y particiona listas a ≤3 items. Asigna fotos del artículo por heurística (descarta infografías/logos) y devuelve photoNeeds (slides sin foto + query sugerida). La respuesta incluye el PHOTO REVIEW PROTOCOL: el agente DEBE verificar visualmente cada foto, reemplazar las que no tienen sentido con stock (websearch) usando set_slide_photo, y re-auditar con review_slide_images antes de entregar.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL http(s) de la nota/artículo." },
        company: { type: "string", description: "Slug de empresa. Default: og:site_name o hostname." },
        kitName: { type: "string", description: "Brand kit a usar (ver list_brand_kits). Si se omite, usa el primer kit personal o Default." },
        carouselName: { type: "string", description: "Slug persistido del carrusel. Default: slug del título." },
        format: { type: "string", enum: ["feed", "square", "story"], description: "Formato (default feed 4:5)." },
        persist: { type: "boolean", description: "Guardar carousel.json (default true)." },
        outputDir: { type: "string", description: "Directorio del HTML. Default ~/Downloads." },
        fileName: { type: "string", description: "Nombre base del HTML." },
        open: { type: "boolean", description: "Abrir el HTML (default true)." },
      },
      required: ["url"],
    },
  },
  {
    name: "delete_carousel",
    description:
      "Elimina permanentemente un carrusel persistido (carpeta carousel.json + assets). Seguro en dos pasos: sin confirm:true devuelve un preview de lo que se va a borrar sin tocar nada; con confirm:true ejecuta el borrado. Pedi confirmación al usuario antes de usar confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug del carrusel (alias: slug)." },
        slug: { type: "string", description: "Alias de name." },
        confirm: { type: "boolean", description: "false (default): solo muestra el preview. true: borra permanentemente." },
      },
      required: ["company", "name"],
    },
  },
  {
    name: "review_slide_images",
    description:
      "Audita las fotos de un carrusel persistido: por slide devuelve textos (kicker/título/highlight/body), la foto asignada (ruta, dimensiones, scrim) y photoNeeds con queries sugeridas para las slides sin foto. La respuesta incluye el PHOTO REVIEW PROTOCOL para que el agente verifique visualmente, reemplace con stock y re-audite.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug del carrusel (alias: slug)." },
        slug: { type: "string", description: "Alias de name." },
      },
      required: ["company"],
    },
  },
  {
    name: "set_slide_photo",
    description:
      "Reemplaza la foto de fondo de una slide de un carrusel persistido. Acepta URL http(s) (descarga) o ruta local file:/absoluta. Copia la imagen a assets/, actualiza carousel.json (asset, scrim, bgPos) y re-renderiza el preview. Después de aplicar, re-auditá con review_slide_images.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug del carrusel (alias: slug)." },
        slug: { type: "string", description: "Alias de name." },
        slide: { type: "number", description: "Número de slide (1-based)." },
        slideIndex: { type: "number", description: "Alias de slide." },
        source: { type: "string", description: "URL http(s) de la imagen o ruta local ('file:' + ruta o absoluta/~)." },
        scrim: { type: "number", description: "Velo de opacidad 0-85 (default: mantiene el actual)." },
        bgPos: { type: "string", description: "Punto focal CSS background-position (ej: 'center 30%')." },
        outputDir: { type: "string", description: "Directorio del HTML re-renderizado. Default ~/Downloads." },
        fileName: { type: "string", description: "Nombre base del HTML re-renderizado." },
        open: { type: "boolean", description: "Abrir el HTML (default true)." },
      },
      required: ["company", "name", "source"],
    },
  },
];

function carouselPath(company, name) {
  return path.join(CAROUSEL_DIR, slug(company), slug(name));
}
function dataUrlParts(value) {
  const m = String(value || "").match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mime: m[1], buffer: Buffer.from(m[2], "base64") } : null;
}
function extensionForMime(mime) {
  const found = Object.entries(IMG_EXTS).find(([, value]) => value === mime);
  return found ? found[0] : ".jpg";
}
function assetName(stem, ext) {
  return `${slug(stem).slice(0, 42) || "asset"}${ext || ".jpg"}`;
}
function fileDataURL(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = IMG_EXTS[ext] || "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}
function imageDimensions(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { width: null, height: null };
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) { p++; continue; }
    const marker = b[p + 1];
    const length = b.readUInt16BE(p + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: b.readUInt16BE(p + 7), height: b.readUInt16BE(p + 5) };
    p += 2 + length;
  }
  return { width: null, height: null };
}
function copyImageAsset(ref, assetsDir, stem, baseDir, manifest, kind = "photo") {
  const sourcePath = ref && ref.sourcePath ? expandHome(ref.sourcePath) : null;
  const assetRef = ref && ref.asset ? String(ref.asset) : "";
  const assetPath = assetRef && baseDir ? path.resolve(baseDir, assetRef) : null;
  const data = ref && dataUrlParts(ref.src);
  let source = sourcePath && fs.existsSync(sourcePath) ? sourcePath : null;
  if (!source && assetPath && fs.existsSync(assetPath)) source = assetPath;
  let ext = source ? path.extname(source).toLowerCase() : data ? extensionForMime(data.mime) : ".jpg";
  if (!IMG_EXTS[ext]) ext = ".jpg";
  const name = assetName(stem, ext);
  const target = path.join(assetsDir, name);
  if (source) fs.copyFileSync(source, target);
  else if (data) fs.writeFileSync(target, data.buffer);
  else if (assetRef) return assetRef;
  else return null;
  const rel = `assets/${name}`;
  const dimensions = imageDimensions(target);
  manifest.push({ id: slug(stem), file: rel, kind, mime: IMG_EXTS[ext] || "image/jpeg", ...dimensions });
  return rel;
}
function persistCarousel(data, company, name, baseDir) {
  const dir = carouselPath(company, name);
  const assetsDir = path.join(dir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const stored = clone(data);
  const manifest = [];
  stored.version = 2;
  stored.company = slug(company);
  stored.slug = slug(name);
  stored.updatedAt = new Date().toISOString();
  stored.createdAt = stored.createdAt || stored.updatedAt;
  stored.blockVocabulary = BLOCK_TYPES;
  stored.meta = {
    ...(stored.meta || {}),
    canvas: (stored.meta && stored.meta.canvas) || canvasForFormat(stored.meta && stored.meta.format || "feed"),
    defaults: {
      brand: { topPct: 3.8, leftPct: 6.2, logoH: 48 },
      count: { topPct: 3.8, rightPct: 6.2 },
      copy: { anchor: "bottom", offsetPct: 0, widthPct: 87.6, maxHeightPct: 62 },
    },
  };
  if (stored.kit && stored.kit.logo && (stored.kit.logo.img || stored.kit.logo.asset)) {
    const logo = copyImageAsset({ src: stored.kit.logo.img, asset: stored.kit.logo.asset }, assetsDir, "logo", baseDir, manifest, "logo");
    if (logo) stored.kit.logo = { ...stored.kit.logo, asset: logo };
    delete stored.kit.logo.img;
  }
  for (const [index, slide] of (stored.slides || []).entries()) {
    slide.id = slide.id || `slide-${index + 1}`;
    for (const legacy of ["eyebrow", "titleWhite", "titleOrange", "paragraphs", "items", "pills", "ctaBox", "slogan", "foot", "align", "copyPos", "__mcp"]) delete slide[legacy];
    if (slide.bg) {
      if (slide.scrim !== undefined) slide.bg.scrim = slide.scrim;
      if (slide.bgPos !== undefined) slide.bg.bgPos = slide.bgPos;
      if (slide.overlayLight !== undefined) slide.bg.overlayLight = slide.overlayLight;
      delete slide.scrim;
      delete slide.bgPos;
      delete slide.overlayLight;
    }
    if (slide.bg && slide.bg.type === "photo") {
      const asset = copyImageAsset(slide.bg, assetsDir, `${slide.id}-background`, baseDir, manifest);
      if (asset) slide.bg.asset = asset;
      delete slide.bg.src;
      delete slide.bg.sourcePath;
    }
  }
  stored.assets = manifest;
  fs.writeFileSync(path.join(dir, "carousel.json"), JSON.stringify(stored, null, 2), "utf8");
  return { dir, file: path.join(dir, "carousel.json"), data: stored };
}
function hydrateCarousel(stored, dir) {
  const data = clone(stored);
  if (data.kit && data.kit.logo && data.kit.logo.asset) {
    const file = path.resolve(dir, data.kit.logo.asset);
    if (fs.existsSync(file)) data.kit.logo.img = fileDataURL(file);
  }
  for (const slide of data.slides || []) {
    if (slide.bg) {
      if (slide.bg.scrim !== undefined) slide.scrim = slide.bg.scrim;
      if (slide.bg.bgPos !== undefined) slide.bgPos = slide.bg.bgPos;
      if (slide.bg.overlayLight !== undefined) slide.overlayLight = slide.bg.overlayLight;
    }
    if (slide.bg && slide.bg.type === "photo" && slide.bg.asset) {
      const file = path.resolve(dir, slide.bg.asset);
      if (fs.existsSync(file)) slide.bg.src = fileDataURL(file);
    }
  }
  return data;
}
function canvasForFormat(format) {
  return format === "square" ? { w: 1080, h: 1080 } : format === "story" ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
}
function renderCarousel(data, args = {}) {
  const brands = brandKitsPayload();
  const html = fs.readFileSync(APP_PATH, "utf8");
  if (!html.includes(MARKER)) throw new Error("La app no contiene el marcador CAROUSEL_DATA.");
  const payload =
    "<script>window.BRAND_KITS=" + JSON.stringify(brands).replace(/</g, "\\u003c") + ";</script>" +
    "<script>window.CAROUSEL_DATA=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";</script>";
  const out = html.replace(MARKER, payload);
  const dir = expandHome(args.outputDir || "~/Downloads");
  fs.mkdirSync(dir, { recursive: true });
  const base = args.fileName ? slug(args.fileName) : slug(data.meta.title) + "-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const file = path.join(dir, base + ".html");
  fs.writeFileSync(file, out, "utf8");
  if (args.open !== false) {
    try {
      if (process.platform === "darwin") spawn("open", [file], { stdio: "ignore", detached: true }).unref();
      else if (process.platform === "linux") spawn("xdg-open", [file], { stdio: "ignore", detached: true }).unref();
    } catch {}
  }
  return file;
}
function runtimeDataFromArgs(args) {
  const a = args || {};
  const kit = resolveKit(a.kitName, a.kit);
  const slidesIn = Array.isArray(a.slides) && a.slides.length ? a.slides : TEMPLATES.map((template) => ({ template }));
  const slides = applyBoldify(partitionListSlides(slidesIn.map((slide, index) => {
    const out = normSlideArg(slide);
    out.id = out.id || `slide-${index + 1}`;
    return out;
  })));
  const title = String(a.title || "Carrusel");
  const format = ["feed", "square", "story"].includes(a.format) ? a.format : "feed";
  const category = String((a.meta && a.meta.category) || a.category || "").trim();
  applyCategoryColors(slides, kit, category);
  return {
    version: 2,
    company: slug(a.company || a.kitName || kit.name || "default"),
    slug: slug(a.carouselName || a.fileName || title),
    kit,
    kitSource: { store: "generated", slug: slug(kit.name || "kit") },
    meta: { title, format, canvas: canvasForFormat(format), showCount: a.showNumbers !== false, ...(category ? { category } : {}) },
    slides,
  };
}
function toolGenerate(args) {
  const a = args || {};
  const data = runtimeDataFromArgs(a);
  const company = slug(a.company || a.kitName || data.kit.name || "default");
  const carouselName = slug(a.carouselName || a.fileName || data.meta.title);
  let persisted = null;
  if (a.persist !== false) persisted = persistCarousel(data, company, carouselName);
  const file = renderCarousel(data, a);
  const kitNames = Object.keys(brandKitsPayload());
  const styleLines = formatStyleWarnings(lintSlideTexts(data.slides));
  return `Carrusel generado (${data.slides.length} slides, formato ${data.meta.format}, kit "${data.kit.name}"):\n${file}\n\nJSON persistido: ${persisted ? persisted.file : "no (persist:false)"}\nEmpresa: ${company} · Carrusel: ${carouselName}\n\nSe abrió en el navegador. Kits disponibles en el picker: ${kitNames.length ? kitNames.join(", ") : "(solo el activo)"}. El árbol nested de bloques sigue editable y el HTML se puede exportar a PNG/PDF.${styleLines.length ? "\n" + styleLines.join("\n") : ""}`;
}
function readCarousel(company, name) {
  const dir = carouselPath(company, name);
  const file = path.join(dir, "carousel.json");
  if (!fs.existsSync(file)) throw new Error(`Carrusel "${slug(company)}/${slug(name)}" no existe.`);
  return { dir, file, stored: JSON.parse(fs.readFileSync(file, "utf8")) };
}
function toolListCarousels() {
  if (!fs.existsSync(CAROUSEL_DIR)) return JSON.stringify({ root: CAROUSEL_DIR, carousels: [] }, null, 2);
  const carousels = [];
  for (const company of fs.readdirSync(CAROUSEL_DIR)) {
    const companyDir = path.join(CAROUSEL_DIR, company);
    if (!fs.statSync(companyDir).isDirectory()) continue;
    for (const name of fs.readdirSync(companyDir)) {
      const file = path.join(companyDir, name, "carousel.json");
      if (!fs.existsSync(file)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        carousels.push({ company, slug: name, title: data.meta && data.meta.title, format: data.meta && data.meta.format, slides: (data.slides || []).length, updatedAt: data.updatedAt, file });
      } catch {}
    }
  }
  return JSON.stringify({ root: CAROUSEL_DIR, carousels }, null, 2);
}
function toolLoadCarousel(args) {
  const a = args || {};
  const company = slug(a.company || "");
  const name = slug(a.name || a.slug || "");
  if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
  const record = readCarousel(company, name);
  const runtime = hydrateCarousel(record.stored, record.dir);
  const file = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName || name, open: a.open !== false });
  return JSON.stringify({ ...record.stored, render: { html: file, json: record.file } }, null, 2);
}
function toolSaveCarousel(args) {
  const a = args || {};
  const input = a.carousel && typeof a.carousel === "object" ? a.carousel : {};
  const existing = a.company && (a.name || a.slug) ? (() => { try { return readCarousel(a.company, a.name || a.slug).stored; } catch { return null; } })() : null;
  const company = slug(a.company || input.company || input.kitSource && input.kitSource.slug || input.kit && input.kit.name || "default");
  const name = slug(a.name || a.slug || input.slug || input.meta && input.meta.title || "carrusel");
  const sourceDir = existing ? carouselPath(company, name) : input.company && input.slug ? carouselPath(input.company, input.slug) : null;
  const kitBase = existing && existing.kit ? existing.kit : resolveKit(company);
  const kit = deepMerge(kitBase, input.kit || a.kit || {});
  const rawSlides = a.slides || input.slides || existing && existing.slides || [];
  const slides = partitionListSlides(rawSlides.map((slide, index) => {
    const out = normSlideArg(slide);
    out.id = slide.id || out.id || `slide-${index + 1}`;
    return out;
  }));
  const requestedFormat = a.format || input.meta && input.meta.format || a.meta && a.meta.format || existing && existing.meta && existing.meta.format;
  const format = ["feed", "square", "story"].includes(requestedFormat) ? requestedFormat : "feed";
  const data = {
    version: 2,
    company,
    slug: name,
    kit,
    kitSource: input.kitSource || { store: "saved", slug: slug(kit.name || company) },
    meta: { ...(existing && existing.meta || {}), ...(input.meta || {}), ...(a.meta || {}), format, canvas: canvasForFormat(format) },
    slides,
  };
  const saved = persistCarousel(data, company, name, sourceDir);
  const styleWarnings = lintSlideTexts(slides);
  return JSON.stringify({ saved: saved.file, company, slug: name, title: data.meta.title || name, slides: slides.length, assets: saved.data.assets, styleWarnings }, null, 2);
}
function toolSaveKit(args) {
  const a = args || {};
  const name = slug(a.name || "");
  if (!name) throw new Error("Falta el nombre del kit.");
  if (!a.kit || typeof a.kit !== "object") throw new Error("Falta el objeto kit.");
  const existing = findKitFile(name);
  const base = existing ? JSON.parse(fs.readFileSync(existing.file, "utf8")) : clone(DEFAULT_KIT);
  const kit = resolveLogo(deepMerge(base, a.kit), name);
  kit.name = (a.kit && a.kit.name) || base.name || name;
  const dir = path.join(BRAND_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "kit.json");
  fs.writeFileSync(file, JSON.stringify(kit, null, 2), "utf8");
  return `Kit "${name}" guardado en ${file}${existing ? " (mergeado sobre el existente)" : " (nuevo, basado en Default)"}${kit.logo && kit.logo.img ? " — logo embebido en base64" : ""}`;
}
function toolListKits() {
  const all = allKitsRaw();
  const slugs = Object.keys(all).sort();
  if (!slugs.length) return "No hay kits guardados. Carpetas de empresa en " + BRAND_DIR + " (cada una con kit.json), ejemplos en " + REPO_KITS + ".";
  const lines = slugs.map((sl) => {
    const entry = all[sl];
    if (!entry.kit) return `- ${sl} (JSON inválido en ${entry.source})`;
    const k = entry.kit;
    return `- ${sl} [${entry.source}] (marca: ${k.name || "?"}, primario: ${(k.colors && k.colors.primary) || "?"}, logo img: ${k.logo && k.logo.img ? "sí" : "no"}, gradients: ${(k.gradients || []).length})`;
  });
  return "Brand kits disponibles (personales primero):\n" + lines.join("\n");
}
function toolLoadKit(args) {
  const name = slug((args && args.name) || "");
  const found = findKitFile(name);
  if (!found) throw new Error(`Kit "${name}" no existe. Usá list_brand_kits. Disponibles: ${availableKitNames().join(", ") || "(ninguno)"}.`);
  return fs.readFileSync(found.file, "utf8");
}

function hexNorm(h) {
  h = String(h).toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}
function hexRgb(h) {
  const n = parseInt(hexNorm(h).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(r, g, b) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function hexMix(h1, h2, t) {
  const a = hexRgb(h1), b = hexRgb(h2);
  return rgbHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
function hexLum(h) {
  const [r, g, b] = hexRgb(h).map((x) => x / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function isGray(h) {
  const [r, g, b] = hexRgb(h);
  return Math.max(r, g, b) - Math.min(r, g, b) < 14;
}
function metaContent(html, attr, val) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${val}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const c = m[0].match(/content=["']([^"']+)["']/i);
  return c ? c[1].trim() : null;
}
function linksHref(html, relRe) {
  const out = [];
  const re = /<link[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/rel=["']([^"']+)["']/i) || [])[1] || "";
    if (!relRe.test(rel)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (href) out.push(href.trim());
  }
  return out;
}
async function fetchBrandHTML(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await globalThis.fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "carousel-generator/2.2 (+brand-kit)", Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${url}`);
    const ct = res.headers.get("content-type") || "";
    if (ct && !/text\/html|text\/plain|application\/xhtml/i.test(ct)) throw new Error(`Contenido no-HTML (${ct})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1500000) throw new Error("HTML mayor a 1.5MB, abortado por seguridad.");
    return buf.toString("utf8");
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("Timeout (15s) al pedir " + url);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
async function downloadLogoDataURL(logoUrl) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await globalThis.fetch(logoUrl, {
      signal: ctl.signal,
      headers: { "User-Agent": "carousel-generator/2.2 (+brand-kit)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = logoUrl.split("?")[0].split(".").pop().toLowerCase();
    const mime = ct.startsWith("image/") ? ct : IMG_EXTS["." + ext];
    if (!mime) throw new Error(`MIME no-imagen (${ct || "?"})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 500000) throw new Error("logo vacío o mayor a 500KB");
    return { dataURL: `data:${mime};base64,` + buf.toString("base64"), source: logoUrl };
  } finally {
    clearTimeout(t);
  }
}
function inferKitFromHTML(html, pageUrl) {
  const conf = {};
  const title = (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) || [])[1];
  const siteName = metaContent(html, "property", "og:site_name") || metaContent(html, "name", "application-name");
  const theme = metaContent(html, "name", "theme-color") || metaContent(html, "name", "msapplication-TileColor");
  const counts = {};
  const re = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let m;
  while ((m = re.exec(html))) {
    const h = hexNorm(m[0]);
    counts[h] = (counts[h] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
  const saturated = ranked.filter(([h]) => !isGray(h) && h !== "#ffffff" && h !== "#000000");
  const pick = (list, fb) => (list.length ? list[0][0] : fb);
  let primary, primarySrc;
  if (theme && /^#[0-9a-f]{3,6}$/i.test(theme)) { primary = hexNorm(theme); primarySrc = "meta theme-color"; conf.primary = "alta"; }
  else if (saturated.length) { primary = saturated[0][0]; primarySrc = `color frecuente (×${saturated[0][1]})`; conf.primary = "media"; }
  else { primary = DEFAULT_KIT.colors.primary; primarySrc = "fallback Default"; conf.primary = "baja"; }
  const darks = ranked.filter(([h]) => hexLum(h) < 0.12 && h !== primary);
  const secondary = darks.length ? darks[0][0] : "#0f172a";
  conf.secondary = darks.length ? "media" : "baja";
  const lights = ranked.filter(([h]) => hexLum(h) > 0.75 && !isGray(h));
  const lightHit = lights.length ? lights[0][0] : null;
  const gFonts = linksHref(html, /stylesheet/i).filter((h) => h.includes("fonts.googleapis.com"));
  let googleUrl = gFonts.length ? (gFonts[0].startsWith("http") ? gFonts[0] : new URL(gFonts[0], pageUrl).href) : null;
  conf.fonts = googleUrl ? "media (Google Fonts detectado)" : "baja (fallback Inter)";
  const fams = [];
  const fre = /font-family\s*:\s*([^;}]{1,160})/gi;
  let fm;
  while ((fm = fre.exec(html)) && fams.length < 20) fams.push(fm[1].trim());
  const stack = fams.find((f) => /inter|roboto|poppins|montserrat|manrope|dm sans|archivo|jetbrains|space|playfair|serif/i.test(f));
  const body = stack ? stack.split(",")[0].replace(/['"]/g, "").trim() : "Inter";
  const icons = linksHref(html, /apple-touch-icon|icon/i);
  const ogImg = metaContent(html, "property", "og:image");
  const logoCands = [...icons.filter((h) => !/\.ico(\?|$)/i.test(h)).slice(0, 2), ...(ogImg ? [ogImg] : [])].slice(0, 3);
  const brandName = (siteName || (title || "").split(/[|·–—-]/)[0] || new URL(pageUrl).hostname.replace(/^www\./, "")).trim().slice(0, 60);
  return { brandName, title, primary, primarySrc, secondary, lightHit, googleUrl, body, logoCands, conf };
}
async function toolBrandKitFromURL(args) {
  const a = args || {};
  const raw = String(a.url || "").trim();
  if (!raw) throw new Error("Falta `url`.");
  let u;
  try { u = new URL(raw); } catch { throw new Error(`URL inválida: "${raw}". Incluí el esquema https://`); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Solo se aceptan URLs http(s).");
  const html = await fetchBrandHTML(u.href);
  const inf = inferKitFromHTML(html, u.href);
  const sl = slug(a.name || inf.brandName || u.hostname);
  const sec = inf.secondary, dark = hexMix(sec, "#000000", 0.45);
  const kit = clone(DEFAULT_KIT);
  kit.name = String(a.name || inf.brandName || sl).slice(0, 60);
  kit.colors = { primary: inf.primary, secondary: sec, tertiary: "#ffffff", slideBg: hexMix(sec, "#ffffff", 0.08) };
  kit.fonts = {
    heading: `'${inf.body}', system-ui, sans-serif`,
    body: `'${inf.body}', system-ui, sans-serif`,
    googleUrl: inf.googleUrl || DEFAULT_KIT.fonts.googleUrl,
  };
  kit.logo = { letter: (kit.name[0] || "c").toLowerCase(), text: kit.name };
  kit.gradients = [
    { name: "deep", css: `linear-gradient(145deg,${sec},${dark} 70%)` },
    { name: "brand", css: `linear-gradient(145deg,${hexMix(sec, inf.primary, 0.35)},${sec} 60%,${dark})` },
    { name: "accent", css: `linear-gradient(145deg,${inf.primary},${sec} 55%,${dark})` },
    inf.lightHit
      ? { name: "light", css: `linear-gradient(135deg,${inf.lightHit},${hexMix(inf.lightHit, sec, 0.45)} 60%,${hexMix(sec, "#ffffff", 0.25)})`, light: true }
      : { name: "mint", css: "linear-gradient(135deg,#bfe3d8,#dcead2 55%,#5ea3b8)", light: true },
  ];
  let logoNote = "sin logo (se usa letra fallback)";
  let logoConf = "baja";
  for (const cand of inf.logoCands) {
    try {
      const abs = new URL(cand, u.href).href;
      const dl = await downloadLogoDataURL(abs);
      kit.logo.img = dl.dataURL;
      logoNote = `logo embebido desde ${abs}`;
      logoConf = "media";
      break;
    } catch (e) {
      logoNote = `logo no descargable (${(e && e.message) || e}), se usa letra fallback`;
    }
  }
  if (a.save === false) {
    return `Kit inferido (NO guardado, save:false):\n${JSON.stringify(kit, null, 2).slice(0, 4000)}\n\nConfianza — primario: ${inf.conf.primary} (${inf.primarySrc}) · secundario: ${inf.conf.secondary} · fonts: ${inf.conf.fonts} · logo: ${logoConf} (${logoNote}).\nPara guardarlo pasá save:true o usá save_brand_kit con este JSON.`;
  }
  const existing = findKitFile(sl);
  const base = existing ? JSON.parse(fs.readFileSync(existing.file, "utf8")) : clone(DEFAULT_KIT);
  const merged = deepMerge(base, kit);
  merged.name = kit.name;
  const dir = path.join(BRAND_DIR, sl);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "kit.json"), JSON.stringify(merged, null, 2), "utf8");
  return `Kit "${sl}" generado desde ${u.href} y guardado en ${path.join(dir, "kit.json")}${existing ? " (mergeado sobre el existente)" : ""}.\n\n- Marca: ${kit.name}\n- Primario: ${kit.colors.primary} [confianza ${inf.conf.primary}: ${inf.primarySrc}]\n- Secundario: ${kit.colors.secondary} [confianza ${inf.conf.secondary}]\n- Fonts: ${kit.fonts.heading} [${inf.conf.fonts}]\n- Logo: ${logoNote} [confianza ${logoConf}]\n- Gradients: ${kit.gradients.map((g) => g.name).join(", ")}\n\nRevisar: contraste del primario sobre blanco, logo (¿es el correcto o un favicon chico?), y tipografía.\nAjuste con feedback: previsualizá con generate_carousel {kitName:"${sl}"} y refiná con save_brand_kit {name:"${sl}", kit:{...solo lo que cambia...}} (ej: {"colors":{"primary":"#ff5a00"}}). Los cambios se ven en vivo en el picker del editor.`;
}

async function callTool(name, args) {
  switch (name) {
    case "generate_carousel": return toolGenerate(args);
    case "list_carousels": return toolListCarousels();
    case "load_carousel": return toolLoadCarousel(args);
    case "save_carousel": return toolSaveCarousel(args);
    case "save_brand_kit": return toolSaveKit(args);
    case "list_brand_kits": return toolListKits();
    case "load_brand_kit": return toolLoadKit(args);
    case "brand_kit_from_url": return await toolBrandKitFromURL(args);
    case "carousel_from_url": return await toolCarouselFromURL(args);
    case "review_slide_images": return toolReviewSlideImages(args);
    case "delete_carousel": return toolDeleteCarousel(args);
    case "set_slide_photo": return await toolSetSlidePhoto(args);
    default: throw new Error(`Herramienta desconocida: ${name}`);
  }
}
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: (params && params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "carousel-generator", version: "2.3.0" },
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: await callTool(name, args) }] } };
    } catch (e) {
      return {
        jsonrpc: "2.0", id,
        result: { isError: true, content: [{ type: "text", text: "ERROR: " + (e && e.message ? e.message : String(e)) }] },
      };
    }
  }
  if (method === "notifications/initialized") return null;
  if (id === undefined || id === null) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método desconocido: ${method}` } };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) {
    process.stderr.write("[carousel-mcp] JSON invalido ignorado (" + e.message + "): " + line.slice(0, 200) + "\n");
    return;
  }
  handle(msg)
    .then((res) => { if (res) send(res); })
    .catch((e) => {
      if (msg.id !== undefined && msg.id !== null) {
        send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String((e && e.message) || e) } });
      }
    });
});
rl.on("close", () => process.exit(0));
