import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONVERTIBLE_EXTS, IMG_EXTS } from "./const.mjs";
import { brandDir } from "./paths.mjs";
import { expandHome } from "./text.mjs";

export function convertToJpeg(file) {
  const ext = path.extname(file).toLowerCase();
  if (!CONVERTIBLE_EXTS.has(ext)) return file;
  if (process.platform !== "darwin") {
    throw new Error(
      `No se pudo convertir "${ext}" a jpg: la conversión requiere sips (solo disponible en macOS). Convertí el archivo manualmente y pasá el .jpg.`,
    );
  }
  // Nunca escribir al lado del archivo de origen: puede ser tu .jpg original.
  // La conversión va a un tmp limpio que el caller debe borrar.
  const dir = path.join(os.tmpdir(), "carousel-convert");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  try {
    const r = spawnSync("sips", ["-s", "format", "jpeg", file, "--out", out], { encoding: "utf8" });
    if (r.status === 0 && fs.existsSync(out)) return out;
  } catch {}
  throw new Error(
    `No se pudo convertir "${ext}" a jpg (se requiere sips en macOS). Convertí el archivo manualmente y pasá el .jpg.`,
  );
}
export function imageSize(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(off + 7), h: buf.readUInt16BE(off + 5) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}
export function imageDimensions(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { width: null, height: null };
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = b[p + 1];
    const length = b.readUInt16BE(p + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { width: b.readUInt16BE(p + 7), height: b.readUInt16BE(p + 5) };
    p += 2 + length;
  }
  return { width: null, height: null };
}
export function dataUrlParts(value) {
  const m = String(value || "").match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mime: m[1], buffer: Buffer.from(m[2], "base64") } : null;
}
export function extensionForMime(mime) {
  const found = Object.entries(IMG_EXTS).find(([, value]) => value === mime);
  return found ? found[0] : ".jpg";
}
export function fileDataURL(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = IMG_EXTS[ext] || "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}
export function loadImageDataURL(ref, scope) {
  let p = String(ref);
  if (/^file:/.test(p)) p = p.replace(/^file:(\/\/)?/, "");
  p = expandHome(p);
  if (!path.isAbsolute(p)) {
    const scoped = scope ? path.join(brandDir(), scope, p) : null;
    if (scoped && fs.existsSync(scoped)) p = scoped;
    else p = path.join(brandDir(), p);
  }
  if (!fs.existsSync(p))
    throw new Error(
      `Logo no encontrado: ${p}. Rutas relativas se buscan en la carpeta de la empresa (~/.carousel-generator/brand/{empresa}/) y luego en ~/.carousel-generator/brand/.`,
    );
  const ext = path.extname(p).toLowerCase();
  const mime = IMG_EXTS[ext];
  if (!mime) throw new Error(`Formato de logo no soportado: "${ext}". Usá PNG, JPG, WEBP, GIF o SVG.`);
  return `data:${mime};base64,` + fs.readFileSync(p).toString("base64");
}
export async function downloadPhotoToTmp(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await globalThis.fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "carousel-generator/2.2 (+carousel-from-url)" },
    });
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
  } finally {
    clearTimeout(t);
  }
}
