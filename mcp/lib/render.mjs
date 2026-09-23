import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MARKER, TEMPLATES, canvasForFormat } from "./const.mjs";
import { expandHome, slug } from "./text.mjs";
import { brandKitsPayload, resolveKit } from "./kits.mjs";
import { loadAppTemplate } from "./handoff.mjs";
import { applyBoldify, applyCategoryColors } from "./narrative.mjs";
import { normSlideArg, partitionListSlides } from "./blocks.mjs";

export function renderCarousel(data, args = {}) {
  const activeSlug = (data && data.kitSource && data.kitSource.slug) || (data && data.kit && data.kit.name) || "";
  const brands = brandKitsPayload(activeSlug);
  const html = loadAppTemplate();
  const payload =
    "<script>window.BRAND_KITS=" + JSON.stringify(brands).replace(/</g, "\\u003c") + ";</script>" +
    "<script>window.CAROUSEL_DATA=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";</script>";
  const out = html.replace(MARKER, payload);
  const dir = expandHome(args.outputDir || "~/Downloads");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toTimeString().slice(0, 5).replace(":", "");
  let base;
  if (args.fileName) base = slug(args.fileName);
  else if (data && data.company && data.slug) base = `${slug(data.company)}-${slug(data.slug)}`;
  else base = slug(data.meta.title) + "-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const antiCache = args.stable === true || args.fileName || (data && data.company && data.slug) ? base : base + "-" + stamp;
  const file = path.join(dir, antiCache + ".html");
  fs.writeFileSync(file, out, "utf8");
  if (args.open === true) {
    try {
      const url = "file://" + file.split(path.sep).map(encodeURIComponent).join("/") + "?t=" + Date.now();
      if (process.platform === "darwin") spawn("open", [file], { stdio: "ignore", detached: true }).unref();
      else if (process.platform === "linux") spawn("xdg-open", [file], { stdio: "ignore", detached: true }).unref();
      void url;
    } catch {}
  }
  return file;
}
export function runtimeDataFromArgs(args) {
  const a = args || {};
  const kit = resolveKit(a.kitName, a.kit);
  const slidesIn = Array.isArray(a.slides) && a.slides.length ? a.slides : TEMPLATES.map((template) => ({ template }));
  const slides = applyBoldify(partitionListSlides(slidesIn.map((slide, index) => {
    const out = normSlideArg(slide);
    out.id = out.id || `slide-${index + 1}`;
    return out;
  })));
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
    meta: { title, format, canvas: canvasForFormat(format), showCount: a.showNumbers !== false, ...(category ? { category } : {}) },
    slides,
  };
}
