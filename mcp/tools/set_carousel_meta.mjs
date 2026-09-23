import fs from "node:fs";
import { canvasForFormat } from "../lib/const.mjs";
import { hydrateCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "set_carousel_meta",
  description:
    "Actualiza meta de un carrusel persistido sin tocar las slides: title, format (feed|square|story + canvas), category (cascade de highlightColors) y showCount. Persiste carousel.json, re-renderiza el preview y devuelve el meta resultante.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      title: { type: "string", description: "Nuevo título del carrusel (meta.title)." },
      format: { type: "string", enum: ["feed", "square", "story"], description: "Formato del carrusel. Actualiza meta.format y meta.canvas." },
      category: { type: "string", description: "Categoría para cascade de highlightColors del kit (meta.category)." },
      showCount: { type: "boolean", description: "Muestra/oculta el chip N/M en cada slide (meta.showCount)." },
      outputDir: { type: "string", description: "Directorio del HTML re-renderizado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML re-renderizado." },
      open: { type: "boolean", description: "Abrir el HTML (default false para tools iterativas)." },
    },
    required: ["company", "name"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
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
    fs.writeFileSync(record.file, JSON.stringify(stored, null, 2), "utf8");
    const runtime = hydrateCarousel(stored, record.dir);
    runtime.company = company;
    runtime.slug = name;
    const html = renderCarousel(runtime, { outputDir: a.outputDir, fileName: a.fileName, open: a.open === true, stable: true });
    const handoff = handoffRender(html, record.file, runtime, {
      nextSteps: [
        "Meta persistido en carousel.json.",
        "Si cambiaste format: re-renderizá con render_preview para ver el nuevo lienzo.",
        "Si cambiaste category: verificá que kit.highlightColors tenga esa clave (si no, mantiene primary).",
      ],
    });
    return appendHandoff(
      `Meta actualizado en ${company}/${name}: ${JSON.stringify(changed)}\nfull meta: ${JSON.stringify(stored.meta)}\nPreview: ${html}`,
      handoff
    );
  },
};
