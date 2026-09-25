import { canvasForFormat } from "../lib/const.mjs";
import { writeJsonAtomic } from "../lib/fsutil.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe } from "../lib/render.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "set_carousel_meta",
  description: [
    "Update carousel meta without touching slides: title, format, category, showCount.",
    "WHAT: write meta.title / meta.format(+canvas) / meta.category (highlightColors cascade) / meta.showCount; persist and re-render preview.",
    "WHEN: renaming, switching feed|square|story, changing category, toggling N/M chips.",
    "SISTERS: edit_slide (slide content), save_carousel (bulk meta+kit+slides), validate_carousel, render_preview / export_pdf.",
    "ANTI: do NOT pass slides to this tool; do NOT edit carousel.json yourself.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Company slug." },
      name: { type: "string", description: "Carousel slug (alias: slug)." },
      slug: { type: "string", description: "Alias of name." },
      title: { type: "string", description: "New carousel title (meta.title)." },
      format: {
        type: "string",
        enum: ["feed", "square", "story"],
        description: "Carousel format. Updates meta.format and meta.canvas.",
      },
      category: { type: "string", description: "Category for the kit's highlightColors cascade (meta.category)." },
      showCount: { type: "boolean", description: "Show/hide the N/M chip on each slide (meta.showCount)." },
      outputDir: { type: "string", description: "Re-rendered HTML directory. Default ~/Downloads." },
      fileName: { type: "string", description: "Re-rendered HTML basename." },
      open: { type: "boolean", description: "Open the HTML (default false for iterative tools)." },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    // Chequeo sobre el valor crudo: slug("") cae al fallback "carrusel" y escondía el error.
    const rawCompany = String(a.company ?? "").trim();
    const rawName = String(a.name ?? a.slug ?? "").trim();
    if (!rawCompany) throw new Error("Falta `company` (requerido).");
    if (!rawName) throw new Error("Falta `name`/`slug` (requerido).");
    const company = slug(rawCompany);
    const name = slug(rawName);
    const hasTitle = a.title !== undefined && a.title !== null && String(a.title).length;
    const hasFormat = a.format !== undefined && a.format !== null && String(a.format).length;
    const hasCategory = a.category !== undefined && a.category !== null;
    const hasShowCount = a.showCount !== undefined && a.showCount !== null;
    if (!hasTitle && !hasFormat && !hasCategory && !hasShowCount) {
      throw new Error("Falta al menos un campo a actualizar: title | format | category | showCount.");
    }
    const record = readCarousel(company, name);
    const stored = record.stored;
    stored.meta = stored.meta || {};
    const changed = {};
    if (hasTitle) {
      stored.meta.title = String(a.title);
      changed.title = stored.meta.title;
    }
    if (hasFormat) {
      const f = String(a.format);
      if (!["feed", "square", "story"].includes(f)) {
        throw new Error("`format` debe ser uno de: feed, square, story.");
      }
      stored.meta.format = f;
      stored.meta.canvas = canvasForFormat(f);
      changed.format = f;
      changed.canvas = stored.meta.canvas;
    }
    if (hasCategory) {
      stored.meta.category = String(a.category);
      changed.category = stored.meta.category;
    }
    if (hasShowCount) {
      stored.meta.showCount = !!a.showCount;
      changed.showCount = stored.meta.showCount;
    }
    stored.updatedAt = new Date().toISOString();
    writeJsonAtomic(record.file, stored);
    const runtime = hydrateCarousel(stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    const rendered = renderCarouselSafe(runtime, {
      outputDir: a.outputDir,
      fileName: a.fileName,
      open: a.open === true,
      stable: true,
    });
    const html = rendered.file;
    const handoff = handoffRender(html, record.file, runtime, {
      nextSteps: [
        "Meta persisted to carousel.json.",
        "If format changed: re-render with render_preview to see the new canvas.",
        "If category changed: check that kit.highlightColors has that key (otherwise primary is kept).",
        ...(rendered.warning ? [rendered.warning] : []),
      ],
    });
    return appendHandoff(
      `Meta actualizado en ${company}/${name}: ${JSON.stringify(changed)}\nfull meta: ${JSON.stringify(stored.meta)}\nPreview: ${
        html || "(no re-renderizado)"
      }${rendered.warning ? `\nWARNING: ${rendered.warning}` : ""}`,
      handoff,
    );
  },
};
