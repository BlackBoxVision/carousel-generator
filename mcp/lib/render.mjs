import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { normSlideArg, partitionListSlides } from "./blocks.mjs";
import { canvasForFormat, MARKER, TEMPLATES } from "./const.mjs";
import { loadAppTemplate } from "./handoff.mjs";
import { brandKitsPayload, resolveKit } from "./kits.mjs";
import { applyBoldify, applyCategoryColors } from "./narrative.mjs";
import { expandHome, slug } from "./text.mjs";

export function renderCarousel(data, args = {}) {
  const activeSlug = (data && data.kitSource && data.kitSource.slug) || (data && data.kit && data.kit.name) || "";
  const brands = brandKitsPayload(activeSlug);
  const html = loadAppTemplate();
  const payload =
    "<script>window.BRAND_KITS=" +
    JSON.stringify(brands).replace(/</g, "\\u003c") +
    ";</script>" +
    "<script>window.CAROUSEL_DATA=" +
    JSON.stringify(data).replace(/</g, "\\u003c") +
    ";</script>";
  // replace con función: payload puede contener $& / $` que si no se interpretan
  const out = html.replace(MARKER, () => payload);
  const dir = expandHome(args.outputDir || "~/Downloads");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toTimeString().slice(0, 5).replace(":", "");
  let base;
  if (args.fileName) base = slug(args.fileName);
  else if (data && data.company && data.slug) base = `${slug(data.company)}-${slug(data.slug)}`;
  else base = slug(data.meta.title) + "-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const antiCache =
    args.stable === true || args.fileName || (data && data.company && data.slug) ? base : base + "-" + stamp;
  const file = path.join(dir, antiCache + ".html");
  fs.writeFileSync(file, out, "utf8");
  if (args.open === true) {
    // spawn sin listener 'error' mata al proceso MCP si open/xdg-open no existe (ej: Linux sin xdg-utils)
    try {
      const opened =
        process.platform === "darwin"
          ? spawn("open", [file], { stdio: "ignore", detached: true })
          : process.platform === "linux"
            ? spawn("xdg-open", [file], { stdio: "ignore", detached: true })
            : null;
      if (opened) {
        opened.on("error", () => {});
        opened.unref();
      }
    } catch {}
  }
  return file;
}
/**
 * Igual que renderCarousel pero nunca lanza: los tools que ya persistieron
 * deben devolver warning en vez de error (el cambio ya está en disco).
 */
export function renderCarouselSafe(data, args = {}) {
  try {
    return { file: renderCarousel(data, args), warning: null };
  } catch (e) {
    return { file: null, warning: `No se pudo re-renderizar el HTML: ${e && e.message ? e.message : e}` };
  }
}
export function runtimeDataFromArgs(args) {
  const a = args || {};
  const kit = resolveKit(a.kitName, a.kit);
  const slidesIn = Array.isArray(a.slides) && a.slides.length ? a.slides : TEMPLATES.map((template) => ({ template }));
  const slides = applyBoldify(
    partitionListSlides(
      slidesIn.map((slide, index) => {
        const out = normSlideArg(slide);
        out.id = out.id || `slide-${index + 1}`;
        return out;
      }),
    ),
  );
  const title = String(a.title || "Carrusel");
  const format = ["feed", "square", "story"].includes(a.format) ? a.format : "feed";
  const category = String((a.meta && a.meta.category) || a.category || "").trim();
  applyCategoryColors(slides, kit, category);
  return {
    version: 2,
    company: slug(a.company || a.kitName || kit.name || "default"),
    slug: slug(a.carouselName || a.fileName || title),
    kit,
    kitSource: { store: "generated", slug: slug(kit.name || "kit") },
    meta: {
      title,
      format,
      canvas: canvasForFormat(format),
      showCount: a.showNumbers !== false,
      ...(category ? { category } : {}),
    },
    slides,
  };
}
