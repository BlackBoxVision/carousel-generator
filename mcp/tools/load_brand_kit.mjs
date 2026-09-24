import fs from "node:fs";
import { availableKitNames, findKitFile } from "../lib/kits.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "load_brand_kit",
  description: [
    "Return the full JSON of a saved brand kit.",
    "WHAT: look up personal kit (~/.carousel-generator/brand/{empresa}/kit.json) then repo kit (mcp/kits/).",
    "WHEN: inspecting a kit before save_brand_kit merge or generate_carousel kitName.",
    "SISTERS: list_brand_kits (names), save_brand_kit (write), brand_kit_from_url (derive), generate_carousel (apply).",
    "ANTI: do NOT read kit files with shell/file tools; use this tool.",
  ].join("\n"),
  inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  handler(args) {
    const name = slug((args && args.name) || "");
    const found = findKitFile(name);
    if (!found) throw new Error(`Kit "${name}" no existe. Usá list_brand_kits. Disponibles: ${availableKitNames().join(", ") || "(ninguno)"}.`);
    return fs.readFileSync(found.file, "utf8");
  },
};
