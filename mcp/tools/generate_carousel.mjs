import { TEMPLATES } from "../lib/const.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { brandKitsPayload } from "../lib/kits.mjs";
import { formatStyleWarnings, lintSlideTexts } from "../lib/narrative.mjs";
import { persistCarousel } from "../lib/persist.mjs";
import { renderCarouselSafe, runtimeDataFromArgs } from "../lib/render.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "generate_carousel",
  description: [
    "Create a new editable carousel HTML and optionally open it.",
    "WHAT: build slides from a nested block tree (brand, stack, text, highlight, body, items, box, ...) with positions/styles; persist carousel.json v2 by default; HTML includes all saved brand kits for live switching.",
    "WHEN: starting a new carousel from scratch or from an inline kit; first step of any create flow.",
    "SISTERS: carousel_from_url (from article), load_carousel (reopen), save_carousel (bulk upsert), edit_slide (refine slides), set_slide_photo / set_slide_bg (media), set_carousel_meta (title/format), validate_carousel (audit), render_preview / export_pdf (output).",
    "ANTI: do NOT edit carousel.json on disk yourself; do NOT invent block types outside BLOCK_TYPES; fix every styleWarnings entry (em-dash, 'no es X, es Y', AI clichés) before delivering.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Carousel title (used in the header and in file names on export). Default: 'Carrusel'.",
      },
      fileName: {
        type: "string",
        description: "Base name of the HTML file (no extension). Default: slug of title + timestamp.",
      },
      carouselName: {
        type: "string",
        description: "Persisted carousel slug under ~/.carousel-generator/carousels/{company}/.",
      },
      company: {
        type: "string",
        description: "Company/brand slug that groups the carousel. Default: kitName or kit name.",
      },
      outputDir: { type: "string", description: "Output directory. Accepts ~. Default: ~/Downloads." },
      format: {
        type: "string",
        enum: ["feed", "square", "story"],
        description:
          "Initial format: feed (4:5, 1080x1350, default), square (1:1, 1080x1080 for IG/LinkedIn), story (9:16, 1080x1920 for stories/reels/TikTok). Can be changed live in the editor.",
      },
      showNumbers: {
        type: "boolean",
        description:
          "Shows the N/M numbering chip at the top right of each slide (default true). Pass false for a clean look without numbers.",
      },
      category: {
        type: "string",
        description:
          "Category of the piece (e.g: Tourism, Diplomacy, International Trade). If the kit defines highlightColors[category], highlight blocks without override use that background color. Stored in meta.category.",
      },
      persist: {
        type: "boolean",
        description:
          "Saves carousel.json v2 and copies assets to ~/.carousel-generator/carousels/{company}/{carouselName}/. Default true.",
      },
      kitName: {
        type: "string",
        description:
          "Brand kit name (see list_brand_kits). Looked up in ~/.carousel-generator/brand/{company}/kit.json then in the repo's mcp/kits/. Default: the user's first kit, or Default if none.",
      },
      kit: {
        type: "object",
        description:
          "Inline brand kit (merged over the base kit): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, logoBackground, logoShape, logoSize, photoOverlay:{enabled,css}, gradients:[{name,css,light}] }. logo.imagePath: logo path — 'logo.png' relative to the company folder (~/.carousel-generator/brand/{company}/), or 'file:' + absolute path. Embedded as base64. logoBackground: logo background color (e.g: '#fff', 'transparent'). Default: transparent. logoShape: shape of the logo background ('square' or 'rectangular'). Default: square. logoSize: logo size in px (default: 43). photoOverlay: gradient between photo and text {enabled:boolean, css:string}. Default: dark bottom gradient.",
      },
      open: {
        type: "boolean",
        description: "Open the HTML in the browser (default true). Pass false to skip opening.",
      },
      slides: {
        type: "array",
        description: "Carousel slides. If omitted, generates 5 default slides (one per template).",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Slide id (round-trip from a persisted carousel). Default: slide-N.",
            },
            template: {
              type: "string",
              enum: TEMPLATES,
              description:
                "Base template: cover (title page with hero φ³ title), fact (data + items), map (location pills, light background), list (items with emoji), cta (closing with brand box).",
            },
            eyebrow: { type: "string", description: "Top kicker in uppercase." },
            titleWhite: {
              type: "string",
              description:
                "Legacy format. Prefer elements with a smaller white text block; don't mix in the inline orange highlight.",
            },
            titleOrange: {
              type: "string",
              description: "Legacy format. Prefer elements with a larger orange highlight block below the white text.",
            },
            paragraphs: {
              type: "array",
              items: { type: "string" },
              description: "Paragraphs. Supports **bold** and ==highlight==.",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { emoji: { type: "string" }, title: { type: "string" }, desc: { type: "string" } },
              },
              description: "Items with emoji (icon + title + description grid).",
            },
            pills: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  top: { type: "number" },
                  side: { type: "string", enum: ["left", "right"] },
                  offset: { type: "number" },
                },
              },
              description: "Location pills (for the map template).",
            },
            ctaBox: {
              type: "object",
              properties: { title: { type: "string" }, text: { type: "string" } },
              description: "Closing brand box.",
            },
            slogan: { type: "string", description: "Final slogan in uppercase." },
            foot: { type: "string", description: "Small footer text." },
            background: {
              type: "string",
              description:
                "Name of a kit gradient ('navy','dusk','mapa',...), full linear-gradient CSS, or 'file:' + local path to a photo (e.g: 'file:/tmp/foto.jpg', ~ accepted) embedded as background.",
            },
            bg: {
              type: "object",
              description:
                "Persisted background (round-trip): {type:'gradient'|'css'|'photo', value|css|asset, scrim?, bgPos?}. Alias of background.",
            },
            overlayLight: { type: "boolean", description: "Light background with dark text (map style)." },
            scrim: {
              type: "number",
              description:
                "Dark opacity veil over photo (0-85, default 45 on photos). Solid html2canvas-safe layer so text stays readable.",
            },
            bgPos: {
              type: "string",
              description:
                "Photo focal point: 'center', 'center 30%', 'top', 'left bottom', etc. Prevents the subject from getting cropped when the format changes.",
            },
            align: {
              type: "object",
              description: "Per-block alignment: {eyebrow,title,body} each left|center|right (default left).",
              properties: { eyebrow: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
            },
            copyPos: {
              type: "object",
              description: "Structured text block position: {anchor: top|center|bottom, offset: -10..10}.",
              properties: { anchor: { type: "string" }, offset: { type: "number" } },
            },
            elements: {
              type: "array",
              description:
                "Nested v2 tree. Each node is {id,type,style,pos,text,children}; types: brand,count,stack,kicker,text,highlight,body,items,item,box,pill,slogan,foot. If passed, replaces the flat shape and is persisted normalized as-is.",
            },
          },
        },
      },
    },
  },
  handler(args) {
    const a = args || {};
    const data = runtimeDataFromArgs(a);
    const company = slug(a.company || a.kitName || data.kit.name || "default");
    const carouselName = slug(a.carouselName || a.fileName || data.meta.title);
    data.company = company;
    data.slug = carouselName;
    let persisted = null;
    if (a.persist !== false) persisted = persistCarousel(data, company, carouselName);
    const rendered = renderCarouselSafe(data, { ...a, open: a.open !== false, stable: true });
    const file = rendered.file;
    const kitNames = Object.keys(brandKitsPayload((data.kitSource && data.kitSource.slug) || data.kit.name));
    const styleLines = formatStyleWarnings(lintSlideTexts(data.slides));
    const handoff = handoffRender(file, persisted ? persisted.file : null, data, {
      nextSteps: [
        a.open === false
          ? "HTML generated without opening it (open:false). Pass open:true or open the path manually."
          : rendered.warning
            ? "HTML could not be generated — check the warning."
            : "Opened in the browser.",
        `Kits in the picker: ${kitNames.length ? kitNames.join(", ") : "(active one only)"}.`,
        "Export PNGs/PDF from the editor.",
        ...(rendered.warning ? [rendered.warning] : []),
        ...(styleLines.length ? ["Fix the styleWarnings listed above."] : []),
      ],
    });
    return appendHandoff(
      `Carrusel generado (${data.slides.length} slides, formato ${data.meta.format}, kit "${data.kit.name}"):\n${
        file || "(HTML no generado)"
      }${rendered.warning ? `\nWARNING: ${rendered.warning}` : ""}\n\nJSON persistido: ${
        persisted ? persisted.file : "no (persist:false)"
      }\nEmpresa: ${company} · Carrusel: ${carouselName}\n\nEl árbol nested de bloques sigue editable y el HTML se puede exportar a PNG/PDF.${
        styleLines.length ? "\n" + styleLines.join("\n") : ""
      }`,
      handoff,
    );
  },
};
