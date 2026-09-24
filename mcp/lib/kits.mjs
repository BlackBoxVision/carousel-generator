import fs from "node:fs";
import path from "node:path";
import { DEFAULT_KIT } from "./const.mjs";
import { loadImageDataURL } from "./images.mjs";
import { brandDir, companyKitFile, legacyKitsDir, REPO_KITS } from "./paths.mjs";
import { clone, deepMerge, slug } from "./text.mjs";

export function findKitFile(name) {
  const sl = slug(name);
  const company = companyKitFile(sl);
  if (fs.existsSync(company)) return { file: company, scope: sl };
  const legacy = path.join(legacyKitsDir(), sl + ".json");
  if (fs.existsSync(legacy)) {
    process.stderr.write(`[carousel-mcp] kit "${sl}" en layout anterior (${legacy}); movelo a ${company}\n`);
    return { file: legacy, scope: sl };
  }
  const repo = path.join(REPO_KITS, sl + ".json");
  if (fs.existsSync(repo)) return { file: repo, scope: null };
  return null;
}
export function availableKitNames() {
  return Object.keys(allKitsRaw()).sort();
}
export function allKitsRaw() {
  const out = {};
  const BRAND_DIR = brandDir();
  const LEGACY_KITS = legacyKitsDir();
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
        out[sl] = {
          kit: JSON.parse(fs.readFileSync(path.join(LEGACY_KITS, f), "utf8")),
          source: "personal-legacy",
          scope: sl,
        };
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
export function resolveLogo(kit, scope) {
  const l = kit && kit.logo;
  if (l && typeof l.imagePath === "string" && l.imagePath.trim()) {
    const p = l.imagePath.trim();
    if (/^https?:\/\//i.test(p)) {
      throw new Error("`logo.imagePath` debe ser una ruta local (no URL); usá save_brand_kit con img en base64.");
    }
    l.img = loadImageDataURL(p, scope);
    delete l.imagePath;
  }
  return kit;
}
export function resolveKit(name, inline) {
  let base,
    scope = null;
  if (!name) {
    const kits = allKitsRaw();
    const firstUserKit = Object.values(kits).find(
      (k) => k && k.kit && (k.source === "personal" || k.source === "injected"),
    );
    if (firstUserKit) {
      base = JSON.parse(JSON.stringify(firstUserKit.kit));
      scope = firstUserKit.scope;
    } else base = clone(DEFAULT_KIT);
  } else {
    const found = findKitFile(name);
    if (!found) {
      const avail = availableKitNames();
      throw new Error(
        `Brand kit "${name}" no existe. Disponibles: ${avail.length ? avail.join(", ") : "(ninguno)"}. Usá save_brand_kit para crear uno.`,
      );
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
export function brandKitsPayload(activeSlug) {
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
