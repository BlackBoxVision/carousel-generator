import fs from "node:fs";
import path from "node:path";
import { DEFAULT_KIT } from "../lib/const.mjs";
import { writeJsonAtomic } from "../lib/fsutil.mjs";
import { findKitFile, resolveLogo } from "../lib/kits.mjs";
import { brandDir } from "../lib/paths.mjs";
import { safeKit } from "../lib/safe.mjs";
import { deepMerge, slug } from "../lib/text.mjs";

export default {
  name: "save_brand_kit",
  description: [
    "Save or merge a brand kit under ~/.carousel-generator/brand/{empresa}/kit.json.",
    "WHAT: accept full or partial kit (colors, fonts, logo, gradients, photoOverlay); merge over existing kit; logo.imagePath embeds base64.",
    "WHEN: after brand_kit_from_url / manual kit authoring, to reuse with generate_carousel kitName and the editor multi-kit picker.",
    "SISTERS: brand_kit_from_url (from site), load_brand_kit (inspect), list_brand_kits (see), generate_carousel (apply).",
    "ANTI: do NOT overwrite other company kits; pass only fields to change when refining (partial merge).",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre/slug del kit (a-z, 0-9, -)." },
      kit: {
        type: "object",
        description:
          "El kit (completo o parcial): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, logoBackground, logoShape, logoSize, photoOverlay:{enabled,css}, gradients:[{name,css,light}] }.",
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
    let base;
    if (existing) {
      try {
        base = JSON.parse(fs.readFileSync(existing.file, "utf8"));
      } catch (e) {
        throw new Error(`kit.json corrupto en "${existing.file}": ${e.message}. Borralo o re-creá el kit.`);
      }
    } else base = clone(DEFAULT_KIT);
    const kit = safeKit(resolveLogo(deepMerge(base, a.kit), name));
    kit.name = (a.kit && a.kit.name) || base.name || name;
    const dir = path.join(brandDir(), name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "kit.json");
    writeJsonAtomic(file, kit);
    return `Kit "${name}" guardado en ${file}${existing ? " (mergeado sobre el existente)" : " (nuevo, basado en Default)"}${kit.logo && kit.logo.img ? " — logo embebido en base64" : ""}`;
  },
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
