import fs from "node:fs";
import path from "node:path";
import { buildKitFromInference, downloadLogoDataURL, inferKitFromHTML } from "../lib/brand.mjs";
import { DEFAULT_KIT } from "../lib/const.mjs";
import { writeJsonAtomic } from "../lib/fsutil.mjs";
import { fetchBrandHTML } from "../lib/html.mjs";
import { findKitFile } from "../lib/kits.mjs";
import { brandDir } from "../lib/paths.mjs";
import { deepMerge, slug } from "../lib/text.mjs";

export default {
  name: "brand_kit_from_url",
  description: [
    "Generate a brand kit from a site homepage (fetch + heuristics, no deps) and optionally save it.",
    "WHAT: extract name, theme-color, frequent colors, Google Fonts, logo/favicon; return per-field confidence and what to review; save under brand/{empresa}/kit.json when save:true.",
    "WHEN: starting branding for a new site URL before generate_carousel.",
    "SISTERS: save_brand_kit (refine fields), load_brand_kit (inspect), list_brand_kits (see), generate_carousel (preview with kitName).",
    "ANTI: refine loop — preview with generate_carousel(kitName) then save_brand_kit with only changed fields (e.g. {colors:{primary:'#ff5a00'}}); do NOT invent brand colors when extraction failed.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL http(s) del sitio (se analiza solo la homepage)." },
      name: { type: "string", description: "Slug/nombre del kit. Default: og:site_name, <title> o hostname." },
      save: {
        type: "boolean",
        description:
          "Guardar en ~/.carousel-generator/brand/{empresa}/kit.json (default true). Con false solo devuelve el JSON inferido sin guardar.",
      },
    },
    required: ["url"],
  },
  async handler(args) {
    const a = args || {};
    const raw = String(a.url || "").trim();
    if (!raw) throw new Error("Falta `url`.");
    let u;
    try {
      u = new URL(raw);
    } catch {
      throw new Error(`URL inválida: "${raw}". Incluí el esquema https://`);
    }
    if (!/^https?:$/.test(u.protocol)) throw new Error("Solo se aceptan URLs http(s).");
    const html = await fetchBrandHTML(u.href);
    const inf = inferKitFromHTML(html, u.href);
    const sl = slug(a.name || inf.brandName || u.hostname);
    const kit = buildKitFromInference(inf, a.name, sl);
    let logoNote = "sin logo (se usa letra fallback)";
    let logoConf = "baja";
    for (const cand of inf.logoCands) {
      try {
        const abs = new URL(cand, u.href).href;
        const dl = await downloadLogoDataURL(abs);
        kit.logo.img = dl.dataURL;
        logoNote = `logo embebido desde ${abs}`;
        logoConf = "media";
        break;
      } catch (e) {
        logoNote = `logo no descargable (${(e && e.message) || e}), se usa letra fallback`;
      }
    }
    if (a.save === false) {
      return `Kit inferido (NO guardado, save:false):\n${JSON.stringify(kit, null, 2).slice(0, 4000)}\n\nConfianza — primario: ${inf.conf.primary} (${inf.primarySrc}) · secundario: ${inf.conf.secondary} · fonts: ${inf.conf.fonts} · logo: ${logoConf} (${logoNote}).\nPara guardarlo pasá save:true o usá save_brand_kit con este JSON.`;
    }
    const existing = findKitFile(sl);
    let base;
    if (existing) {
      try {
        base = JSON.parse(fs.readFileSync(existing.file, "utf8"));
      } catch (e) {
        throw new Error(`kit.json corrupto en "${existing.file}": ${e.message}. Borralo o re-creá el kit.`);
      }
    } else base = clone(DEFAULT_KIT);
    const merged = deepMerge(base, kit);
    merged.name = kit.name;
    const dir = path.join(brandDir(), sl);
    fs.mkdirSync(dir, { recursive: true });
    writeJsonAtomic(path.join(dir, "kit.json"), merged);
    return `Kit "${sl}" generado desde ${u.href} y guardado en ${path.join(dir, "kit.json")}${existing ? " (mergeado sobre el existente)" : ""}.\n\n- Marca: ${kit.name}\n- Primario: ${kit.colors.primary} [confianza ${inf.conf.primary}: ${inf.primarySrc}]\n- Secundario: ${kit.colors.secondary} [confianza ${inf.conf.secondary}]\n- Fonts: ${kit.fonts.heading} [${inf.conf.fonts}]\n- Logo: ${logoNote} [confianza ${logoConf}]\n- Gradients: ${kit.gradients.map((g) => g.name).join(", ")}\n\nRevisar: contraste del primario sobre blanco, logo (¿es el correcto o un favicon chico?), y tipografía.\nAjuste con feedback: previsualizá con generate_carousel {kitName:"${sl}"} y refiná con save_brand_kit {name:"${sl}", kit:{...solo lo que cambia...}} (ej: {"colors":{"primary":"#ff5a00"}}). Los cambios se ven en vivo en el picker del editor.`;
  },
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
