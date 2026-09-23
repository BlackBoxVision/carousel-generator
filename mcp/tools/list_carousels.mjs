import fs from "node:fs";
import path from "node:path";
import { carouselDir } from "../lib/paths.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "list_carousels",
  description: "Lista los carouseles persistidos por empresa en ~/.carousel-generator/carousels/. Filtrá con company para ver solo una empresa. Devuelve company, slug, título, formato, cantidad de slides, fecha y ruta JSON para elegir cuál cargar.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Filtro opcional: solo carruseles de esta empresa (slug)." },
    },
  },
  handler(args) {
    const a = args || {};
    const companyFilter = a.company !== undefined && a.company !== null && String(a.company).trim()
      ? slug(String(a.company).trim())
      : "";
    const CAROUSEL_DIR = carouselDir();
    if (!fs.existsSync(CAROUSEL_DIR)) return JSON.stringify({ root: CAROUSEL_DIR, carousels: [] }, null, 2);
    const carousels = [];
    for (const company of fs.readdirSync(CAROUSEL_DIR)) {
      if (companyFilter && company !== companyFilter) continue;
      const companyDir = path.join(CAROUSEL_DIR, company);
      if (!fs.statSync(companyDir).isDirectory()) continue;
      for (const name of fs.readdirSync(companyDir)) {
        const file = path.join(companyDir, name, "carousel.json");
        if (!fs.existsSync(file)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(file, "utf8"));
          carousels.push({ company, slug: name, title: data.meta && data.meta.title, format: data.meta && data.meta.format, slides: (data.slides || []).length, updatedAt: data.updatedAt, file });
        } catch {}
      }
    }
    if (companyFilter && !carousels.length) {
      return JSON.stringify({ root: CAROUSEL_DIR, company: companyFilter, carousels: [], note: `No hay carruseles para company="${companyFilter}".` }, null, 2);
    }
    return JSON.stringify({ root: CAROUSEL_DIR, ...(companyFilter ? { company: companyFilter } : {}), carousels }, null, 2);
  },
};
