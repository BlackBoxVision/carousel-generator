import fs from "node:fs";
import path from "node:path";
import { BAD_IMG_HINTS, DATA_FIG_RE, LIST_EMOJIS } from "./const.mjs";
import { metaContent } from "./html.mjs";
import { decodeEntities } from "./text.mjs";

export function normalizeImageUrl(raw, pageUrl) {
  const u = String(raw || "").trim();
  if (!u || u.startsWith("data:")) return null;
  try {
    const parsed = new URL(u, pageUrl);
    if (/\/_next\/image$/.test(parsed.pathname)) {
      const inner = parsed.searchParams.get("url");
      if (inner) return new URL(decodeURIComponent(inner), pageUrl).href;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
export function extractArticle(html, pageUrl) {
  const u = new URL(pageUrl);
  const site = metaContent(html, "property", "og:site_name") || u.hostname.replace(/^www\./, "");
  const title = decodeEntities(
    metaContent(html, "property", "og:title") || (html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i) || [])[1] || "",
  );
  const dek = decodeEntities(
    metaContent(html, "property", "og:description") || metaContent(html, "name", "description") || "",
  );
  const ogImage = metaContent(html, "property", "og:image") || metaContent(html, "name", "twitter:image") || "";
  const bodyHtml = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const clean = (raw) =>
    decodeEntities(
      String(raw || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " "),
    );
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
  while ((m = imgRe.exec(bodyHtml))) {
    const n = normalizeImageUrl(m[1], pageUrl);
    if (n) imgs.push(n);
  }
  const wpRe = /(?:https?:\/\/)?(?:i\d|wp\d?|s\d)?\.?wp\.com\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp)/gi;
  while ((m = wpRe.exec(html))) {
    let u2 = m[0];
    if (!/^https?:\/\//i.test(u2)) u2 = "https://" + u2;
    const n = normalizeImageUrl(u2, pageUrl);
    if (n) imgs.push(n);
  }
  return {
    site,
    title,
    dek,
    ogImage: normalizeImageUrl(ogImage, pageUrl) || "",
    paras,
    items,
    imgs: [...new Set(imgs)],
  };
}
export function pickPhotoCandidates(article) {
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
export function splitTitleForCover(t) {
  const words = String(t).trim().split(/\s+/);
  if (words.length <= 3) return { white: words.join(" ").toUpperCase(), orange: "" };
  const target = Math.max(2, Math.round(words.length * 0.4));
  let idx = target;
  for (let i = target; i < Math.min(words.length, target + 4); i++) {
    if (/%|\d|millones/i.test(words[i])) {
      idx = i + 1;
      break;
    }
  }
  return { white: words.slice(0, idx).join(" ").toUpperCase(), orange: words.slice(idx).join(" ").toUpperCase() };
}
export function detectCategory(html) {
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
          const names = node.itemListElement
            .map((x) => {
              const it = x && (x.item || x);
              return (
                it &&
                (typeof it === "string"
                  ? it
                  : it.name || (typeof it.item === "string" ? null : it.item && it.item.name))
              );
            })
            .filter(Boolean)
            .map((n) => String(n).trim());
          const pick = names
            .filter((n) => n && !/^(home|inicio|portada|principal)$/i.test(n) && !/^https?:/i.test(n))
            .pop();
          if (pick) return { category: decodeEntities(pick), source: "BreadcrumbList" };
        }
      }
    } catch {}
  }
  const bodyHtml = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const mainHtml =
    (bodyHtml.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i) || [bodyHtml])[1] || bodyHtml;
  const counts = {};
  const re =
    /<a[^>]+href=["'][^"']*\/(?:categor(?:y|ies|ia|ias)|secci[oó]n|seccion|tema|tags?)\/([a-z0-9\-_%]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
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
export function writeSourceMd(dir, { url, title, site, dek, category, paras, items }) {
  const file = path.join(dir, "source.md");
  if (fs.existsSync(file)) return { file, wrote: false, reason: "ya existía, no sobrescrito" };
  const figParas = (paras || []).filter((p) => DATA_FIG_RE.test(p)).slice(0, 5);
  const keyParas = figParas.length ? figParas : (paras || []).slice(0, 3);
  const curated = [dek || "", ...(keyParas || []).map((p) => (p.length > 400 ? p.slice(0, 397).trimEnd() + "…" : p))]
    .filter(Boolean)
    .join("\n\n");
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
export { DATA_FIG_RE, LIST_EMOJIS };
