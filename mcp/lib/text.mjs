import os from "node:os";
import { STOPWORDS } from "./const.mjs";

export function expandHome(p) {
  return String(p).replace(/^~(?=\/|$)/, os.homedir());
}
export function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "carrusel";
}
export function deepMerge(base, over) {
  if (over === null || over === undefined) return base;
  if (typeof base !== "object" || typeof over !== "object" || Array.isArray(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}
export function clone(o) { return JSON.parse(JSON.stringify(o)); }
export function decodeEntities(t) {
  return String(t || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (x, n) => { try { return String.fromCodePoint(+n); } catch { return x; } })
    .replace(/\s+/g, " ").trim();
}
export function excerptText(t) {
  const s = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  return s.length > 70 ? s.slice(0, 67).trimEnd() + "…" : s;
}
export function slugTag(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}
export function stripMd(t) {
  return String(t || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
export function significantTokens(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}
