import dns from "node:dns/promises";
import net from "node:net";

/**
 * Fetch saliente con guardas: solo http(s), sin IPs privadas/loopback/link-local
 * (SSRF), redirects manuales con tope, timeout y tope de bytes streaming.
 * Bypass: CAROUSEL_GENERATOR_ALLOW_LOCAL=1 (tests con fixture server local).
 */

export function allowLocal() {
  const v = process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
  return v === "1" || v === "true";
}

function ipv4Parts(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  return m ? [1, 2, 3, 4].map((i) => Number(m[i])) : null;
}

export function isPrivateAddress(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ipv4Parts(ip);
    if (!p) return true;
    const [a, b] = p;
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6.includes("%")) return isPrivateAddress(v6.split("%")[0]);
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7)); // mapped v4
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd]/.test(v6)) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(v6)) return true; // link-local fe80::/10
  if (/^ff/.test(v6)) return true; // multicast
  return false;
}

function localishHostname(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.endsWith(".localdomain")) return true;
  return false;
}

async function assertPublicTarget(url) {
  if (allowLocal()) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (localishHostname(host)) {
    throw new Error(
      `URL bloqueada: "${host}" es local. Seteá CAROUSEL_GENERATOR_ALLOW_LOCAL=1 para permitir hosts locales (tests).`,
    );
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error(
        `URL bloqueada: ${host} es una dirección privada/reservada. Seteá CAROUSEL_GENERATOR_ALLOW_LOCAL=1 si es intencional.`,
      );
    }
    return;
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw new Error(`No se pudo resolver "${host}": ${e && e.message ? e.message : e}`);
  }
  if (!addrs.length) throw new Error(`No se pudo resolver "${host}".`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new Error(
        `URL bloqueada: "${host}" resuelve a una dirección privada/reservada (${a.address}). Seteá CAROUSEL_GENERATOR_ALLOW_LOCAL=1 si es intencional.`,
      );
    }
  }
}

async function readCapped(res, maxBytes) {
  const cl = Number(res.headers.get("content-length"));
  if (Number.isFinite(cl) && cl > maxBytes) {
    throw new Error(`Contenido demasiado grande (${cl} bytes > ${maxBytes} permitidos).`);
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw new Error(`Contenido mayor a ${maxBytes} bytes, abortado por seguridad.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * @returns {Promise<{buffer: Buffer, contentType: string, url: string, status: number}>}
 */
export async function safeFetch(rawUrl, opts = {}) {
  const { headers = {}, timeoutMs = 15000, maxBytes = 6000000, maxRedirects = 3, requireOk = true, accept } = opts;
  let current;
  try {
    current = new URL(String(rawUrl));
  } catch {
    throw new Error(`URL inválida: ${String(rawUrl).slice(0, 120)}`);
  }
  const baseHeaders = {
    "User-Agent": "carousel-generator/2.4 (+mcp)",
    ...(accept ? { Accept: accept } : {}),
    ...headers,
  };
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error(`Protocolo no permitido: ${current.protocol} (solo http/https).`);
    }
    await assertPublicTarget(current);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await globalThis.fetch(current, { redirect: "manual", signal: ctl.signal, headers: baseHeaders });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        try {
          await res.body?.cancel();
        } catch {}
        if (!loc) throw new Error(`HTTP ${res.status} sin header location en ${current.href}`);
        current = new URL(loc, current);
        continue;
      }
      if (requireOk && !res.ok) throw new Error(`HTTP ${res.status} al pedir ${current.href}`);
      const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const buffer = await readCapped(res, maxBytes);
      return { buffer, contentType, url: current.href, status: res.status };
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error(`Timeout (${timeoutMs}ms) al pedir ${current.href}`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Demasiados redirects (> ${maxRedirects}) al pedir ${rawUrl}`);
}
