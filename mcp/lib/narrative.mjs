import { DATA_FIG_RE, STYLE_CLICHES } from "./const.mjs";
import { excerptText, significantTokens } from "./text.mjs";
import { walkBlocks } from "./blocks.mjs";

export function extractFigures(text) {
  const out = new Set();
  const re = /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d[\d.,]*\s?(?:millones|millón|miles|mil)\b|\b\d{1,3}(?:\.\d{3})+\b/gi;
  let m;
  const t = String(text || "");
  while ((m = re.exec(t))) out.add(m[0].replace(/\s+/g, " ").trim().toLowerCase());
  return out;
}
export function collectSlideTexts(slide) {
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
export function narrativeAudit(slides, title) {
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
export function boldifyData(text) {
  let t = String(text == null ? "" : text);
  if (!t || /\*\*|==/.test(t)) return t;
  const RE = /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*(?:\s?(?:millones|millón|miles|mil|MM)|\s?[Mm](?![a-záéíóúñ]))?|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s?(?:millones|millón|miles|mil|meses|mes|años|días|horas|puntos|personas|toneladas)\b|\b(?:[Dd]os|[Tt]res|[Cc]uatro|[Cc]inco|[Ss]eis|[Ss]iete|[Oo]cho|[Nn]ueve|[Dd]iez|[Oo]nce|[Dd]oce)\s+(?:meses|mes|años|días|semanas|puntos|personas|millones|miles)\b/gi;
  return t.replace(RE, (m) => `**${m.trim()}**`);
}
export function applyBoldify(slides) {
  const walk = (nodes) => { for (const el of nodes || []) { if (el.type === "body") el.text = boldifyData(el.text); if (el.children) walk(el.children); } };
  for (const s of slides) {
    s.paragraphs = (s.paragraphs || []).map(boldifyData);
    walk(s.elements);
  }
  return slides;
}
export function hasNoEsContrast(t) {
  const re = /\bno\s+(?:es|son|fue|fueron|será|serán|era|eran)\b|\bno\s+s[oó]lo\b/ig;
  let m;
  while ((m = re.exec(t))) {
    const rest = t.slice(m.index + m[0].length).split(/[.!?…\n]/, 1)[0].slice(0, 80);
    if (/\bsino\b/i.test(rest) || /\b(?:es|son)\b/i.test(rest)) return true;
  }
  return false;
}
export function lintSlideTexts(slides) {
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
export function formatStyleWarnings(warnings) {
  if (!warnings.length) return [];
  return ["", "Advertencias de estilo (regla de textos: sin raya larga —, sin 'no es X, es Y', sin clichés de IA):",
    ...warnings.map((w) => `  - slide ${w.slide} (${w.field}): ${w.detail} en "${w.excerpt}"`)];
}
export function applyCategoryColors(slides, kit, category) {
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
export { DATA_FIG_RE };
