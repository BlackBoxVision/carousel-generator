import { TEMPLATES } from "../lib/const.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { brandKitsPayload } from "../lib/kits.mjs";
import { formatStyleWarnings, lintSlideTexts } from "../lib/narrative.mjs";
import { persistCarousel } from "../lib/persist.mjs";
import { renderCarousel, runtimeDataFromArgs } from "../lib/render.mjs";
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
        description:
          "Título del carrusel (se usa en el header y en los nombres de archivo al exportar). Default: 'Carrusel'.",
      },
      fileName: {
        type: "string",
        description: "Nombre base del archivo HTML (sin extensión). Default: slug del title + timestamp.",
      },
      carouselName: {
        type: "string",
        description: "Slug persistido del carrusel dentro de ~/.carousel-generator/carousels/{company}/.",
      },
      company: {
        type: "string",
        description: "Empresa/brand slug que agrupa el carrusel. Default: kitName o nombre del kit.",
      },
      outputDir: { type: "string", description: "Directorio de salida. Acepta ~. Default: ~/Downloads." },
      format: {
        type: "string",
        enum: ["feed", "square", "story"],
        description:
          "Formato inicial: feed (4:5, 1080x1350, default), square (1:1, 1080x1080 para IG/LinkedIn), story (9:16, 1080x1920 para stories/reels/TikTok). Se puede cambiar en vivo en el editor.",
      },
      showNumbers: {
        type: "boolean",
        description:
          "Muestra el chip de numeración N/M arriba a la derecha de cada slide (default true). Pasá false para un look limpio sin números.",
      },
      category: {
        type: "string",
        description:
          "Categoría de la nota (ej: Turismo, Diplomacia, Comercio Internacional). Si el kit define highlightColors[category], los bloques highlight sin override usan ese color de fondo. Se guarda en meta.category.",
      },
      persist: {
        type: "boolean",
        description:
          "Guarda carousel.json v2 y copia los assets en ~/.carousel-generator/carousels/{company}/{carouselName}/. Default true.",
      },
      kitName: {
        type: "string",
        description:
          "Nombre del brand kit (ver list_brand_kits). Se busca en ~/.carousel-generator/brand/{empresa}/kit.json y luego en mcp/kits/ del repo. Default: primer kit del usuario, o Default si no hay ninguno.",
      },
      kit: {
        type: "object",
        description:
          "Brand kit inline (se mergea sobre el kit base): { name, colors:{primary,secondary,tertiary,slideBg}, fonts:{heading,body,googleUrl}, logo:{letter,text,img,imgH,imagePath}, logoBackground, logoShape, logoSize, photoOverlay:{enabled,css}, gradients:[{name,css,light}] }. logo.imagePath: ruta de logo — 'logo.png' relativo a la carpeta de la empresa (~/.carousel-generator/brand/{empresa}/), o 'file:' + ruta absoluta. Se embebe en base64. logoBackground: color de fondo del logo (ej: '#fff', 'transparent'). Default: transparent. logoShape: forma del fondo del logo ('square' o 'rectangular'). Default: square. logoSize: tamaño del logo en px (default: 43). photoOverlay: gradiente entre foto y texto {enabled:boolean, css:string}. Default: gradiente oscuro inferior.",
      },
      open: { type: "boolean", description: "Abrir el HTML en el navegador (default true). Pasá false para no abrir." },
      slides: {
        type: "array",
        description: "Slides del carrusel. Si se omite, genera 5 slides default (una de cada plantilla).",
        items: {
          type: "object",
          properties: {
            template: {
              type: "string",
              enum: TEMPLATES,
              description:
                "Plantilla base: cover (portada con título hero φ³), fact (dato + items), map (pills de ubicación, fondo claro), list (items con emoji), cta (cierre con box de marca).",
            },
            eyebrow: { type: "string", description: "Kicker superior en mayúsculas." },
            titleWhite: {
              type: "string",
              description:
                "Formato legacy. Preferí elements con un bloque text blanco más chico; no mezcles el resaltado naranja inline.",
            },
            titleOrange: {
              type: "string",
              description:
                "Formato legacy. Preferí elements con un bloque highlight naranja más grande debajo del text blanco.",
            },
            paragraphs: {
              type: "array",
              items: { type: "string" },
              description: "Párrafos. Soporta **negrita** y ==resaltado==.",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { emoji: { type: "string" }, title: { type: "string" }, desc: { type: "string" } },
              },
              description: "Items con emoji (grilla icono + título + descripción).",
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
              description: "Pills de ubicación (para template map).",
            },
            ctaBox: {
              type: "object",
              properties: { title: { type: "string" }, text: { type: "string" } },
              description: "Box de marca del cierre.",
            },
            slogan: { type: "string", description: "Slogan final en mayúsculas." },
            foot: { type: "string", description: "Texto chico del pie." },
            background: {
              type: "string",
              description:
                "Nombre de un gradient del kit ('navy','dusk','mapa',...), CSS de linear-gradient completo, o 'file:' + ruta local a una foto (ej: 'file:/tmp/foto.jpg', acepta ~) que se embebe como background.",
            },
            overlayLight: { type: "boolean", description: "Fondo claro con texto oscuro (estilo mapa)." },
            scrim: {
              type: "number",
              description:
                "Velo de opacidad oscura sobre foto (0-85, default 45 en fotos). Capa sólida html2canvas-safe para que el texto no se pierda.",
            },
            bgPos: {
              type: "string",
              description:
                "Punto focal de la foto: 'center', 'center 30%', 'top', 'left bottom', etc. Evita que el sujeto quede cortado al cambiar de formato.",
            },
            align: {
              type: "object",
              description: "Alineación por bloque: {eyebrow,title,body} cada uno left|center|right (default left).",
              properties: { eyebrow: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
            },
            copyPos: {
              type: "object",
              description: "Posición estructurada del bloque de texto: {anchor: top|center|bottom, offset: -10..10}.",
              properties: { anchor: { type: "string" }, offset: { type: "number" } },
            },
            elements: {
              type: "array",
              description:
                "Árbol nested v2. Cada nodo es {id,type,style,pos,text,children}; tipos: brand,count,stack,kicker,text,highlight,body,items,item,box,pill,slogan,foot. Si se pasa, reemplaza la forma plana y se persiste tal cual normalizada.",
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
    const file = renderCarousel(data, { ...a, open: a.open !== false, stable: true });
    const kitNames = Object.keys(brandKitsPayload((data.kitSource && data.kitSource.slug) || data.kit.name));
    const styleLines = formatStyleWarnings(lintSlideTexts(data.slides));
    const handoff = handoffRender(file, persisted ? persisted.file : null, data, {
      nextSteps: [
        a.open === false
          ? "HTML generado sin abrir (open:false). Pasá open:true o abrí la ruta a mano."
          : "Se abrió en el navegador.",
        `Kits en el picker: ${kitNames.length ? kitNames.join(", ") : "(solo el activo)"}.`,
        "Exportá PNGs/PDF desde el editor.",
        ...(styleLines.length ? ["Corregí los styleWarnings listados arriba."] : []),
      ],
    });
    return appendHandoff(
      `Carrusel generado (${data.slides.length} slides, formato ${data.meta.format}, kit "${data.kit.name}"):\n${file}\n\nJSON persistido: ${persisted ? persisted.file : "no (persist:false)"}\nEmpresa: ${company} · Carrusel: ${carouselName}\n\nEl árbol nested de bloques sigue editable y el HTML se puede exportar a PNG/PDF.${styleLines.length ? "\n" + styleLines.join("\n") : ""}`,
      handoff,
    );
  },
};
