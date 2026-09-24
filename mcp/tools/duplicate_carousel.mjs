import fs from "node:fs";
import path from "node:path";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { carouselPath } from "../lib/paths.mjs";
import { hydrateCarousel, persistCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarousel } from "../lib/render.mjs";
import { clone, slug } from "../lib/text.mjs";

export default {
  name: "duplicate_carousel",
  description: [
    "Duplicate a persisted carousel to another company and/or slug (A/B variants or working copies).",
    "WHAT: copy meta/kit/slides/referenced assets to the destination, re-idemp assets, re-render the duplicate preview; original untouched.",
    "WHEN: branching a carousel without mutating the source; A/B copy experiments.",
    "SISTERS: list_carousels (pick source), edit_slide (edit the copy), delete_carousel (cleanup), set_carousel_meta (rename).",
    "ANTI: do NOT mutate the source; destination slug must differ from origin.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa origen." },
      name: { type: "string", description: "Slug del carrusel origen (alias: slug)." },
      slug: { type: "string", description: "Alias de name origen." },
      toCompany: { type: "string", description: "Empresa destino. Default: la misma empresa origen." },
      toName: { type: "string", description: "Slug destino del duplicado. Default: {origen}-copy." },
      open: { type: "boolean", description: "Abrir el HTML del duplicado (default false)." },
      outputDir: { type: "string", description: "Directorio del HTML re-renderizado. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML re-renderizado." },
    },
    required: ["company", "name"],
  },
  handler(args) {
    const a = args || {};
    const fromCompany =
      a.company !== undefined && a.company !== null && String(a.company).trim() ? slug(String(a.company).trim()) : "";
    const rawFrom =
      a.name !== undefined && a.name !== null && String(a.name).trim()
        ? String(a.name).trim()
        : a.slug !== undefined && a.slug !== null && String(a.slug).trim()
          ? String(a.slug).trim()
          : "";
    const fromName = rawFrom ? slug(rawFrom) : "";
    if (!fromCompany || !fromName) throw new Error("Faltan `company` y `name`/`slug`.");
    const record = readCarousel(fromCompany, fromName);
    const stored = clone(record.stored);
    const toCompany =
      a.toCompany !== undefined && a.toCompany !== null && String(a.toCompany).trim()
        ? slug(String(a.toCompany).trim())
        : fromCompany;
    const toName =
      a.toName !== undefined && a.toName !== null && String(a.toName).trim()
        ? slug(String(a.toName).trim())
        : `${fromName}-copy`;
    if (!toCompany || !toName) throw new Error("Faltan `toCompany` o `toName` válidos.");
    const destDir = carouselPath(toCompany, toName);
    const destJson = path.join(destDir, "carousel.json");
    if (fs.existsSync(destJson) && (toCompany !== fromCompany || toName !== fromName)) {
      throw new Error(
        `El destino "${toCompany}/${toName}" ya existe. Usá otro toName o borrá el existente con delete_carousel.`,
      );
    }
    if (toCompany === fromCompany && toName === fromName) {
      throw new Error("`toName` debe ser distinto del origen (o cambiá toCompany).");
    }
    stored.company = toCompany;
    stored.slug = toName;
    if (stored.meta) {
      stored.meta.title = stored.meta.title ? `${stored.meta.title} (copy)` : toName;
    }
    stored.createdAt = new Date().toISOString();
    stored.updatedAt = stored.createdAt;
    // Re-id slides so ids stay unique across carousels
    (stored.slides || []).forEach((s, i) => {
      s.id = s.id || `slide-${i + 1}`;
    });
    // Copy photo assets from origin assets/ to dest assets/
    const destAssets = path.join(destDir, "assets");
    fs.mkdirSync(destAssets, { recursive: true });
    const remapped = [];
    for (const asset of stored.assets || []) {
      if (!asset || !asset.file) continue;
      const srcFile = path.resolve(record.dir, asset.file);
      if (fs.existsSync(srcFile)) {
        const base = path.basename(asset.file);
        const destFile = path.join(destAssets, base);
        fs.copyFileSync(srcFile, destFile);
        remapped.push({ ...asset, file: `assets/${base}` });
      }
    }
    stored.assets = remapped;
    // Fix asset refs inside slides to point at dest-relative paths (same basename)
    // (paths already relative "assets/..." so they resolve under destDir after persist)
    const saved = persistCarousel(stored, toCompany, toName, destDir);
    const runtime = hydrateCarousel(saved.data, saved.dir);
    runtime.company = toCompany;
    runtime.slug = toName;
    const html = renderCarousel(runtime, {
      outputDir: a.outputDir,
      fileName: a.fileName,
      open: a.open === true,
      stable: true,
    });
    const handoff = handoffRender(html, saved.file, runtime, {
      nextSteps: [
        `Duplicado creado en ${toCompany}/${toName} (${(saved.data.slides || []).length} slides).`,
        "El original no se modificó.",
        "Si es una variante A/B: editá el duplicado con edit_slide / set_carousel_meta / set_slide_bg.",
      ],
    });
    return appendHandoff(
      `Carrusel duplicado: ${fromCompany}/${fromName} → ${toCompany}/${toName}\nJSON: ${saved.file}\nAssets copiados: ${remapped.length}\nSlides: ${(saved.data.slides || []).length}\nPreview: ${html}`,
      handoff,
    );
  },
};
