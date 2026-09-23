import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_PATH = path.join(__dirname, "..", "..", "app", "index.html");
export const REPO_KITS = path.join(__dirname, "..", "kits");
export const MARKER = "<!--CAROUSEL_DATA-->";
export const TEMPLATES = ["cover", "fact", "map", "list", "cta"];
export const BLOCK_TYPES = ["brand", "count", "stack", "kicker", "text", "highlight", "body", "items", "item", "box", "pill", "slogan", "foot"];
export const IMG_EXTS = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif", ".heic": "image/heic" };
export const CONVERTIBLE_EXTS = new Set([".avif", ".heic", ".heif"]);
export const MAX_LIST_ITEMS = 3;
export const SERVER_INFO = { name: "carousel-generator", version: "2.3.0" };

export const DEFAULT_KIT = {
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

export function canvasForFormat(format) {
  return format === "square" ? { w: 1080, h: 1080 } : format === "story" ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
}

export const PHOTO_REVIEW_PROTOCOL = [
  "PHOTO REVIEW PROTOCOL (ejecutalo antes de entregar el carrusel al usuario):",
  "1. VERIFY — para cada slide con foto: abrí/miniaturizá la imagen y verificá VISUALMENTE que coincida con el mensaje de la slide (kicker/título/body).",
  "2. REPLACE — si una foto no tiene sentido (infografía, logo, fuera de tema):",
  "   a. usá la query sugerida en photoNeeds (o refinála),",
  "   b. buscá fotos de stock con websearch (licencia libre: Unsplash/Pexels),",
  "   c. descargá la candidata y VERIFICALA VISUALMENTE antes de aplicarla,",
  "   d. aplicala con set_slide_photo(company, slug, slide, source).",
  "3. RE-AUDIT — volvé a correr review_slide_images y confirmá que cada slide tiene una foto coherente.",
  "Nunca entregues un carrusel con fotos sin verificar.",
].join("\n");

export const NARRATIVE_REVIEW_PROTOCOL = [
  "NARRATIVE REVIEW PROTOCOL (ejecutalo antes de entregar el carrusel — sobre todo si se generó desde una URL):",
  "1. READ — leé el kicker, título, highlight y body de TODAS las slides en orden (1..N).",
  "2. COMMON THREAD — confirmá que todas hablan del mismo sujeto/tema de la nota; no debe haber slides de relleno sin conexión con la portada ni con el título.",
  "3. ARC — verificá arco completo: portada (gancho) → desarrollo → cierre (cta al final). El orden debe ser lineal, sin ir para atrás.",
  "4. COHESIÓN — cada slide debe conectar con la anterior (puente lógico o secuencia), sin saltos random de tema.",
  "5. FIX — si algo falla: corregí copy o reordená con edit_slide (action update_text | move) y volvé a auditar antes de entregar.",
  "Mirá narrativeAudit.flags como puntos de partida (los flags sólidos son casi seguros; orphanSlides es advisory de baja confianza).",
  "Nunca entregues un carrusel con slides sin sentido ni sin hilo común.",
].join("\n");

export const STYLE_CLICHES = ["en un mundo", "cabe destacar", "es importante destacar", "es importante señalar", "no cabe duda", "al siguiente nivel", "punto de inflexión"];
export const STOPWORDS = new Set(("de la el los las un una unos unas y o u en con por para del al que como mas más se su sus es son fue fueron seran serán entre sobre desde hasta sin contra hacia muy ya tambien también no ni si sí cada todo toda todos todas otro otra este esta estos estas ese esa eso aquel donde cual cuales porque pero donc más menos tras ante bajo sobre segun según").split(/\s+/));
export const BAD_IMG_HINTS = /flyer|infograf|logo|banner|icon|sprite|avatar|emoji|badge|placeholder|\bads?[-_/]|pixel|tracking/i;
export const DATA_FIG_RE = /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d[\d.,]*(?:\s?(?:millones|millón|miles|mil))\b/i;
export const LIST_EMOJIS = ["✅", "📈", "🔎", "💡", "⚙️", "🤝", "🌍", "📊", "🧭", "🚀", "🏷️", "📞"];
