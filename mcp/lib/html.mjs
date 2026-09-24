import { safeFetch } from "./net.mjs";

export function metaContent(html, attr, val) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${val}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const c = m[0].match(/content=["']([^"']+)["']/i);
  return c ? c[1].trim() : null;
}
export function linksHref(html, relRe) {
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
export async function fetchBrandHTML(url) {
  const res = await safeFetch(url, { accept: "text/html", timeoutMs: 15000, maxBytes: 1500000 });
  if (res.contentType && !/text\/html|text\/plain|application\/xhtml/i.test(res.contentType)) {
    throw new Error(`Contenido no-HTML (${res.contentType})`);
  }
  if (res.buffer.length > 1500000) throw new Error("HTML mayor a 1.5MB, abortado por seguridad.");
  return res.buffer.toString("utf8");
}
