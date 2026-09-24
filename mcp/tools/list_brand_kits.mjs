import { brandDir, REPO_KITS } from "../lib/paths.mjs";
import { allKitsRaw } from "../lib/kits.mjs";

export default {
  name: "list_brand_kits",
  description: [
    "List available brand kits: personal under ~/.carousel-generator/brand/, then repo kits in mcp/kits/.",
    "WHAT: personal company folders first (priority on name collisions), then repo examples.",
    "WHEN: discovering kit names before generate_carousel kitName or load_brand_kit.",
    "SISTERS: load_brand_kit (inspect one), save_brand_kit (create), brand_kit_from_url (from site), delete_brand_kit (remove personal).",
    "ANTI: personal kits win on collision; do NOT read kit files on disk yourself.",
  ].join("\n"),
  inputSchema: { type: "object", properties: {} },
  handler() {
    const all = allKitsRaw();
    const slugs = Object.keys(all).sort();
    if (!slugs.length) return "No hay kits guardados. Carpetas de empresa en " + brandDir() + " (cada una con kit.json), ejemplos en " + REPO_KITS + ".";
    const lines = slugs.map((sl) => {
      const entry = all[sl];
      if (!entry.kit) return `- ${sl} (JSON inválido en ${entry.source})`;
      const k = entry.kit;
      return `- ${sl} [${entry.source}] (marca: ${k.name || "?"}, primario: ${(k.colors && k.colors.primary) || "?"}, logo img: ${k.logo && k.logo.img ? "sí" : "no"}, gradients: ${(k.gradients || []).length})`;
    });
    return "Brand kits disponibles (personales primero):\n" + lines.join("\n");
  },
};
