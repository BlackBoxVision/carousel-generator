import fs from "node:fs";
import { APP_PATH, MARKER } from "./const.mjs";
import { slug } from "./text.mjs";

let APP_TEMPLATE_CACHE = null;

export function loadAppTemplate() {
  if (APP_TEMPLATE_CACHE) return APP_TEMPLATE_CACHE;
  const html = fs.readFileSync(APP_PATH, "utf8");
  if (!html.includes(MARKER)) throw new Error("La app no contiene el marcador CAROUSEL_DATA.");
  APP_TEMPLATE_CACHE = html;
  return html;
}
export function handoffRender(file, jsonPath, data, extra = {}) {
  const company = data && data.company ? slug(data.company) : "";
  const slugName = data && data.slug ? slug(data.slug) : "";
  const slides = data && Array.isArray(data.slides) ? data.slides.length : undefined;
  const format = data && data.meta ? data.meta.format : undefined;
  return {
    render: { htmlPath: file, jsonPath: jsonPath || null, company, slug: slugName, slides, format },
    open: process.platform === "darwin" ? `open ${JSON.stringify(file)}` : file,
    nextSteps: extra.nextSteps || [
      "Abrí el HTML para revisar el resultado en el editor.",
      "Si hay fotos nuevas: verificá visualmente cada una y re-auditá con review_slide_images.",
      "Si el copy cambió: revisá narrativeAudit / NARRATIVE_REVIEW_PROTOCOL antes de entregar.",
    ],
  };
}
export function appendHandoff(text, handoff) {
  return text + "\n\n---\nhandoff:\n" + JSON.stringify(handoff, null, 2);
}
