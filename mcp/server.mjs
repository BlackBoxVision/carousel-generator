#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.join(__dirname, "..", "app", "index.html");
const REPO_KITS = path.join(__dirname, "kits");
const HOME_CG = path.join(os.homedir(), ".carousel-generator");
const BRAND_DIR = path.join(HOME_CG, "brand");
const CAROUSEL_DIR = path.join(HOME_CG, "carousels");
const LEGACY_KITS = path.join(HOME_CG, "kits");
const MARKER = "<!--CAROUSEL_DATA-->";
let APP_TEMPLATE_CACHE = null;
const TEMPLATES = ["cover", "fact", "map", "list", "cta"];
const BLOCK_TYPES = ["brand", "count", "stack", "kicker", "text", "highlight", "body", "items", "item", "box", "pill", "slogan", "foot"];
const IMG_EXTS = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif", ".heic": "image/heic" };
const CONVERTIBLE_EXTS = new Set([".avif", ".heic", ".heif"]);

function convertToJpeg(file) {
  const ext = path.extname(file).toLowerCase();
  if (!CONVERTIBLE_EXTS.has(ext)) return file;
  const out = file.replace(new RegExp(ext.replace(".", "\\.") + "$", "i"), ".jpg");
  try {
    const r = spawnSync("sips", ["-s", "format", "jpeg", file, "--out", out], { encoding: "utf8" });
    if (r.status === 0 && fs.existsSync(out)) return out;
  } catch {}
  throw new Error(`No se pudo convertir "${ext}" a jpg (se requiere sips en macOS). Convertí el archivo manualmente y pasá el .jpg.`);
}

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
function brandKitsPayload(activeSlug) {
  const out = {};
  const act = activeSlug ? slug(activeSlug) : "";
  for (const [sl, entry] of Object.entries(allKitsRaw())) {
    if (!entry.kit) continue;
    try {
      const kit = resolveLogo(clone(entry.kit), entry.scope || sl);
      if (act && sl !== act && kit.logo && typeof kit.logo.img === "string" && kit.logo.img.startsWith("data:")) {
        kit.logo = { ...kit.logo, img: undefined };
      }
      out[sl] = kit;
    } catch (e) {
      process.stderr.write(`[carousel-mcp] kit "${sl}" sin logo (${e.message})\n`);
      out[sl] = entry.kit;
    }
  }
  return out;
}
function loadAppTemplate() {
  if (APP_TEMPLATE_CACHE) return APP_TEMPLATE_CACHE;
  const html = fs.readFileSync(APP_PATH, "utf8");
  if (!html.includes(MARKER)) throw new Error("La app no contiene el marcador CAROUSEL_DATA.");
  APP_TEMPLATE_CACHE = html;
  return html;
}
function handoffRender(file, jsonPath, data, extra = {}) {
  const company = data && data.company ? slug(data.company) : "";
  const slugName = data && data.slug ? slug(data.slug) : "";
  const slides = data && Array.isArray(data.slides) ? data.slides.length : undefined;
  const format = data && data.meta ? data.meta.format : undefined;
  return {
    render: { htmlPath: file, jsonPath: jsonPath || null, company, slug: slugName, slides, format },
    open: process.platform === "darwin" ? `open ${JSON.stringify(file)}` : file,
    nextSteps: extra.nextSteps || [
      "Abrí el HTML para revisar el resultado en el editor.",
      "Si hay fotos nuevas: verificá visualmente cada una y re-auditá con review_slide_images.",
      "Si el copy cambió: revisá narrativeAudit / NARRATIVE_REVIEW_PROTOCOL antes de entregar.",
    ],
  };
}
function appendHandoff(text, handoff) {
  return text + "\n\n---\nhandoff:\n" + JSON.stringify(handoff, null, 2);
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
const NARRATIVE_REVIEW_PROTOCOL = [
  "NARRATIVE REVIEW PROTOCOL (ejecutalo antes de entregar el carrusel — sobre todo si se generó desde una URL):",
  "1. READ — leé el kicker, título, highlight y body de TODAS las slides en orden (1..N).",
  "2. COMMON THREAD — confirmá que todas hablan del mismo sujeto/tema de la nota; no debe haber slides de relleno sin conexión con la portada ni con el título.",
  "3. ARC — verificá arco completo: portada (gancho) → desarrollo → cierre (cta al final). El orden debe ser lineal, sin ir para atrás.",
  "4. COHESIÓN — cada slide debe conectar con la anterior (puente lógico o secuencia), sin saltos random de tema.",
  "5. FIX — si algo falla: corregí copy o reordená con edit_slide (action update_text | move) y volvé a auditar antes de entregar.",
  "Mirá narrativeAudit.flags como puntos de partida (los flags sólidos son casi seguros; orphanSlides es advisory de baja confianza).",
  "Nunca entregues un carrusel con slides sin sentido ni sin hilo común.",
].join("\n");

const STOPWORDS = new Set(("de la el los las un una unos unas y o u en con por para del al que como mas más se su sus es son fue fueron seran serán entre sobre desde hasta sin contra hacia muy ya tambien también no ni si sí cada todo toda todos todas otro otra este esta estos estas ese esa eso aquel cuando donde cual cuales porque pero donc más menos tras ante bajo sobre segun según").split(/\s+/));
function significantTokens(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}
function extractFigures(text) {
  const out = new Set();
  const re = /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d[\d.,]*\s?(?:millones|millón|miles|mil)\b|\b\d{1,3}(?:\.\d{3})+\b/gi;
  let m;
  const t = String(text || "");
  while ((m = re.exec(t))) out.add(m[0].replace(/\s+/g, " ").trim().toLowerCase());
  return out;
}
function collectSlideTexts(slide) {
  const parts = [];
  const walk = (nodes) => {
    for (const b of nodes || []) {
      if (b.text) parts.push(b.text);
      if (b.title) parts.push(b.title);
      if (b.desc) parts.push(b.desc);
      if (b.children) walk(b.children);
    }
  };
  walk(slide.elements);
  return parts.join(" \n ");
}
function narrativeAudit(slides, title) {
  const flags = [];
  const texts = (slides || []).map(collectSlideTexts);
  const templates = (slides || []).map((s) => s.template);
  if (!templates.includes("cover")) flags.push({ rule: "missing-cover", severity: "solid", detail: "No hay slide cover (gancho inicial)." });
  if (!templates.includes("cta")) flags.push({ rule: "missing-cta", severity: "solid", detail: "No hay slide cta (cierre)." });
  const lastCta = templates.lastIndexOf("cta");
  if (lastCta !== -1 && lastCta !== templates.length - 1) flags.push({ rule: "cta-in-middle", severity: "solid", detail: `cta en posición ${lastCta + 1} de ${templates.length}; debería ser la última.` });
  const coverCount = templates.filter((t) => t === "cover").length;
  if (coverCount > 1) flags.push({ rule: "multi-cover", severity: "solid", detail: `${coverCount} slides cover; la portada debe ser única.` });

  const figMap = new Map();
  texts.forEach((t, i) => {
    for (const f of extractFigures(t)) {
      if (!figMap.has(f)) figMap.set(f, []);
      figMap.get(f).push(i + 1);
    }
  });
  for (const [fig, where] of figMap) {
    if (where.length > 1) flags.push({ rule: "duplicate-figure", severity: "solid", detail: `Cifra "${fig}" repetida en slides ${where.join(", ")}.`, figure: fig, slides: where });
  }

  const kickerMap = new Map();
  (slides || []).forEach((s, i) => {
    let kicker = "";
    walkBlocks(s.elements, (b) => { if (b.type === "kicker" && !kicker) { kicker = b.text || ""; return true; } return false; });
    if (kicker) {
      const key = kicker.toLowerCase().trim();
      if (!kickerMap.has(key)) kickerMap.set(key, []);
      kickerMap.get(key).push(i + 1);
    }
  });
  for (const [k, where] of kickerMap) {
    if (where.length > 1) flags.push({ rule: "repeated-kicker", severity: "solid", detail: `Kicker "${k}" repetido en slides ${where.join(", ")} (señal de relleno).`, slides: where });
  }

  const titleTokens = new Set(significantTokens(title || ""));
  const coverTokens = new Set(significantTokens(texts[0] || ""));
  const anchor = new Set([...titleTokens, ...coverTokens]);
  if (anchor.size > 0) {
    texts.forEach((t, i) => {
      if (i === 0) return;
      const tok = significantTokens(t);
      if (!tok.length) return;
      const overlap = tok.filter((w) => anchor.has(w));
      if (overlap.length === 0) flags.push({ rule: "orphan-slide", severity: "low", confidence: "baja", detail: `Slide ${i + 1} no comparte tokens significativos con la portada ni el título (revisá si pertenece al hilo).`, slide: i + 1 });
    });
  }
  return { ok: flags.filter((f) => f.severity === "solid").length === 0, flags };
}
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
  const check = (slide, field, text, el) => {
    const t = String(text || "");
    if (!t) return;
    if (t.includes("—")) out.push({ slide, field, rule: "raya-larga", detail: "raya larga (—): usá coma, punto o guion corto (-)", excerpt: excerptText(t) });
    if (hasNoEsContrast(t)) out.push({ slide, field, rule: "contraste-no-es", detail: "contraste 'no es X, es Y' / 'no solo X, sino Y': afirmá directo, sin negar primero", excerpt: excerptText(t) });
    const cliche = STYLE_CLICHES.find((c) => t.toLowerCase().includes(c));
    if (cliche) out.push({ slide, field, rule: "cliche", detail: `cliché de IA ("${cliche}"): reformulá con palabras propias`, excerpt: excerptText(t) });
    if (field === "highlight" && el && el.style && (+el.style.sizePct || 100) >= 90 && t.length > 28) {
      out.push({ slide, field, rule: "highlight-largo", detail: `highlight largo (${t.length} chars) con sizePct ${el.style.sizePct || 100}: puede partirse feo; bajá sizePct o acortá el texto`, excerpt: excerptText(t) });
    }
  };
  (slides || []).forEach((s, i) => {
    const walk = (nodes) => {
      for (const el of nodes || []) {
        if (label[el.type]) check(i + 1, label[el.type], el.text, el);
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
function writeSourceMd(dir, { url, title, site, dek, category, paras, items }) {
  const file = path.join(dir, "source.md");
  if (fs.existsSync(file)) return { file, wrote: false, reason: "ya existía, no sobrescrito" };
  const figParas = (paras || []).filter((p) => DATA_FIG_RE.test(p)).slice(0, 5);
  const keyParas = figParas.length ? figParas : (paras || []).slice(0, 3);
  const curated = [dek || "", ...(keyParas || []).map((p) => (p.length > 400 ? p.slice(0, 397).trimEnd() + "…" : p))].filter(Boolean).join("\n\n");
  const md = [
    "---",
    `url: ${url}`,
    `title: ${JSON.stringify(title || "")}`,
    `site: ${site || ""}`,
    `category: ${category || ""}`,
    `extractedAt: ${new Date().toISOString()}`,
    `dek: ${JSON.stringify(dek || "")}`,
    "---",
    "",
    "## Descripción curada",
    "",
    curated || "(sin bajada — completar a mano)",
    "",
    "## Datos clave",
    "",
    ...(keyParas.length ? keyParas.map((p) => `- ${p}`) : ["- (sin figuras detectadas)"]),
    "",
    "## Puntos (items de la nota)",
    "",
    ...((items || []).length ? items.slice(0, 12).map((t) => `- ${t}`) : ["- (sin items)"]),
    "",
    "## Nota",
    "",
    "Extraído automáticamente de la URL. Refinar acá antes de `social_copy` si querés copy más fiel al artículo.",
    "",
  ].join("\n");
  fs.writeFileSync(file, md, "utf8");
  return { file, wrote: true };
}
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
  runtime.company = company;
  runtime.slug = carouselName;
  let persisted = null;
  if (a.persist !== false) persisted = persistCarousel(runtime, company, carouselName);
  let sourceMd = null;
  if (persisted) {
    try {
      sourceMd = writeSourceMd(persisted.dir, {
        url: pageUrl,
        title: art.title,
        site: art.site,
        dek: art.dek,
        category: runtime.meta.category || (detected && detected.category) || "",
        paras: art.paras,
        items: art.items,
      });
    } catch (e) {
      process.stderr.write(`[carousel-from-url] source.md skip: ${e.message}\n`);
    }
  }
  const file = renderCarousel(runtime, { ...a, open: a.open !== false, stable: true });
  const lines = [
    `Carrusel desde URL creado (${runtime.slides.length} slides):`,
    file,
    `JSON persistido: ${persisted ? persisted.file : "no (persist:false)"}`,
    ...(sourceMd ? [`source.md: ${sourceMd.file}${sourceMd.wrote ? " (nuevo)" : ` (${sourceMd.reason})`}`] : []),
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
  const audit = narrativeAudit(runtime.slides, art.title);
  lines.push("", `narrativeAudit (hilo/coherencia): ok=${audit.ok}`);
  if (audit.flags.length) {
    lines.push("  flags:");
    for (const f of audit.flags) lines.push(`  - [${f.severity}${f.confidence ? "/" + f.confidence : ""}] ${f.rule}: ${f.detail}`);
  } else {
    lines.push("  (sin flags — revisá igual que cada slide conecte con la anterior)");
  }
  lines.push("", NARRATIVE_REVIEW_PROTOCOL);
  lines.push(...formatStyleWarnings(lintSlideTexts(runtime.slides)));
  const handoff = handoffRender(file, persisted ? persisted.file : null, runtime, {
    nextSteps: [
      a.open === false ? "HTML generado sin abrir (open:false)." : "Se abrió en el navegador.",
      ...(sourceMd && sourceMd.wrote ? [`source.md guardado: ${sourceMd.file} — usalo como fuente en social_copy.`] : ["source.md no se escribió (podía existir ya)."]),
      "Seguí el PHOTO REVIEW PROTOCOL y el NARRATIVE_REVIEW_PROTOCOL antes de entregar.",
      ...(photoNeeds.length ? [`Hay ${photoNeeds.length} slides sin foto coherente: resuelvelas con set_slide_photo / stock.`] : []),
    ],
  });
  return appendHandoff(lines.join("\n"), handoff);
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
  const audit = narrativeAudit(record.stored.slides || [], record.stored.meta && record.stored.meta.title);
  return JSON.stringify({ company, slug: name, slides, photoNeeds, narrativeAudit: audit, protocol: PHOTO_REVIEW_PROTOCOL + "\n\n" + NARRATIVE_REVIEW_PROTOCOL }, null, 2);
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
    if (CONVERTIBLE_EXTS.has(path.extname(file).toLowerCase())) {
      const converted = convertToJpeg(file);
      if (converted !== file) { tmpFile = converted; file = converted; }
    }
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
  runtime.company = company;
  runtime.slug = name;
  const html = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName, open: a.open === true, stable: true });
  const photoNeeds = slideMetaForReview(stored, record.dir).filter((s) => !s.hasPhoto).map((s) => ({
    slide: s.slide,
    template: s.template,
    query: [s.title, s.highlight, s.kicker].filter(Boolean).join(" ") || s.template,
  }));
  const handoff = handoffRender(html, record.file, runtime, {
    nextSteps: [
      "Foto persistida en carousel.json + assets/.",
      "photoNeeds restantes: revisalas abajo.",
      "Re-auditá con review_slide_images antes de entregar.",
    ],
  });
  return appendHandoff(
    `Foto actualizada en slide ${idx + 1} de ${company}/${name}.\nImagen: ${dest}${dim ? ` (${dim.w}x${dim.h})` : ""}\nPreview: ${html}\n\nphotoNeeds restantes (slides sin foto): ${photoNeeds.length ? JSON.stringify(photoNeeds) : "(ninguna)"}\n\nPaso 3 del protocolo: re-auditá con review_slide_images antes de entregar.\n${PHOTO_REVIEW_PROTOCOL}`,
    handoff
  );
}

function walkBlocks(nodes, fn) {
  for (const n of nodes || []) {
    if (fn(n)) return n;
    if (n.children) {
      const hit = walkBlocks(n.children, fn);
      if (hit) return hit;
    }
  }
  return null;
}
function findBlockInSlide(slide, blockId, blockType) {
  if (blockId) return walkBlocks(slide.elements, (n) => n.id === blockId);
  if (blockType) return walkBlocks(slide.elements, (n) => n.type === blockType);
  return null;
}
async function toolEditSlide(args) {
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
        open: { type: "boolean", description: "Abrir el HTML en navegador (default true en generate/load/from_url; default false en edit_slide/set_slide_photo)." },
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
        open: { type: "boolean", description: "Abrir el HTML (default true para load/generate/from_url; default false para tools iterativas)." },
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
        open: { type: "boolean", description: "Abrir el HTML (default true para load/generate/from_url; default false para tools iterativas)." },
      },
      required: ["company", "name", "source"],
    },
  },
  {
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
  },
  {
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
  },
  {
    name: "render_preview",
    description:
      "Renderiza el carrusel a PNGs reales con Chrome headless. Ejemplos de instrucción natural: 'dame el carousel en formato 4:5 todos los PNGs' → {format:'4:5'} u {format:'feed'} sin slides (todas); 'solo la slide 3 en 1:1' → {format:'1:1', slides:[3]}. Acepta alias de formato 4:5|feed, 1:1|square, 9:16|story. Devuelve rutas PNG por slide para que el agente los lea/verifique (fotos, layout, copy).",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug del carrusel (alias: slug)." },
        slug: { type: "string", description: "Alias de name." },
        format: {
          type: "string",
          description: "Formato: feed|4:5 (1080x1350), square|1:1 (1080x1080), story|9:16 (1080x1920). Default: el formato del carrusel.",
        },
        slides: {
          type: "array",
          items: { type: "number" },
          description: "Índices 1-based a renderizar. Omite para TODAS las slides.",
        },
        outputDir: { type: "string", description: "Directorio de salida. Default: carpeta del carrusel /previews/{format}/." },
        open: { type: "boolean", description: "Abrir el primer PNG (default false)." },
      },
      required: ["company", "name"],
    },
  },
  {
    name: "social_copy",
    description:
      "Genera copy de publicación (captions, ganchos, hashtags y alt text por slide) para un carrusel persistido. Prioriza source.md → slides → meta. Plataformas: instagram, linkedin, x (default: instagram+linkedin). Idioma es-AR. Sin API key: heurísticas locales. Devuelve hooks, captions por plataforma, hashtags sugeridos y altText ≤125 chars por slide para accesibilidad.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Slug de empresa." },
        name: { type: "string", description: "Slug del carrusel (alias: slug)." },
        slug: { type: "string", description: "Alias de name." },
        platforms: {
          type: "array",
          items: { type: "string", enum: ["instagram", "linkedin", "x", "facebook", "tiktok"] },
          description: "Plataformas a generar. Default: ['instagram','linkedin'].",
        },
        tone: {
          type: "string",
          enum: ["directo", "inspirador", "informativo", "provocador", "cercano"],
          description: "Tono del copy (default: informativo).",
        },
        audience: { type: "string", description: "Público objetivo (ej: 'marketing managers B2B')." },
        cta: { type: "string", description: "Call to action final personalizado (si lo hay)." },
        includeHashtags: { type: "boolean", description: "Incluir hashtags (default true)." },
        maxHashtags: { type: "number", description: "Máximo de hashtags (default: 8 IG, 5 LinkedIn, 2 X)." },
        language: { type: "string", description: "Idioma BCP-47 (default: es-AR)." },
        save: { type: "boolean", description: "Guardar social.md junto al carousel.json (default false)." },
      },
      required: ["company", "name"],
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
  const activeSlug = (data && data.kitSource && data.kitSource.slug) || (data && data.kit && data.kit.name) || "";
  const brands = brandKitsPayload(activeSlug);
  const html = loadAppTemplate();
  const payload =
    "<script>window.BRAND_KITS=" + JSON.stringify(brands).replace(/</g, "\\u003c") + ";</script>" +
    "<script>window.CAROUSEL_DATA=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";</script>";
  const out = html.replace(MARKER, payload);
  const dir = expandHome(args.outputDir || "~/Downloads");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toTimeString().slice(0, 5).replace(":", "");
  let base;
  if (args.fileName) base = slug(args.fileName);
  else if (data && data.company && data.slug) base = `${slug(data.company)}-${slug(data.slug)}`;
  else base = slug(data.meta.title) + "-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const antiCache = args.stable === true || args.fileName || (data && data.company && data.slug) ? base : base + "-" + stamp;
  const file = path.join(dir, antiCache + ".html");
  fs.writeFileSync(file, out, "utf8");
  if (args.open === true) {
    try {
      const url = "file://" + file.split(path.sep).map(encodeURIComponent).join("/") + "?t=" + Date.now();
      if (process.platform === "darwin") spawn("open", [file], { stdio: "ignore", detached: true }).unref();
      else if (process.platform === "linux") spawn("xdg-open", [file], { stdio: "ignore", detached: true }).unref();
      void url;
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
  data.company = company;
  data.slug = carouselName;
  let persisted = null;
  if (a.persist !== false) persisted = persistCarousel(data, company, carouselName);
  const file = renderCarousel(data, { ...a, open: a.open !== false, stable: true });
  const kitNames = Object.keys(brandKitsPayload((data.kitSource && data.kitSource.slug) || data.kit.name));
  const styleLines = formatStyleWarnings(lintSlideTexts(data.slides));
  const handoff = handoffRender(file, persisted ? persisted.file : null, data, {
    nextSteps: [
      a.open === false ? "HTML generado sin abrir (open:false). Pasá open:true o abrí la ruta a mano." : "Se abrió en el navegador.",
      `Kits en el picker: ${kitNames.length ? kitNames.join(", ") : "(solo el activo)"}.`,
      "Exportá PNGs/PDF desde el editor.",
      ...(styleLines.length ? ["Corregí los styleWarnings listados arriba."] : []),
    ],
  });
  return appendHandoff(
    `Carrusel generado (${data.slides.length} slides, formato ${data.meta.format}, kit "${data.kit.name}"):\n${file}\n\nJSON persistido: ${persisted ? persisted.file : "no (persist:false)"}\nEmpresa: ${company} · Carrusel: ${carouselName}\n\nEl árbol nested de bloques sigue editable y el HTML se puede exportar a PNG/PDF.${styleLines.length ? "\n" + styleLines.join("\n") : ""}`,
    handoff
  );
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
}
function toolSaveCarousel(args) {
  const a = args || {};
  const input = a.carousel && typeof a.carousel === "object" ? a.carousel : {};
  const existing = a.company && (a.name || a.slug) ? (() => { try { return readCarousel(a.company, a.name || a.slug).stored; } catch { return null; } })() : null;
  const company = slug(a.company || input.company || input.kitSource && input.kitSource.slug || input.kit && input.kit.name || "default");
  const name = slug(a.name || a.slug || input.slug || input.meta && input.meta.title || "carrusel");
  const rawSlides = a.slides || input.slides || existing && existing.slides || [];
  if (!Array.isArray(rawSlides)) {
    throw new Error("`slides` debe ser un array; recibiste " + (rawSlides === null ? "null" : typeof rawSlides) + ". Ejemplo: { slides: [{ template: 'fact', ... }] }. También podés pasar `carousel` con la propiedad slides, o `meta`/`kit` solos para actualizarlos sobre el existente.");
  }
  const sourceDir = existing ? carouselPath(company, name) : input.company && input.slug ? carouselPath(input.company, input.slug) : null;
  const kitBase = existing && existing.kit ? existing.kit : resolveKit(company);
  const kit = deepMerge(kitBase, input.kit || a.kit || {});
  const slides = partitionListSlides(rawSlides.map((slide, index) => {
    const out = normSlideArg(slide);
    out.id = slide && slide.id || out.id || `slide-${index + 1}`;
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
  const narrative = narrativeAudit(slides, data.meta.title || name);
  return JSON.stringify({ saved: saved.file, company, slug: name, title: data.meta.title || name, slides: slides.length, assets: saved.data.assets, styleWarnings, narrativeAudit: narrative, protocol: NARRATIVE_REVIEW_PROTOCOL }, null, 2);
}
async function toolImportEditorState(args) {
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
  const resultRaw = await toolSaveCarousel(a);
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
}
function normalizePreviewFormat(f, fallback) {
  const raw = String(f || "").trim().toLowerCase();
  const map = {
    feed: "feed", "4:5": "feed", "45": "feed", "4x5": "feed",
    square: "square", "1:1": "square", "11": "square", "1x1": "square",
    story: "story", "9:16": "story", "916": "story", "9x16": "story", reels: "story", tiktok: "story",
  };
  if (map[raw]) return map[raw];
  if (["feed", "square", "story"].includes(raw)) return raw;
  return fallback && ["feed", "square", "story"].includes(fallback) ? fallback : "feed";
}
function findChromeBin() {
  const envChrome = process.env.CHROME_PATH && process.env.CHROME_PATH.trim();
  if (envChrome && fs.existsSync(envChrome)) return envChrome;
  const candidates = [];
  if (process.platform === "darwin") {
    const home = os.homedir();
    const pwRoot = path.join(home, "Library", "Caches", "ms-playwright");
    for (const dir of safeReaddir(pwRoot)) {
      if (!/^chromium_headless_shell/i.test(dir)) continue;
      candidates.push(path.join(pwRoot, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"));
      candidates.push(path.join(pwRoot, dir, "chrome-headless-shell-mac", "chrome-headless-shell"));
    }
    for (const dir of safeReaddir(pwRoot)) {
      if (!/^chromium-\d/i.test(dir)) continue;
      candidates.push(path.join(pwRoot, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
      candidates.push(path.join(pwRoot, dir, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
    }
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    );
  } else if (process.platform === "win32") {
    const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    candidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe")
    );
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium");
  }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  for (const name of ["google-chrome", "chromium", "chromium-browser", "chrome"]) {
    try {
      const r = spawnSync("which", [name], { encoding: "utf8" });
      if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
    } catch {}
  }
  return null;
}
function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}
function chromeScreenshot(bin, url, pngPath, width, height) {
  const isHeadlessShell = /chrome-headless-shell|headless_shell/i.test(bin);
  const args = [];
  if (!isHeadlessShell) args.push("--headless=new");
  args.push(
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--disable-dev-shm-usage",
    "--allow-file-access-from-files",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=" + width + "," + height,
    "--force-device-scale-factor=1",
    "--virtual-time-budget=8000",
    "--run-all-compositor-stages-before-draw",
    "--screenshot=" + pngPath,
    url
  );
  try { fs.rmSync(pngPath, { force: true }); } catch {}
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error && (r.error.code === "ETIMEDOUT" || /ETIMEDOUT|timed out/i.test(String(r.error.message || "")))) {
    if (fs.existsSync(pngPath)) return pngPath;
    const r2 = spawnSync(bin, args, { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
    if (r2.error && !fs.existsSync(pngPath)) throw new Error("No se pudo ejecutar Chrome: " + r2.error.message);
    if (!fs.existsSync(pngPath)) {
      const err = (r2.stderr || r2.stdout || r.stderr || r.stdout || "").slice(0, 400);
      throw new Error("Chrome no generó el PNG (" + pngPath + "). " + err);
    }
    return pngPath;
  }
  if (r.error) throw new Error("No se pudo ejecutar Chrome: " + r.error.message);
  if (!fs.existsSync(pngPath)) {
    const err = (r.stderr || r.stdout || "").slice(0, 400);
    throw new Error("Chrome no generó el PNG (" + pngPath + "). " + err);
  }
  return pngPath;
}
function fileUrl(p) {
  const abs = path.resolve(p);
  let u = "file://" + abs.split(path.sep).map(encodeURIComponent).join("/");
  return u;
}
function toolRenderPreview(args) {
  const a = args || {};
  const company = slug(a.company || "");
  const name = slug(a.name || a.slug || "");
  if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
  const record = readCarousel(company, name);
  const storedFormat = (record.stored.meta && record.stored.meta.format) || "feed";
  const format = normalizePreviewFormat(a.format, storedFormat);
  const canvas = canvasForFormat(format);
  const runtime = hydrateCarousel(record.stored, record.dir);
  runtime.company = company;
  runtime.slug = name;
  if (runtime.meta) {
    runtime.meta.format = format;
    runtime.meta.canvas = canvas;
  }
  const total = (runtime.slides || []).length;
  if (!total) throw new Error("El carrusel no tiene slides.");
  let indices;
  if (Array.isArray(a.slides) && a.slides.length) {
    indices = a.slides.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n >= 1 && n <= total);
    if (!indices.length) throw new Error("`slides` fuera de rango (1.." + total + ").");
  } else {
    indices = Array.from({ length: total }, (_, i) => i + 1);
  }
  const chrome = findChromeBin();
  const outDir = a.outputDir
    ? expandHome(a.outputDir)
    : path.join(record.dir, "previews", format);
  fs.mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, `${name}-preview.html`);
  const brands = brandKitsPayload((runtime.kitSource && runtime.kitSource.slug) || (runtime.kit && runtime.kit.name) || "");
  const payload =
    "<script>window.BRAND_KITS=" + JSON.stringify(brands).replace(/</g, "\\u003c") + ";</script>" +
    "<script>window.CAROUSEL_DATA=" + JSON.stringify(runtime).replace(/</g, "\\u003c") + ";</script>";
  const template = loadAppTemplate();
  fs.writeFileSync(htmlFile, template.replace(MARKER, payload), "utf8");
  const pngs = [];
  const errors = [];
  if (!chrome) {
    return JSON.stringify({
      preview: {
        ok: false,
        reason: "no-chrome",
        note: "No se encontró Chrome/Chromium headless. Abrí el HTML de preview y exportá PNGs desde el editor.",
        format,
        width: canvas.w,
        height: canvas.h,
        htmlPath: htmlFile,
        dir: outDir,
        slides: indices,
        pngs: [],
      },
      nextSteps: [
        "Instalá Google Chrome o pasá la ruta con CHROME_PATH.",
        "Abrí el HTML de preview con ?preview=1&slide=N&format=" + format + " y exportá a mano.",
      ],
    }, null, 2);
  }
  for (const n of indices) {
    const pngPath = path.join(outDir, `slide-${String(n).padStart(2, "0")}.png`);
    const url = fileUrl(htmlFile) + `?preview=1&slide=${n}&format=${format}&t=${Date.now()}`;
    try {
      chromeScreenshot(chrome, url, pngPath, canvas.w, canvas.h);
      let bytes = 0;
      try { bytes = fs.statSync(pngPath).size; } catch {}
      pngs.push({ slide: n, path: pngPath, bytes, width: canvas.w, height: canvas.h });
    } catch (e) {
      errors.push({ slide: n, error: String(e && e.message || e) });
    }
  }
  if (a.open === true && pngs[0]) {
    try {
      if (process.platform === "darwin") spawn("open", [pngs[0].path], { stdio: "ignore", detached: true }).unref();
      else if (process.platform === "linux") spawn("xdg-open", [pngs[0].path], { stdio: "ignore", detached: true }).unref();
    } catch {}
  }
  return JSON.stringify({
    preview: {
      ok: pngs.length > 0 && !errors.length,
      format,
      width: canvas.w,
      height: canvas.h,
      dir: outDir,
      htmlPath: htmlFile,
      chrome,
      pngs,
      errors,
      count: pngs.length,
      requested: indices.length,
    },
    nextSteps: [
      pngs.length
        ? `Leé/verificá los ${pngs.length} PNG(s) con visión (copy, fotos, layout).`
        : "No se generó ningún PNG — revisá errors.",
      errors.length ? "Hay slides con error de render: revisá errors." : "Si el copy o fotos cambiaron, volvé a correr render_preview.",
      "Formatos aceptados: 4:5|feed, 1:1|square, 9:16|story.",
    ],
  }, null, 2);
}
function stripMd(t) {
  return String(t || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
function slidePlainText(s) {
  const texts = { kicker: "", title: "", highlight: "", body: "", items: [] };
  const walk = (nodes) => {
    for (const b of nodes || []) {
      if (b.type === "kicker" && !texts.kicker) texts.kicker = stripMd(b.text);
      if (b.type === "text" && !texts.title) texts.title = stripMd(b.text);
      if (b.type === "highlight" && !texts.highlight) texts.highlight = stripMd(b.text);
      if (b.type === "body") texts.body += (texts.body ? " " : "") + stripMd(b.text);
      if (b.type === "item") {
        const t = stripMd(b.title || b.text);
        const d = stripMd(b.desc);
        if (t) texts.items.push(d ? `${t}: ${d}` : t);
      }
      if (b.type === "slogan" && !texts.slogan) texts.slogan = stripMd(b.text);
      if (b.type === "pill" && b.text) texts.items.push(stripMd(b.text));
      if (b.children) walk(b.children);
    }
  };
  walk(s.elements);
  return texts;
}
function readSourceMd(dir) {
  const file = path.join(dir, "source.md");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const fm = {};
    const m = raw.match(/^---\n([\s\S]*?)\n---/);
    if (m) {
      for (const line of m[1].split("\n")) {
        const kv = line.match(/^(\w+):\s*(.*)$/);
        if (!kv) continue;
        let v = kv[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) { try { v = JSON.parse(v); } catch {} }
        fm[kv[1]] = v;
      }
    }
    const sections = {};
    let cur = null;
    for (const line of raw.split("\n")) {
      const h = line.match(/^##\s+(.+)/);
      if (h) { cur = h[1].trim(); sections[cur] = []; continue; }
      if (cur && line.trim() && !line.startsWith("---") && !line.startsWith("- Extraído")) {
        sections[cur].push(line.trim());
      }
    }
    return { file, frontmatter: fm, sections };
  } catch { return null; }
}
function slugTag(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}
function buildHashtags(terms, category, kitName, max) {
  const out = [];
  const push = (t) => {
    const bare = slugTag(t);
    if (!bare || bare.length < 3) return;
    const tag = "#" + bare;
    if (!out.includes(tag)) out.push(tag);
  };
  for (const t of terms) push(t);
  if (category) push(category);
  if (kitName) push(kitName);
  push("carousel");
  push("contenido");
  push("redessociales");
  push("marketing");
  return out.slice(0, max || 8);
}
function hookVariants(title, highlight, kicker, tone) {
  const t = stripMd(title) || "este carrusel";
  const h = stripMd(highlight);
  const k = stripMd(kicker);
  const base = [
    h ? `${h} — lo que nadie te cuenta.` : `${t}: por qué importa ahora.`,
    `Si solo leés una slide, que sea esta: ${t}.`,
    k ? `${k}: ${t}` : t,
  ];
  const byTone = {
    directo: [`Directo al grano: ${t}.`, h ? `${h}. Punto.` : `${t}. Punto.`],
    inspirador: [`Imaginate ${t.toLowerCase()} — mirá cómo se hace.`, `Cambio real empieza con una idea: ${t}.`],
    informativo: [`${t}: datos, contexto y qué sigue.`, h ? `El dato que cambia todo: ${h}.` : `Todo lo que hay que saber de ${t}.`],
    provocador: [`¿Y si te digo que ${t.toLowerCase()} no es lo que pensás?`, h ? `Esto incomoda: ${h}.` : `La verdad incómoda sobre ${t}.`],
    cercano: [`Te cuento algo que vimos con ${t}…`, `Pasa seguido con ${t}. Mirá esto.`],
  };
  return [...base, ...(byTone[tone] || byTone.informativo)].filter(Boolean).slice(0, 5);
}
function buildCaption(platform, { title, dek, hooks, audience, cta, tone, figures, category, slideCount }) {
  const t = stripMd(title) || "Carrusel";
  const d = stripMd(dek);
  const figLine = figures.length ? `Dato clave: ${figures[0]}.` : "";
  const aud = audience ? ` Para ${audience}.` : "";
  const ends = cta ? cta : "Deslizá para ver el hilo completo →";
  const short = platform === "x";
  const linkedin = platform === "linkedin";
  if (short) {
    const body = [hooks[0] || t, d && !short ? d.slice(0, 120) : "", `${slideCount} slides.`, ends].filter(Boolean);
    return body.join("\n\n").slice(0, 270);
  }
  const paras = [];
  paras.push(hooks[0] || t);
  if (d) paras.push(d + aud);
  else paras.push(`Un hilo de ${slideCount} slides con lo esencial de ${t}.${aud}`);
  if (figLine) paras.push(figLine);
  if (linkedin) {
    paras.push("Guardalo y compartilo si te sirvió.");
    paras.push(ends);
  } else {
    paras.push("Guardá el post y compartilo con quien lo necesite 💾");
    paras.push(ends);
  }
  if (hooks[1] && !short) paras.push(`\nOtro gancho: ${hooks[1]}`);
  return paras.join("\n\n");
}
function altTextFor(slide, texts, index) {
  const parts = [texts.kicker, texts.title, texts.highlight].filter(Boolean).map(stripMd);
  const core = parts.join(" — ") || stripMd(slide.template) || `Slide ${index + 1}`;
  const extra = texts.body ? stripMd(texts.body).slice(0, 40) : "";
  let alt = extra && !core.includes(extra) ? `${core}. ${extra}` : core;
  if (alt.length > 125) alt = alt.slice(0, 122).replace(/\s+\S*$/, "") + "…";
  if (!alt) alt = `Slide ${index + 1} del carrusel`;
  return alt.slice(0, 125);
}
function toolSocialCopy(args) {
  const a = args || {};
  const company = slug(a.company || "");
  const name = slug(a.name || a.slug || "");
  if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
  const record = readCarousel(company, name);
  const stored = record.stored;
  const meta = stored.meta || {};
  const title = meta.title || name;
  const category = meta.category || "";
  const kitName = (stored.kit && stored.kit.name) || "";
  const source = readSourceMd(record.dir);
  const dek = (source && (source.frontmatter.dek || (source.sections["Descripción curada"] || []).join(" "))) || "";
  const tone = a.tone || "informativo";
  const audience = a.audience || "";
  const language = a.language || "es-AR";
  const platforms = (Array.isArray(a.platforms) && a.platforms.length
    ? a.platforms
    : ["instagram", "linkedin"]
  ).map((p) => String(p).toLowerCase()).filter((p) => ["instagram", "linkedin", "x", "facebook", "tiktok"].includes(p));
  if (!platforms.length) throw new Error("`platforms` vacío o inválido.");
  const slides = stored.slides || [];
  if (!slides.length) throw new Error("El carrusel no tiene slides.");
  const slideTexts = slides.map((s) => slidePlainText(s));
  const cover = slideTexts[0] || {};
  const allText = slideTexts.map((st) => [st.kicker, st.title, st.highlight, st.body, ...(st.items || [])].filter(Boolean).join(" ")).join(" ");
  const figures = [...extractFigures(allText)];
  const terms = [
    cover.title, cover.highlight, cover.kicker, title,
    ...(source && source.sections["Puntos"] ? source.sections["Puntos"].slice(0, 3).map((x) => x.replace(/^-\s*/, "")) : []),
  ].filter(Boolean);
  const hooks = hookVariants(title, cover.highlight || figures[0], cover.kicker, tone);
  const hashtagBudget = { instagram: 8, linkedin: 5, x: 2, facebook: 6, tiktok: 8 };
  const includeHashtags = a.includeHashtags !== false;
  const captions = {};
  const hashtags = {};
  for (const p of platforms) {
    captions[p] = buildCaption(p, {
      title, dek: dek || meta.description || "", hooks, audience,
      cta: a.cta || "", tone, figures, category, slideCount: slides.length,
    });
    if (includeHashtags) {
      const max = Number.isFinite(a.maxHashtags) && a.maxHashtags > 0 ? Math.min(a.maxHashtags, 30) : hashtagBudget[p];
      hashtags[p] = buildHashtags(terms, category, kitName, max);
      if (hashtags[p].length && p !== "x") {
        captions[p] = captions[p] + "\n\n" + hashtags[p].join(" ");
      } else if (hashtags[p].length && p === "x") {
        captions[p] = (captions[p] + " " + hashtags[p].join(" ")).slice(0, 280);
      }
    } else {
      hashtags[p] = [];
    }
  }
  const altTexts = slideTexts.map((st, i) => ({
    slide: i + 1,
    template: slides[i] && slides[i].template,
    alt: altTextFor(slides[i] || {}, st, i),
    chars: altTextFor(slides[i] || {}, st, i).length,
  }));
  const result = {
    company, slug: name, title, language, tone, audience: audience || null,
    source: source ? { path: source.file, used: true } : { used: false, note: "Sin source.md — copy basado solo en slides/meta." },
    hooks,
    captions,
    hashtags,
    altTexts,
    figures: figures.slice(0, 8),
    charLimits: { instagram: 2200, linkedin: 3000, x: 280, facebook: 63206, tiktok: 2200 },
    notes: [
      "Copy generado con heurísticas locales (sin API). Revisá y ajustá tono/CTA a mano.",
      "altText ≤125 chars por accesibilidad; no repetir el título literal si la slide ya lo dice.",
      "Hashtags: recortá a los relevantes para tu audiencia antes de publicar.",
    ],
    nextSteps: [
      "Elegí el caption de la plataforma y pegalo en el scheduler/redacción.",
      "Revisá altTexts contra las fotos reales (PHOTO REVIEW PROTOCOL).",
      "Si querés persistir, pasá save:true para escribir social.md.",
    ],
  };
  let savedPath = null;
  if (a.save === true) {
    const sf = path.join(record.dir, "social.md");
    const lines = [
      `# Social copy — ${title}`,
      "",
      `- company: ${company}`,
      `- slug: ${name}`,
      `- tone: ${tone}`,
      `- language: ${language}`,
      `- generatedAt: ${new Date().toISOString()}`,
      "",
      "## Hooks",
      "",
      ...hooks.map((h, i) => `${i + 1}. ${h}`),
      "",
      ...platforms.map((p) => `## Caption — ${p}\n\n${captions[p]}\n`),
      "## Hashtags",
      "",
      ...platforms.map((p) => `- ${p}: ${(hashtags[p] || []).join(" ") || "(ninguno)"}\n`),
      "## Alt texts",
      "",
      ...altTexts.map((x) => `- slide ${x.slide} (${x.template}): ${x.alt}`),
      "",
      "## Notas",
      "",
      ...result.notes.map((n) => `- ${n}`),
      "",
    ];
    fs.writeFileSync(sf, lines.join("\n"), "utf8");
    savedPath = sf;
    result.saved = sf;
  }
  return JSON.stringify(result, null, 2);
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
    case "edit_slide": return await toolEditSlide(args);
    case "import_editor_state": return await toolImportEditorState(args);
    case "render_preview": return toolRenderPreview(args);
    case "social_copy": return toolSocialCopy(args);
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
