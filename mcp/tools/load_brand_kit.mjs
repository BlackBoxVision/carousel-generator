import fs from "node:fs";
import { availableKitNames, findKitFile } from "../lib/kits.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "load_brand_kit",
  description: "Devuelve el JSON completo de un brand kit guardado (busca en ~/.carousel-generator/brand/{empresa}/kit.json y en mcp/kits/ del repo).",
  inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  handler(args) {
    const name = slug((args && args.name) || "");
    const found = findKitFile(name);
    if (!found) throw new Error(`Kit "${name}" no existe. Usá list_brand_kits. Disponibles: ${availableKitNames().join(", ") || "(ninguno)"}.`);
    return fs.readFileSync(found.file, "utf8");
  },
};
