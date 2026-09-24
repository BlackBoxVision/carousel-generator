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
  description: [
    "Audit photos of a persisted carousel: per-slide texts, assigned photo, photoNeeds.",
    "WHAT: for each slide return kicker/title/highlight/body, photo path+dimensions+scrim, and photoNeeds (missing photos + suggested query).",
    "WHEN: after carousel_from_url / set_slide_photo, or when applying PHOTO_REVIEW_PROTOCOL before deliver.",
    "SISTERS: set_slide_photo (replace), edit_slide (copy fixes), validate_carousel (narrative), render_preview (PNGs).",
    "ANTI: the agent MUST verify each photo visually, replace bad ones with stock via set_slide_photo, and re-audit before delivering.",
  ].join("\n"),
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
    if (!company) throw new Error("Falta `company` (requerido).");
    if (!name) throw new Error("Falta `name`/`slug` (requerido).");
    const record = readCarousel(company, name);
    const slides = slideMetaForReview(record.stored, record.dir);
    const photoNeeds = slides
      .filter((s) => !s.hasPhoto)
      .map((s) => ({
        slide: s.slide,
        template: s.template,
        query: [s.title, s.highlight, s.kicker].filter(Boolean).join(" ") || s.template,
      }));
    const audit = narrativeAudit(record.stored.slides || [], record.stored.meta && record.stored.meta.title);
    return JSON.stringify(
      {
        company,
        slug: name,
        slides,
        photoNeeds,
        narrativeAudit: audit,
        protocol: PHOTO_REVIEW_PROTOCOL + "\n\n" + NARRATIVE_REVIEW_PROTOCOL,
      },
      null,
      2,
    );
  },
};
