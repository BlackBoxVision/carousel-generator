import fs from "node:fs";
import { availableKitNames, findKitFile } from "../lib/kits.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "load_brand_kit",
  description: [
    "Return the JSON of a saved brand kit (logo base64 masked by default).",
    "WHAT: look up personal kit (~/.carousel-generator/brand/{empresa}/kit.json) then repo kit (mcp/kits/);",
    "  logo.img/imgH (base64) are replaced by {logoBytes} unless includeLogo:true — keeps big blobs out of the context.",
    "WHEN: inspecting a kit before save_brand_kit merge or generate_carousel kitName.",
    "SISTERS: list_brand_kits (names), save_brand_kit (write), brand_kit_from_url (derive), generate_carousel (apply).",
    "ANTI: do NOT read kit files with shell/file tools; use this tool.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      includeLogo: {
        type: "boolean",
        description: "Incluir logo.img/imgH en base64 completo (default false: solo logoBytes).",
      },
    },
    required: ["name"],
  },
  handler(args) {
    const a = args || {};
    const name = slug(a.name || "");
    const found = findKitFile(name);
    if (!found)
      throw new Error(
        `Kit "${name}" no existe. Usá list_brand_kits. Disponibles: ${availableKitNames().join(", ") || "(ninguno)"}.`,
      );
    const raw = fs.readFileSync(found.file, "utf8");
    if (a.includeLogo === true) return raw;
    let kit;
    try {
      kit = JSON.parse(raw);
    } catch (e) {
      throw new Error(`kit.json corrupto en "${found.file}": ${e.message}.`);
    }
    if (kit && kit.logo && (kit.logo.img || kit.logo.imgH)) {
      const bytes = String(kit.logo.img || kit.logo.imgH || "").length;
      kit.logo = { ...kit.logo };
      delete kit.logo.img;
      delete kit.logo.imgH;
      kit.logo.logoBytes = bytes;
      kit.logo.note = "base64 omitido; pasá includeLogo:true para recibirlo";
    }
    return JSON.stringify(kit, null, 2);
  },
};
