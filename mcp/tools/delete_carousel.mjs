import fs from "node:fs";
import path from "node:path";
import { carouselDir } from "../lib/paths.mjs";
import { readCarousel } from "../lib/persist.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "delete_carousel",
  description: [
    "Permanently delete a persisted carousel folder (carousel.json + assets).",
    "WHAT: two-step safety — without confirm:true returns a preview only; with confirm:true deletes for real.",
    "WHEN: user explicitly asked to remove a carousel after confirmation.",
    "SISTERS: list_carousels (find), duplicate_carousel (copy before delete), delete_brand_kit (kits).",
    "ANTI: NEVER call with confirm:true without asking the user first.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      confirm: {
        type: "boolean",
        description: "false (default): solo muestra el preview. true: borra permanentemente.",
      },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company) throw new Error("Falta `company` (requerido).");
    if (!name) throw new Error("Falta `name`/`slug` (requerido).");
    const CAROUSEL_DIR = carouselDir();
    const dir = path.resolve(CAROUSEL_DIR, company, name);
    if (dir !== CAROUSEL_DIR && !dir.startsWith(CAROUSEL_DIR + path.sep))
      throw new Error("Ruta inválida (fuera del directorio de carruseles).");
    if (!fs.existsSync(path.join(dir, "carousel.json"))) throw new Error(`Carrusel "${company}/${name}" no existe.`);
    const stored = readCarousel(company, name).stored;
    if (!a.confirm) {
      let sizeBytes = 0;
      const walk = (d) => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name);
          try {
            if (f.isDirectory()) walk(p);
            else sizeBytes += fs.statSync(p).size;
          } catch {}
        }
      };
      try {
        walk(dir);
      } catch {}
      return JSON.stringify(
        {
          company,
          name,
          title: stored.meta && stored.meta.title,
          slides: (stored.slides || []).length,
          updatedAt: stored.updatedAt,
          folder: dir,
          sizeBytes,
          deleted: false,
          hint: "Llamá de nuevo con confirm:true para borrar permanentemente esta carpeta y sus assets.",
        },
        null,
        2,
      );
    }
    fs.rmSync(dir, { recursive: true, force: true });
    return `Carrusel "${company}/${name}" eliminado (${dir}).`;
  },
};
