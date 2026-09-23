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
