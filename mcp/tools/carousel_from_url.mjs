import fs from "node:fs";
import {
  detectCategory,
  extractArticle,
  pickPhotoCandidates,
  splitTitleForCover,
  writeSourceMd,
} from "../lib/article.mjs";
import { DATA_FIG_RE, LIST_EMOJIS, NARRATIVE_REVIEW_PROTOCOL, PHOTO_REVIEW_PROTOCOL } from "../lib/const.mjs";
import { appendHandoff, handoffRender } from "../lib/handoff.mjs";
import { fetchBrandHTML } from "../lib/html.mjs";
import { downloadPhotoToTmp } from "../lib/images.mjs";
import { formatStyleWarnings, lintSlideTexts, narrativeAudit } from "../lib/narrative.mjs";
import { persistCarousel } from "../lib/persist.mjs";
import { renderCarousel, runtimeDataFromArgs } from "../lib/render.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "carousel_from_url",
  description: [
    "Create a draft carousel from an article URL (fetch + title/lead/data/image extraction).",
    "WHAT: apply boldifyData (auto-bold figures), partition lists to ≤3 items, assign article photos by heuristic (drops infographics/logos), return photoNeeds; include PHOTO_REVIEW_PROTOCOL.",
    "WHEN: user shares a note/article URL and wants a carousel draft.",
    "SISTERS: review_slide_images (photo audit), set_slide_photo (replace), edit_slide (refine), validate_carousel (narrative), render_preview (PNGs).",
    "ANTI: the agent MUST visually verify each photo, replace bad ones with stock via set_slide_photo, and re-audit with review_slide_images before delivering.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL http(s) de la nota/artículo." },
      company: { type: "string", description: "Slug de empresa. Default: og:site_name o hostname." },
      kitName: {
        type: "string",
        description: "Brand kit a usar (ver list_brand_kits). Si se omite, usa el primer kit personal o Default.",
      },
      carouselName: { type: "string", description: "Slug persistido del carrusel. Default: slug del título." },
      format: { type: "string", enum: ["feed", "square", "story"], description: "Formato (default feed 4:5)." },
      category: {
        type: "string",
        description: "Categoría de la nota para highlightColors (default: detectada del artículo).",
      },
      persist: { type: "boolean", description: "Guardar carousel.json (default true)." },
      outputDir: { type: "string", description: "Directorio del HTML. Default ~/Downloads." },
      fileName: { type: "string", description: "Nombre base del HTML." },
      open: {
        type: "boolean",
        description: "Abrir el HTML (default true para load/generate/from_url; default false para tools iterativas).",
      },
    },
    required: ["url"],
  },
  async handler(args) {
    const a = args || {};
    if (!a.url) throw new Error("Falta `url`.");
    const pageUrl = new URL(a.url).href;
    const html = await fetchBrandHTML(pageUrl);
    const art = extractArticle(html, pageUrl);
    if (!art.title) throw new Error("No se pudo extraer el título de la nota.");
    const company = slug(a.company || art.site);
    const carouselName = slug(a.carouselName || a.fileName || art.title);
    const cover = splitTitleForCover(art.title);
    const figParas = art.paras.filter((p) => DATA_FIG_RE.test(p));
    const otherParas = art.paras.filter((p) => !figParas.includes(p));
    const slides = [
      {
        template: "cover",
        eyebrow: art.site.toUpperCase(),
        titleWhite: cover.white,
        titleOrange: cover.orange,
        paragraphs: [art.dek].filter(Boolean),
      },
    ];
    figParas.slice(0, 2).forEach((p, i) => {
      const fig = (p.match(DATA_FIG_RE) || [])[0] || "";
      const words = p.split(/\s+/);
      slides.push({
        template: "fact",
        eyebrow: i === 0 ? "EL DATO" : "EL CONTEXTO",
        titleWhite: words.slice(0, 3).join(" ").toUpperCase(),
        titleOrange: fig.toUpperCase(),
        paragraphs: [p.length > 220 ? p.slice(0, 217).trimEnd() + "…" : p],
      });
    });
    if (art.items.length >= 3) {
      slides.push({
        template: "list",
        eyebrow: "CLAVES DE LA NOTA",
        titleWhite: "LOS PUNTOS",
        titleOrange: "A SEGUIR",
        items: art.items.slice(0, 9).map((t, i) => ({
          emoji: LIST_EMOJIS[i % LIST_EMOJIS.length],
          title: t.length > 70 ? t.slice(0, 67).trimEnd() + "…" : t,
          desc: "",
        })),
      });
    }
    if (otherParas.length) {
      const p = otherParas[0];
      slides.push({
        template: "fact",
        eyebrow: "PARA TENER EN CUENTA",
        titleWhite: p.split(/\s+/).slice(0, 3).join(" ").toUpperCase(),
        titleOrange: "EL CONTEXTO",
        paragraphs: [p.length > 220 ? p.slice(0, 217).trimEnd() + "…" : p],
      });
    }
    slides.push({
      template: "cta",
      eyebrow: "SEGUÍ LA NOTA",
      titleWhite: "NOTA COMPLETA EN",
      titleOrange: art.site.toUpperCase(),
      paragraphs: [],
      ctaBox: { title: "LEER LA NOTA", text: pageUrl },
    });
    // Fotos: candidatos del artículo → asignar por orden; slides sin foto → photoNeeds
    const candidates = pickPhotoCandidates(art);
    const detected = detectCategory(html);
    const assigned = [];
    const photoNeeds = [];
    const slots = [];
    const tmpFiles = [];
    for (let i = 0; i < slides.length; i++) if (["cover", "fact", "list"].includes(slides[i].template)) slots.push(i);
    let ci = 0;
    for (const si of slots) {
      let file = null,
        src = null;
      while (ci < candidates.length && !file) {
        try {
          file = await downloadPhotoToTmp(candidates[ci]);
          src = candidates[ci];
        } catch (e) {
          process.stderr.write(`[carousel-from-url] foto descartada ${candidates[ci]}: ${(e && e.message) || e}\n`);
          ci++;
        }
      }
      if (file) {
        tmpFiles.push(file);
        slides[si].background = `file:${file}`;
        slides[si].scrim = slides[si].template === "cover" ? 55 : 50;
        slides[si].bgPos = "center";
        assigned.push({ slide: si + 1, source: src });
        ci++;
      } else {
        photoNeeds.push({
          slide: si + 1,
          template: slides[si].template,
          query: `${art.title} ${slides[si].eyebrow}`.trim(),
        });
      }
    }
    if (!photoNeeds.length && !assigned.length) {
      photoNeeds.push({ slide: 1, template: "cover", query: art.title });
    }
    const runtime = runtimeDataFromArgs({
      ...a,
      title: art.title,
      company,
      carouselName,
      slides,
      category: a.category || (detected && detected.category),
    });
    runtime.company = company;
    runtime.slug = carouselName;
    // Las fotos ya quedaron embebidas como data URL / assets: limpiá los temporales.
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
    let persisted = null;
    if (a.persist !== false) persisted = persistCarousel(runtime, company, carouselName);
    let sourceMd = null;
    if (persisted) {
      try {
        sourceMd = writeSourceMd(persisted.dir, {
          url: pageUrl,
          title: art.title,
          site: art.site,
          dek: art.dek,
          category: runtime.meta.category || (detected && detected.category) || "",
          paras: art.paras,
          items: art.items,
        });
      } catch (e) {
        process.stderr.write(`[carousel-from-url] source.md skip: ${e.message}\n`);
      }
    }
    const file = renderCarousel(runtime, { ...a, open: a.open !== false, stable: true });
    const lines = [
      `Carrusel desde URL creado (${runtime.slides.length} slides):`,
      file,
      `JSON persistido: ${persisted ? persisted.file : "no (persist:false)"}`,
      ...(sourceMd ? [`source.md: ${sourceMd.file}${sourceMd.wrote ? " (nuevo)" : ` (${sourceMd.reason})`}`] : []),
      "",
      detected
        ? `Categoría detectada: "${runtime.meta.category || detected.category}" (señal: ${detected.source})${runtime.kit.highlightColors && runtime.kit.highlightColors[runtime.meta.category || detected.category] ? ` → highlight: ${runtime.kit.highlightColors[runtime.meta.category || detected.category]}` : " (sin color en kit.highlightColors — se usa el primario)"}`
        : "Categoría no detectada — seteá meta.category manualmente si el kit define highlightColors.",
      "",
      `Fotos del artículo asignadas: ${assigned.length ? assigned.map((x) => `slide ${x.slide} ← ${x.source}`).join("; ") : "(ninguna candidata válida)"}`,
    ];
    if (photoNeeds.length) {
      lines.push("", "photoNeeds (slides sin foto coherente):");
      for (const n of photoNeeds) lines.push(`  - slide ${n.slide} (${n.template}) → query sugerida: "${n.query}"`);
    }
    lines.push(
      "",
      "IMPORTANTE — Verificá cada foto asignada con visión (descargá/miniaturizá y confirmá que coincide con el mensaje de la slide).",
      PHOTO_REVIEW_PROTOCOL,
    );
    const audit = narrativeAudit(runtime.slides, art.title);
    lines.push("", `narrativeAudit (hilo/coherencia): ok=${audit.ok}`);
    if (audit.flags.length) {
      lines.push("  flags:");
      for (const f of audit.flags)
        lines.push(`  - [${f.severity}${f.confidence ? "/" + f.confidence : ""}] ${f.rule}: ${f.detail}`);
    } else {
      lines.push("  (sin flags — revisá igual que cada slide conecte con la anterior)");
    }
    lines.push("", NARRATIVE_REVIEW_PROTOCOL);
    lines.push(...formatStyleWarnings(lintSlideTexts(runtime.slides)));
    const handoff = handoffRender(file, persisted ? persisted.file : null, runtime, {
      nextSteps: [
        a.open === false ? "HTML generado sin abrir (open:false)." : "Se abrió en el navegador.",
        ...(sourceMd && sourceMd.wrote
          ? [`source.md guardado: ${sourceMd.file} — usalo como fuente en social_copy.`]
          : ["source.md no se escribió (podía existir ya)."]),
        "Seguí el PHOTO REVIEW PROTOCOL y el NARRATIVE_REVIEW_PROTOCOL antes de entregar.",
        ...(photoNeeds.length
          ? [`Hay ${photoNeeds.length} slides sin foto coherente: resuelvelas con set_slide_photo / stock.`]
          : []),
      ],
    });
    return appendHandoff(lines.join("\n"), handoff);
  },
};
