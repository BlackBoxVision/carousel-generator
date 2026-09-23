import fs from "node:fs";
import path from "node:path";
import { carouselDir } from "../lib/paths.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "delete_carousel",
  description:
    "Elimina permanentemente un carrusel persistido (carpeta carousel.json + assets). Seguro en dos pasos: sin confirm:true devuelve un preview de lo que se va a borrar sin tocar nada; con confirm:true ejecuta el borrado. Pedi confirmación al usuario antes de usar confirm:true.",
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Slug de empresa." },
      name: { type: "string", description: "Slug del carrusel (alias: slug)." },
      slug: { type: "string", description: "Alias de name." },
      confirm: { type: "boolean", description: "false (default): solo muestra el preview. true: borra permanentemente." },
    },
    required: ["company", "name"],
  },
  handler(args) {
    const a = args || {};
    const company = slug(a.company || "");
    const name = slug(a.name || a.slug || "");
    if (!company || !name) throw new Error("Faltan `company` y `name`/`slug`.");
    const CAROUSEL_DIR = carouselDir();
    const dir = path.resolve(CAROUSEL_DIR, company, name);
    if (dir !== CAROUSEL_DIR && !dir.startsWith(CAROUSEL_DIR + path.sep)) throw new Error("Ruta inválida (fuera del directorio de carruseles).");
    if (!fs.existsSync(path.join(dir, "carousel.json"))) throw new Error(`Carrusel "${company}/${name}" no existe.`);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "carousel.json"), "utf8"));
    if (!a.confirm) {
      let sizeBytes = 0;
      try { for (const f of fs.readdirSync(dir)) sizeBytes += fs.statSync(path.join(dir, f)).size; } catch {}
      return JSON.stringify({
        company, name,
        title: stored.meta && stored.meta.title,
        slides: (stored.slides || []).length,
        updatedAt: stored.updatedAt,
        folder: dir,
        sizeBytes,
        deleted: false,
        hint: "Llamá de nuevo con confirm:true para borrar permanentemente esta carpeta y sus assets.",
      }, null, 2);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    return `Carrusel "${company}/${name}" eliminado (${dir}).`;
  },
};
