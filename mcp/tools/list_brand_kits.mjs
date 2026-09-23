import { brandDir, REPO_KITS } from "../lib/paths.mjs";
import { allKitsRaw } from "../lib/kits.mjs";

export default {
  name: "list_brand_kits",
  description: "Lista los brand kits disponibles: primero las carpetas de empresa en ~/.carousel-generator/brand/ (personales), luego mcp/kits/ del repo (ejemplos). Los personales tienen prioridad ante colisiones de nombre.",
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
