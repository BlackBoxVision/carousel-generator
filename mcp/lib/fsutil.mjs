import fs from "node:fs";
import path from "node:path";

/**
 * Writes JSON atomically (temp file + rename) so a crash mid-write can never
 * leave a truncated carousel.json / kit.json behind.
 */
export function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return file;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg|avif|heic|heif)$/i;

/**
 * Reconciles the asset folder with the manifest:
 * - drops manifest entries whose file disappeared
 * - deletes image files in assets/ that no manifest entry references
 * Returns { removed: string[], dropped: string[] }.
 */
export function pruneAssets(dir, manifest) {
  const assetsDir = path.join(dir, "assets");
  const removed = [];
  const dropped = [];
  if (Array.isArray(manifest)) {
    for (let i = manifest.length - 1; i >= 0; i--) {
      const entry = manifest[i];
      const rel = entry && entry.file ? entry.file : null;
      const abs = rel ? path.resolve(dir, rel) : null;
      if (!abs || !abs.startsWith(assetsDir + path.sep) || !fs.existsSync(abs)) {
        dropped.push(rel || `#${i}`);
        manifest.splice(i, 1);
      }
    }
  }
  if (!fs.existsSync(assetsDir) || !Array.isArray(manifest)) return { removed, dropped };
  const keep = new Set(manifest.map((entry) => path.basename(entry.file)));
  for (const file of fs.readdirSync(assetsDir)) {
    if (file.startsWith(".") || keep.has(file) || !IMAGE_EXT.test(file)) continue;
    try {
      fs.unlinkSync(path.join(assetsDir, file));
      removed.push(file);
    } catch {
      /* best effort */
    }
  }
  return { removed, dropped };
}
