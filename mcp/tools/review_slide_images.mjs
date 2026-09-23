import fs from "node:fs";
import path from "node:path";
import { NARRATIVE_REVIEW_PROTOCOL, PHOTO_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { imageSize } from "../lib/images.mjs";
import { narrativeAudit } from "../lib/narrative.mjs";
import { readCarousel } from "../lib/persist.mjs";
import { slug } from "../lib/text.mjs";

export function slideMetaForReview(stored, dir) {
  const out = [];
  (stored.slides || []).forEach((s, i) => {
    const texts = { kicker: "", title: "", highlight: "", body: "" };
    const walk = (nodes) => {
      for (const b of nodes || []) {
        if (b.type === "kicker" && !texts.kicker) texts.kicker = b.text;
        if (b.type === "text" && !texts.title) texts.title = b.text;
        if (b.type === "highlight" && !texts.highlight) texts.highlight = b.text;
        if (b.type === "body" && !texts.body) texts.body = b.text;
        if (b.children) walk(b.children);
      }
    };
    walk(s.elements);
    let photo = null;
    if (s.bg && s.bg.type === "photo" && s.bg.asset) {
      const f = path.resolve(dir, s.bg.asset);
      if (fs.existsSync(f)) {
        const dim = imageSize(f);
        photo = { file: f, dimensions: dim ? `${dim.w}x${dim.h}` : null, asset: s.bg.asset, scrim: s.bg.scrim };
      }
    }
    out.push({ slide: i + 1, id: s.id, template: s.template, ...texts, photo, hasPhoto: !!photo });
  });
  return out;
}

export default {
  name: "review_slide_images",
  description:
    "Audita las fotos de un carrusel persistido: por slide devuelve textos (kicker/título/highlight/body), la foto asignada (ruta, dimensiones, scrim) y photoNeeds con queries sugeridas para las slides sin foto. La respuesta incluye el PHOTO REVIEW PROTOCOL para que el agente verifique visualmente, reemplace con stock y re-audite.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
    const record = readCarousel(company, name);
    const slides = slideMetaForReview(record.stored, record.dir);
    const photoNeeds = slides.filter((s) => !s.hasPhoto).map((s) => ({
      slide: s.slide,
      template: s.template,
      query: [s.title, s.highlight, s.kicker].filter(Boolean).join(" ") || s.template,
    }));
    const audit = narrativeAudit(record.stored.slides || [], record.stored.meta && record.stored.meta.title);
    return JSON.stringify({ company, slug: name, slides, photoNeeds, narrativeAudit: audit, protocol: PHOTO_REVIEW_PROTOCOL + "\n\n" + NARRATIVE_REVIEW_PROTOCOL }, null, 2);
  },
};
