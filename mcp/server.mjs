#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.join(__dirname, "..", "app", "index.html");
const REPO_KITS = path.join(__dirname, "kits");
const HOME_CG = path.join(os.homedir(), ".carousel-generator");
const BRAND_DIR = path.join(HOME_CG, "brand");
const LEGACY_KITS = path.join(HOME_CG, "kits");
const MARKER = "<!--CAROUSEL_DATA-->";
const TEMPLATES = ["cover", "fact", "map", "list", "cta"];
const IMG_EXTS = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };

const DEFAULT_KIT = {
  name: "Default",
  colors: { primary: "#0ea5e9", secondary: "#0f172a", tertiary: "#ffffff", slideBg: "#1e293b" },
  fonts: { heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" },
  logo: { letter: "c", text: "Carousel" },
  gradients: [
    { name: "navy", css: "linear-gradient(145deg,#1e3a5f,#0f172a 65%)" },
    { name: "sunset", css: "linear-gradient(145deg,#b4653a,#1c2b3a 50%,#0b1420 100%)" },
    { name: "mint", css: "linear-gradient(135deg,#bfe3d8,#dcead2 55%,#5ea3b8)", light: true },
    { name: "deep", css: "linear-gradient(145deg,#16283c,#0b1420 70%)" },
  ],
};

function expandHome(p) {
  return String(p).replace(/^~(?=\/|$)/, os.homedir());
}
function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "carrusel";
}
function deepMerge(base, over) {
  if (over === null || over === undefined) return base;
  if (typeof base !== "object" || typeof over !== "object" || Array.isArray(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function companyKitFile(sl) {
  return path.join(BRAND_DIR, sl, "kit.json");
}
function findKitFile(name) {
  const sl = slug(name);
  const company = companyKitFile(sl);
  if (fs.existsSync(company)) return { file: company, scope: sl };
  const legacy = path.join(LEGACY_KITS, sl + ".json");
  if (fs.existsSync(legacy)) {
    process.stderr.write(`[carousel-mcp] kit "${sl}" en layout anterior (${legacy}); movelo a ${company}\n`);
    return { file: legacy, scope: sl };
  }
  const repo = path.join(REPO_KITS, sl + ".json");
  if (fs.existsSync(repo)) return { file: repo, scope: null };
  return null;
}
function availableKitNames() {
  return Object.keys(allKitsRaw()).sort();
}
function allKitsRaw() {
  const out = {};
  if (fs.existsSync(BRAND_DIR)) {
    for (const sl of fs.readdirSync(BRAND_DIR).filter((x) => !x.startsWith("."))) {
      const f = companyKitFile(sl);
      if (!fs.existsSync(f) || out[sl]) continue;
      try {
        out[sl] = { kit: JSON.parse(fs.readFileSync(f, "utf8")), source: "personal", scope: sl };
      } catch {
        out[sl] = { kit: null, source: "personal", broken: f };
      }
    }
  }
  if (fs.existsSync(LEGACY_KITS)) {
    for (const f of fs.readdirSync(LEGACY_KITS).filter((x) => x.endsWith(".json"))) {
      const sl = f.replace(/\.json$/, "");
      if (out[sl]) continue;
      try {
        out[sl] = { kit: JSON.parse(fs.readFileSync(path.join(LEGACY_KITS, f), "utf8")), source: "personal-legacy", scope: sl };
      } catch {
        out[sl] = { kit: null, source: "personal-legacy", broken: f };
      }
    }
  }
  if (fs.existsSync(REPO_KITS)) {
    for (const f of fs.readdirSync(REPO_KITS).filter((x) => x.endsWith(".json"))) {
      const sl = f.replace(/\.json$/, "");
      if (out[sl]) continue;
      try {
        out[sl] = { kit: JSON.parse(fs.readFileSync(path.join(REPO_KITS, f), "utf8")), source: "repo", scope: null };
      } catch {
        out[sl] = { kit: null, source: "repo", broken: f };
      }
    }
  }
  return out;
}
function loadImageDataURL(ref, scope) {
  let p = String(ref);
  if (/^file:/.test(p)) p = p.replace(/^file:(\/\/)?/, "");
  p = expandHome(p);
  if (!path.isAbsolute(p)) {
    const scoped = scope ? path.join(BRAND_DIR, scope, p) : null;
    if (scoped && fs.existsSync(scoped)) p = scoped;
    else p = path.join(BRAND_DIR, p);
  }
  if (!fs.existsSync(p)) throw new Error(`Logo no encontrado: ${p}. Rutas relativas se buscan en la carpeta de la empresa (~/.carousel-generator/brand/{empresa}/) y luego en ~/.carousel-generator/brand/.`);
  const ext = path.extname(p).toLowerCase();
  const mime = IMG_EXTS[ext];
  if (!mime) throw new Error(`Formato de logo no soportado: "${ext}". Usá PNG, JPG, WEBP, GIF o SVG.`);
  return `data:${mime};base64,` + fs.readFileSync(p).toString("base64");
}
function resolveLogo(kit, scope) {
  const l = kit && kit.logo;
  if (l && typeof l.imagePath === "string" && l.imagePath.trim()) {
    l.img = loadImageDataURL(l.imagePath.trim(), scope);
    delete l.imagePath;
  }
  return kit;
}
function resolveKit(name, inline) {
  let base, scope = null;
  if (!name) {
    const found = findKitFile("hooked");
    if (found) { base = JSON.parse(fs.readFileSync(found.file, "utf8")); scope = found.scope; }
    else base = clone(DEFAULT_KIT);
  } else {
    const found = findKitFile(name);
    if (!found) {
      const avail = availableKitNames();
      throw new Error(`Brand kit "${name}" no existe. Disponibles: ${avail.length ? avail.join(", ") : "(ninguno)"}. Usá save_brand_kit para crear uno.`);
    }
    base = JSON.parse(fs.readFileSync(found.file, "utf8"));
    scope = found.scope;
  }
  if (inline && typeof inline === "object") base = deepMerge(base, inline);
  if (!scope && base && base.name) scope = slug(base.name);
  return resolveLogo(base, scope);
}
function brandKitsPayload() {
  const out = {};
  for (const [sl, entry] of Object.entries(allKitsRaw())) {
    if (!entry.kit) continue;
    try { out[sl] = resolveLogo(clone(entry.kit), entry.scope || sl); }
    catch (e) { process.stderr.write(`[carousel-mcp] kit "${sl}" sin logo (${e.message})\n`); out[sl] = entry.kit; }
  }
  return out;
}

function normSlideArg(s) {
  if (typeof s !== "object" || s === null) s = {};
  const out = { template: TEMPLATES.includes(s.template) ? s.template : "list" };
  for (const f of ["eyebrow", "titleWhite", "titleOrange", "slogan", "foot"]) {
    if (s[f] !== undefined) out[f] = String(s[f]);
  }
  if (s.paragraphs !== undefined) out.paragraphs = (Array.isArray(s.paragraphs) ? s.paragraphs : [s.paragraphs]).map(String);
  if (s.items !== undefined) out.items = (Array.isArray(s.items) ? s.items : []).map((x) => ({
    emoji: String((x && x.emoji) || "✨"),
    title: String((x && x.title) || ""),
    desc: String((x && x.desc) || ""),
  }));
  if (s.pills !== undefined) out.pills = (Array.isArray(s.pills) ? s.pills : []).map((x) => ({
    text: String((x && x.text) || ""),
    top: Number((x && x.top) || 30),
    side: x && x.side === "right" ? "right" : "left",
    offset: Number((x && x.offset) || 8),
  }));
  if (s.ctaBox !== undefined && s.ctaBox) out.ctaBox = { title: String(s.ctaBox.title || ""), text: String(s.ctaBox.text || "") };
  if (typeof s.background === "string") {
    if (s.background.startsWith("file:")) {
      const fp = expandHome(s.background.replace(/^file:(\/\/)?/, ""));
      if (!fs.existsSync(fp)) throw new Error(`Foto no encontrada: ${fp}`);
      out.bg = { type: "photo", src: "data:image/jpeg;base64," + fs.readFileSync(fp).toString("base64") };
    } else {
      out.bg = s.background.includes("gradient")
        ? { type: "css", css: s.background }
        : { type: "gradient", value: slug(s.background) };
    }
  } else if (s.background && typeof s.background === "object") {
    out.bg = s.background;
  }
  if (s.overlayLight !== undefined) out.overlayLight = !!s.overlayLight;
  return out;
}

const tools = [
  {
    name: "generate_carousel",
    description:
      "Genera un carrusel como archivo HTML editable y pre-cargado con contenido, y lo abre en el navegador. Ahí se suben fotos, se edita inline, se cambia de formato en vivo y se exportan PNGs o PDF. El HTML incluye TODOS los brand kits guardados (window.BRAND_KITS) para cambiar de kit en vivo desde el picker del editor.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del carrusel (se usa en el header y en los nombres de archivo al exportar). Default: 'Carrusel'." },
        fileName: { type: "string", description: "Nombre base del archivo HTML (sin extensión). Default: slug del title + timestamp." },
        outputDir: { type: "string", description: "Directorio de salida. Acepta ~. Default: ~/Downloads." },
        format: { type: "string", enum: ["feed", "square", "story"], description: "Formato inicial: feed (4:5, 1080x1350, default), square (1:1, 1080x1080 para IG/LinkedIn), story (9:16, 1080x1920 para stories/reels/TikTok). Se puede cambiar en vivo en el editor." },
        kitName: { type: "string", description: "Nombre del brand kit (ver list_brand_kits). Se busca en ~/.carousel-generator/brand/{empresa}/kit.json y luego en mcp/kits/ del repo. Default: 'hooked' si existe, si no el kit Default." },
        kit: { type: "object", description: "Brand kit inline (se mergea sobre el kit base): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, gradients:[{name,css,light}] }. logo.imagePath: ruta de logo — 'logo.png' relativo a la carpeta de la empresa (~/.carousel-generator/brand/{empresa}/), o 'file:' + ruta absoluta. Se embebe en base64." },
        slides: {
          type: "array",
          description: "Slides del carrusel. Si se omite, genera 5 slides default (una de cada plantilla).",
          items: {
            type: "object",
            properties: {
              template: { type: "string", enum: TEMPLATES, description: "Plantilla base: cover (portada con título hero φ³), fact (dato + items), map (pills de ubicación, fondo claro), list (items con emoji), cta (cierre con box de marca)." },
              eyebrow: { type: "string", description: "Kicker superior en mayúsculas." },
              titleWhite: { type: "string", description: "Título principal (blanco, monospace, uppercase). '\\n' para cortar línea." },
              titleOrange: { type: "string", description: "Título resaltado dentro de la caja de color primario." },
              paragraphs: { type: "array", items: { type: "string" }, description: "Párrafos. Soporta **negrita**." },
              items: { type: "array", items: { type: "object", properties: { emoji: { type: "string" }, title: { type: "string" }, desc: { type: "string" } } }, description: "Items con emoji (grilla icono + título + descripción)." },
              pills: { type: "array", items: { type: "object", properties: { text: { type: "string" }, top: { type: "number" }, side: { type: "string", enum: ["left", "right"] }, offset: { type: "number" } } }, description: "Pills de ubicación (para template map)." },
              ctaBox: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, description: "Box de marca del cierre." },
              slogan: { type: "string", description: "Slogan final en mayúsculas." },
              foot: { type: "string", description: "Texto chico del pie." },
              background: { type: "string", description: "Nombre de un gradient del kit ('navy','dusk','mapa',...), CSS de linear-gradient completo, o 'file:' + ruta local a una foto (ej: 'file:/tmp/foto.jpg', acepta ~) que se embebe como background." },
              overlayLight: { type: "boolean", description: "Fondo claro con texto oscuro (estilo mapa)." },
            },
          },
        },
      },
    },
  },
  {
    name: "save_brand_kit",
    description: "Guarda un brand kit en ~/.carousel-generator/brand/{empresa}/kit.json para reutilizarlo con generate_carousel y verlo en el picker multi-kit del editor. Acepta logo.imagePath (ruta de imagen relativa a la carpeta de la empresa, o 'file:' + absoluta) que se embebe en base64 dentro del kit. Si el kit ya existe, se mergea sobre él.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre/slug del kit (a-z, 0-9, -)." },
        kit: {
          type: "object",
          description: "El kit (completo o parcial): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, gradients:[{name,css,light}] }.",
        },
      },
      required: ["name", "kit"],
    },
  },
  {
    name: "list_brand_kits",
    description: "Lista los brand kits disponibles: primero las carpetas de empresa en ~/.carousel-generator/brand/ (personales), luego mcp/kits/ del repo (ejemplos). Los personales tienen prioridad ante colisiones de nombre.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "load_brand_kit",
    description: "Devuelve el JSON completo de un brand kit guardado (busca en ~/.carousel-generator/brand/{empresa}/kit.json y en mcp/kits/ del repo).",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
];

function toolGenerate(args) {
  const a = args || {};
  const kit = resolveKit(a.kitName, a.kit);
  const slidesIn = Array.isArray(a.slides) && a.slides.length ? a.slides : TEMPLATES.map((t) => ({ template: t }));
  const slides = slidesIn.map(normSlideArg);
  const title = String(a.title || "Carrusel");
  const format = ["feed", "square", "story"].includes(a.format) ? a.format : "feed";
  const data = { kit, kitSource: { store: "generated", slug: slug(kit.name || "kit") }, meta: { title, format }, slides };
  const brands = brandKitsPayload();
  const html = fs.readFileSync(APP_PATH, "utf8");
  if (!html.includes(MARKER)) throw new Error("La app no contiene el marcador CAROUSEL_DATA.");
  const payload =
    "<script>window.BRAND_KITS=" +
    JSON.stringify(brands).replace(/</g, "\\u003c") +
    ";</script>" +
    "<script>window.CAROUSEL_DATA=" +
    JSON.stringify(data).replace(/</g, "\\u003c") +
    ";</script>";
  const out = html.replace(MARKER, payload);
  const dir = expandHome(a.outputDir || "~/Downloads");
  fs.mkdirSync(dir, { recursive: true });
  const base = a.fileName ? slug(a.fileName) : slug(title) + "-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const file = path.join(dir, base + ".html");
  fs.writeFileSync(file, out, "utf8");
  try {
    if (process.platform === "darwin") spawn("open", [file], { stdio: "ignore", detached: true }).unref();
    else if (process.platform === "linux") spawn("xdg-open", [file], { stdio: "ignore", detached: true }).unref();
  } catch {}
  const kitNames = Object.keys(brands);
  return `Carrusel generado (${slides.length} slides, formato ${format}, kit "${kit.name}"):\n${file}\n\nSe abrió en el navegador. Kits disponibles en el picker: ${kitNames.length ? kitNames.join(", ") : "(solo el activo)"}. Subí las fotos, cambiá de formato (4:5 / 1:1 / 9:16) si querés, y exportá cada slide como PNG o todo como PDF con los botones de exportar. Todo el contenido sigue editable: click directo sobre los textos o desde el panel derecho.`;
}
function toolSaveKit(args) {
  const a = args || {};
  const name = slug(a.name || "");
  if (!name) throw new Error("Falta el nombre del kit.");
  if (!a.kit || typeof a.kit !== "object") throw new Error("Falta el objeto kit.");
  const existing = findKitFile(name);
  const base = existing ? JSON.parse(fs.readFileSync(existing.file, "utf8")) : clone(DEFAULT_KIT);
  const kit = resolveLogo(deepMerge(base, a.kit), name);
  kit.name = (a.kit && a.kit.name) || base.name || name;
  const dir = path.join(BRAND_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "kit.json");
  fs.writeFileSync(file, JSON.stringify(kit, null, 2), "utf8");
  return `Kit "${name}" guardado en ${file}${existing ? " (mergeado sobre el existente)" : " (nuevo, basado en Default)"}${kit.logo && kit.logo.img ? " — logo embebido en base64" : ""}`;
}
function toolListKits() {
  const all = allKitsRaw();
  const slugs = Object.keys(all).sort();
  if (!slugs.length) return "No hay kits guardados. Carpetas de empresa en " + BRAND_DIR + " (cada una con kit.json), ejemplos en " + REPO_KITS + ".";
  const lines = slugs.map((sl) => {
    const entry = all[sl];
    if (!entry.kit) return `- ${sl} (JSON inválido en ${entry.source})`;
    const k = entry.kit;
    return `- ${sl} [${entry.source}] (marca: ${k.name || "?"}, primario: ${(k.colors && k.colors.primary) || "?"}, logo img: ${k.logo && k.logo.img ? "sí" : "no"}, gradients: ${(k.gradients || []).length})`;
  });
  return "Brand kits disponibles (personales primero):\n" + lines.join("\n");
}
function toolLoadKit(args) {
  const name = slug((args && args.name) || "");
  const found = findKitFile(name);
  if (!found) throw new Error(`Kit "${name}" no existe. Usá list_brand_kits. Disponibles: ${availableKitNames().join(", ") || "(ninguno)"}.`);
  return fs.readFileSync(found.file, "utf8");
}

function callTool(name, args) {
  switch (name) {
    case "generate_carousel": return toolGenerate(args);
    case "save_brand_kit": return toolSaveKit(args);
    case "list_brand_kits": return toolListKits();
    case "load_brand_kit": return toolLoadKit(args);
    default: throw new Error(`Herramienta desconocida: ${name}`);
  }
}
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: (params && params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "carousel-generator", version: "2.1.0" },
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: callTool(name, args) }] } };
    } catch (e) {
      return {
        jsonrpc: "2.0", id,
        result: { isError: true, content: [{ type: "text", text: "ERROR: " + (e && e.message ? e.message : String(e)) }] },
      };
    }
  }
  if (method === "notifications/initialized") return null;
  if (id === undefined || id === null) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método desconocido: ${method}` } };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) {
    process.stderr.write("[carousel-mcp] JSON invalido ignorado (" + e.message + "): " + line.slice(0, 200) + "\n");
    return;
  }
  handle(msg)
    .then((res) => { if (res) send(res); })
    .catch((e) => {
      if (msg.id !== undefined && msg.id !== null) {
        send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String((e && e.message) || e) } });
      }
    });
});
rl.on("close", () => process.exit(0));
