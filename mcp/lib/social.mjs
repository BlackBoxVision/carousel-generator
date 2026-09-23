import fs from "node:fs";
import path from "node:path";
import { stripMd, slugTag } from "./text.mjs";
import { extractFigures } from "./narrative.mjs";

export function slidePlainText(s) {
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
export function readSourceMd(dir) {
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
export function buildHashtags(terms, category, kitName, max) {
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
export function hookVariants(title, highlight, kicker, tone) {
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
export function buildCaption(platform, { title, dek, hooks, audience, cta, tone, figures, category, slideCount }) {
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
export function altTextFor(slide, texts, index) {
  const parts = [texts.kicker, texts.title, texts.highlight].filter(Boolean).map(stripMd);
  const core = parts.join(" — ") || stripMd(slide.template) || `Slide ${index + 1}`;
  const extra = texts.body ? stripMd(texts.body).slice(0, 40) : "";
  let alt = extra && !core.includes(extra) ? `${core}. ${extra}` : core;
  if (alt.length > 125) alt = alt.slice(0, 122).replace(/\s+\S*$/, "") + "…";
  if (!alt) alt = `Slide ${index + 1} del carrusel`;
  return alt.slice(0, 125);
}
export { extractFigures };
