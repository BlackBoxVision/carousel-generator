import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_PATH = path.join(__dirname, "..", "..", "app", "index.html");
export const REPO_KITS = path.join(__dirname, "..", "kits");
export const MARKER = "<!--CAROUSEL_DATA-->";
export const TEMPLATES = ["cover", "fact", "map", "list", "cta"];
export const BLOCK_TYPES = [
  "brand",
  "count",
  "stack",
  "kicker",
  "text",
  "highlight",
  "body",
  "items",
  "item",
  "box",
  "pill",
  "slogan",
  "foot",
];
export const IMG_EXTS = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".heic": "image/heic",
};
export const CONVERTIBLE_EXTS = new Set([".avif", ".heic", ".heif"]);
export const MAX_LIST_ITEMS = 3;
export const SERVER_INFO = { name: "carousel-generator", version: "2.4.0" };

export const SERVER_INSTRUCTIONS = [
  "Carousel Generator MCP: create, edit, export and publish Instagram/LinkedIn carousels.",
  "",
  "How to work with this server:",
  "- Call these tools for ALL carousel work (names may appear with a client prefix such as carousel_*).",
  "- Do NOT read mcp/tools/*.mjs or edit carousel.json / kit files on disk to discover arguments.",
  "  Every argument is defined in each tool's inputSchema; follow it exactly.",
  "- Prefer structured tools (edit_slide, set_slide_photo, set_slide_bg, set_carousel_meta,",
  "  set_slide_* actions) over raw save_carousel JSON whenever a dedicated tool exists.",
  "- Before delivering: run the PHOTO REVIEW PROTOCOL when photos are involved and the",
  "  NARRATIVE REVIEW PROTOCOL for generated or URL-imported content. Fix every styleWarnings entry.",
  "- delete_carousel and delete_brand_kit are two-step: without confirm:true they only preview.",
  "  Ask the user before the second call with confirm:true.",
  "- Use validate_carousel as a dry-run audit before handoff; use render_preview / export_pdf",
  "  for PNG/PDF output; use social_copy for captions and alt text.",
].join("\n");

export const DEFAULT_KIT = {
  name: "Default",
  colors: { primary: "#0ea5e9", secondary: "#0f172a", tertiary: "#ffffff", slideBg: "#1e293b" },
  fonts: {
    heading: "'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap",
  },
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
  "PHOTO REVIEW PROTOCOL (run this before delivering the carousel):",
  "1. VERIFY — for each slide with a photo: open/preview the image and verify VISUALLY that it",
  "   matches the slide message (kicker/title/body).",
  "2. REPLACE — if a photo does not make sense (infographic, logo, off-topic):",
  "   a. use the suggested query in photoNeeds (or refine it),",
  "   b. search stock photos with websearch (free license: Unsplash/Pexels),",
  "   c. download the candidate and VERIFY IT VISUALLY before applying,",
  "   d. apply it with set_slide_photo(company, slug, slide, source).",
  "3. RE-AUDIT — run review_slide_images again and confirm every slide has a coherent photo.",
  "Never deliver a carousel with unverified photos.",
].join("\n");

export const NARRATIVE_REVIEW_PROTOCOL = [
  "NARRATIVE REVIEW PROTOCOL (run this before delivering the carousel — especially if it was",
  "generated from a URL):",
  "1. READ — read the kicker, title, highlight and body of EVERY slide in order (1..N).",
  "2. COMMON THREAD — confirm every slide talks about the same subject/topic as the note;",
  "   there must be no filler slides disconnected from the cover or title.",
  "3. ARC — full arc present: cover (hook) → development → cta (end). Order is linear, never backwards.",
  "4. COHESION — each slide connects to the previous one (logical bridge or sequence), no random topic jumps.",
  "5. FIX — if something fails: rewrite copy or reorder with edit_slide",
  "   (action update_text | move) and re-audit before delivering.",
  "Use narrativeAudit.flags as starting points (solid flags are almost certain; orphan-slide is",
  "low-confidence advisory).",
  "Never deliver a carousel with slides that lack a common thread.",
].join("\n");

export const STYLE_CLICHES = [
  "en un mundo",
  "cabe destacar",
  "es importante destacar",
  "es importante señalar",
  "no cabe duda",
  "al siguiente nivel",
  "punto de inflexión",
];
export const STOPWORDS = new Set(
  "de la el los las un una unos unas y o u en con por para del al que como mas más se su sus es son fue fueron seran serán entre sobre desde hasta sin contra hacia muy ya tambien también no ni si sí cada todo toda todos todas otro otra este esta estos estas ese esa eso aquel donde cual cuales porque pero donc más menos tras ante bajo sobre segun según".split(
    /\s+/,
  ),
);
export const BAD_IMG_HINTS =
  /flyer|infograf|logo|banner|icon|sprite|avatar|emoji|badge|placeholder|\bads?[-_/]|pixel|tracking/i;
export const DATA_FIG_RE =
  /(?:US\s?\$|USD|R\$|AR\$|€|£|\$)\s?[\d][\d.,]*|[+-]?\d+(?:[.,]\d+)?\s?%|\b\d[\d.,]*(?:\s?(?:millones|millón|miles|mil))\b/i;
export const LIST_EMOJIS = ["✅", "📈", "🔎", "💡", "⚙️", "🤝", "🌍", "📊", "🧭", "🚀", "🏷️", "📞"];
