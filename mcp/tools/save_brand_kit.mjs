import fs from "node:fs";
import path from "node:path";
import { DEFAULT_KIT } from "../lib/const.mjs";
import { brandDir } from "../lib/paths.mjs";
import { deepMerge, slug } from "../lib/text.mjs";
import { findKitFile, resolveLogo } from "../lib/kits.mjs";

export default {
  name: "save_brand_kit",
  description: "Guarda un brand kit en ~/.carousel-generator/brand/{empresa}/kit.json para reutilizarlo con generate_carousel y verlo en el picker multi-kit del editor. Acepta logo.imagePath (ruta de imagen relativa a la carpeta de la empresa, o 'file:' + absoluta) que se embebe en base64 dentro del kit. Si el kit ya existe, se mergea sobre él.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre/slug del kit (a-z, 0-9, -)." },
      kit: {
        type: "object",
        description: "El kit (completo o parcial): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, logoBackground, logoShape, logoSize, photoOverlay:{enabled,css}, gradients:[{name,css,light}] }.",
      },
    },
    required: ["name", "kit"],
  },
  handler(args) {
    const a = args || {};
    const name = slug(a.name || "");
    if (!name) throw new Error("Falta el nombre del kit.");
    if (!a.kit || typeof a.kit !== "object") throw new Error("Falta el objeto kit.");
    const existing = findKitFile(name);
    const base = existing ? JSON.parse(fs.readFileSync(existing.file, "utf8")) : clone(DEFAULT_KIT);
    const kit = resolveLogo(deepMerge(base, a.kit), name);
    kit.name = (a.kit && a.kit.name) || base.name || name;
    const dir = path.join(brandDir(), name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "kit.json");
    fs.writeFileSync(file, JSON.stringify(kit, null, 2), "utf8");
    return `Kit "${name}" guardado en ${file}${existing ? " (mergeado sobre el existente)" : " (nuevo, basado en Default)"}${kit.logo && kit.logo.img ? " — logo embebido en base64" : ""}`;
  },
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
