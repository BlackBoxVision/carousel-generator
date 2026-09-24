import fs from "node:fs";
import path from "node:path";
import { BLOCK_TYPES, canvasForFormat, IMG_EXTS } from "./const.mjs";
import { pruneAssets, writeJsonAtomic } from "./fsutil.mjs";
import { dataUrlParts, extensionForMime, fileDataURL, imageDimensions } from "./images.mjs";
import { carouselPath } from "./paths.mjs";
import { clone, expandHome, slug } from "./text.mjs";

export function assetName(stem, ext) {
  return `${slug(stem).slice(0, 42) || "asset"}${ext || ".jpg"}`;
}
export function copyImageAsset(ref, assetsDir, stem, baseDir, manifest, kind = "photo") {
  const sourcePath = ref && ref.sourcePath ? expandHome(ref.sourcePath) : null;
  const assetRef = ref && ref.asset ? String(ref.asset) : "";
  const assetPath = assetRef && baseDir ? path.resolve(baseDir, assetRef) : null;
  const data = ref && dataUrlParts(ref.src);
  let source = sourcePath && fs.existsSync(sourcePath) ? sourcePath : null;
  if (!source && assetPath && fs.existsSync(assetPath)) source = assetPath;
  let ext = source ? path.extname(source).toLowerCase() : data ? extensionForMime(data.mime) : ".jpg";
  if (!IMG_EXTS[ext]) ext = ".jpg";
  const name = assetName(stem, ext);
  const target = path.join(assetsDir, name);
  if (source) fs.copyFileSync(source, target);
  else if (data) fs.writeFileSync(target, data.buffer);
  else if (assetRef) return assetRef;
  else return null;
  const rel = `assets/${name}`;
  const dimensions = imageDimensions(target);
  manifest.push({ id: slug(stem), file: rel, kind, mime: IMG_EXTS[ext] || "image/jpeg", ...dimensions });
  return rel;
}
export function persistCarousel(data, company, name, baseDir) {
  const dir = carouselPath(company, name);
  const assetsDir = path.join(dir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const stored = clone(data);
  const manifest = [];
  stored.version = 2;
  stored.company = slug(company);
  stored.slug = slug(name);
  stored.updatedAt = new Date().toISOString();
  stored.createdAt = stored.createdAt || stored.updatedAt;
  stored.blockVocabulary = BLOCK_TYPES;
  stored.meta = {
    ...(stored.meta || {}),
    canvas: (stored.meta && stored.meta.canvas) || canvasForFormat((stored.meta && stored.meta.format) || "feed"),
    defaults: {
      brand: { topPct: 3.8, leftPct: 6.2, logoH: 48 },
      count: { topPct: 3.8, rightPct: 6.2 },
      copy: { anchor: "bottom", offsetPct: 0, widthPct: 87.6, maxHeightPct: 62 },
    },
  };
  if (stored.kit && stored.kit.logo && (stored.kit.logo.img || stored.kit.logo.asset)) {
    const logo = copyImageAsset(
      { src: stored.kit.logo.img, asset: stored.kit.logo.asset },
      assetsDir,
      "logo",
      baseDir,
      manifest,
      "logo",
    );
    if (logo) stored.kit.logo = { ...stored.kit.logo, asset: logo };
    delete stored.kit.logo.img;
  }
  for (const [index, slide] of (stored.slides || []).entries()) {
    slide.id = slide.id || `slide-${index + 1}`;
    for (const legacy of [
      "eyebrow",
      "titleWhite",
      "titleOrange",
      "paragraphs",
      "items",
      "pills",
      "ctaBox",
      "slogan",
      "foot",
      "align",
      "copyPos",
      "__mcp",
    ])
      delete slide[legacy];
    if (slide.bg) {
      if (slide.scrim !== undefined) slide.bg.scrim = slide.scrim;
      if (slide.bgPos !== undefined) slide.bg.bgPos = slide.bgPos;
      if (slide.overlayLight !== undefined) slide.bg.overlayLight = slide.overlayLight;
      delete slide.scrim;
      delete slide.bgPos;
      delete slide.overlayLight;
    }
    if (slide.bg && slide.bg.type === "photo") {
      const asset = copyImageAsset(slide.bg, assetsDir, `${slide.id}-background`, baseDir, manifest);
      if (asset) slide.bg.asset = asset;
      delete slide.bg.src;
      delete slide.bg.sourcePath;
    }
  }
  stored.assets = manifest;
  const file = path.join(dir, "carousel.json");
  writeJsonAtomic(file, stored);
  pruneAssets(dir, manifest);
  return { dir, file, data: stored };
}
export function hydrateCarousel(stored, dir) {
  const data = clone(stored);
  if (data.kit && data.kit.logo && data.kit.logo.asset) {
    const file = path.resolve(dir, data.kit.logo.asset);
    if (fs.existsSync(file)) data.kit.logo.img = fileDataURL(file);
  }
  for (const slide of data.slides || []) {
    if (slide.bg) {
      if (slide.bg.scrim !== undefined) slide.scrim = slide.bg.scrim;
      if (slide.bg.bgPos !== undefined) slide.bgPos = slide.bg.bgPos;
      if (slide.bg.overlayLight !== undefined) slide.overlayLight = slide.bg.overlayLight;
    }
    if (slide.bg && slide.bg.type === "photo" && slide.bg.asset) {
      const file = path.resolve(dir, slide.bg.asset);
      if (fs.existsSync(file)) slide.bg.src = fileDataURL(file);
    }
  }
  return data;
}
export function readCarousel(company, name) {
  const dir = carouselPath(company, name);
  const file = path.join(dir, "carousel.json");
  if (!fs.existsSync(file)) throw new Error(`Carrusel "${slug(company)}/${slug(name)}" no existe.`);
  const raw = fs.readFileSync(file, "utf8");
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `carousel.json corrupto en "${slug(company)}/${slug(name)}": ${e.message}. Restaurá o re-creá el carrusel (delete_carousel + generate_carousel).`,
    );
  }
  if (!stored || typeof stored !== "object" || !Array.isArray(stored.slides)) {
    throw new Error(
      `carousel.json inválido en "${slug(company)}/${slug(name)}": se esperaba un objeto con slides[]. Restaurá o re-creá el carrusel.`,
    );
  }
  return { dir, file, stored };
}
