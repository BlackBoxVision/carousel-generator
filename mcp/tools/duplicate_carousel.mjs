import fs from "node:fs";
import path from "node:path";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { carouselPath } from "../lib/paths.mjs";
import { hydrateCarousel, persistCarousel, readCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe } from "../lib/render.mjs";
import { clone, slug } from "../lib/text.mjs";

export default {
  name: "duplicate_carousel",
  description: [
    "Duplicate a persisted carousel to another company and/or slug (A/B variants or working copies).",
    "WHAT: copy meta/kit/slides/referenced assets to the destination, re-idemp assets, re-render the duplicate preview; original untouched.",
    "WHEN: branching a carousel without mutating the source; A/B copy experiments.",
    "SISTERS: list_carousels (pick source), edit_slide (edit the copy), delete_carousel (cleanup), set_carousel_meta (meta.title only — slug rename is not supported).",
    "ANTI: do NOT mutate the source; destination slug must differ from origin.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Source company slug." },
      name: { type: "string", description: "Source carousel slug (alias: slug)." },
      slug: { type: "string", description: "Alias of source name." },
      toCompany: { type: "string", description: "Destination company. Default: same as the source company." },
      toName: { type: "string", description: "Destination slug of the duplicate. Default: {origin}-copy." },
      open: { type: "boolean", description: "Open the duplicate's HTML (default false)." },
      outputDir: { type: "string", description: "Re-rendered HTML directory. Default ~/Downloads." },
      fileName: { type: "string", description: "Re-rendered HTML basename." },
    },
    required: ["company"],
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
    if (!fromCompany) throw new Error("Falta `company` (requerido).");
    if (!fromName) throw new Error("Falta `name`/`slug` (requerido).");
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
    const rendered = renderCarouselSafe(runtime, {
      outputDir: a.outputDir,
      fileName: a.fileName,
      open: a.open === true,
      stable: true,
    });
    const html = rendered.file;
    const handoff = handoffRender(html, saved.file, runtime, {
      nextSteps: [
        `Copy created at ${toCompany}/${toName} (${(saved.data.slides || []).length} slides).`,
        "The original carousel was not modified.",
        "For an A/B variant: edit the copy with edit_slide / set_carousel_meta / set_slide_bg.",
        ...(rendered.warning ? [rendered.warning] : []),
      ],
    });
    return appendHandoff(
      `Carrusel duplicado: ${fromCompany}/${fromName} → ${toCompany}/${toName}\nJSON: ${saved.file}\nAssets copiados: ${remapped.length}\nSlides: ${
        (saved.data.slides || []).length
      }\nPreview: ${html || "(no re-renderizado)"}${rendered.warning ? `\nWARNING: ${rendered.warning}` : ""}`,
      handoff,
    );
  },
};
