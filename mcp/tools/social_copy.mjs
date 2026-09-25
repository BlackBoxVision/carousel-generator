import fs from "node:fs";
import path from "node:path";
import { extractFigures } from "../lib/narrative.mjs";
import { readCarousel } from "../lib/persist.mjs";
import { altTextFor, buildCaption, buildHashtags, hookVariants, readSourceMd, slidePlainText } from "../lib/social.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "social_copy",
  description: [
    "Generate social post copy (captions, hooks, hashtags, altText) for a persisted carousel.",
    "WHAT: source priority source.md → slides → meta; platforms instagram|linkedin|x|facebook|tiktok (default instagram+linkedin); es-AR; local heuristics, no API key; altText ≤125 chars per slide.",
    "WHEN: after validate_carousel is green, when user asks to publish or needs captions/hashtags.",
    "SISTERS: validate_carousel (pre-check), review_slide_images (alt context), render_preview / export_pdf (assets).",
    "ANTI: do NOT deliver without reviewing altText ≤125 and avoiding literal slide-copy repetition; fix styleWarnings first.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Company slug." },
      name: { type: "string", description: "Carousel slug (alias: slug)." },
      slug: { type: "string", description: "Alias of name." },
      platforms: {
        type: "array",
        items: { type: "string", enum: ["instagram", "linkedin", "x", "facebook", "tiktok"] },
        description: "Platforms to generate. Default: ['instagram','linkedin'].",
      },
      tone: {
        type: "string",
        enum: ["directo", "inspirador", "informativo", "provocador", "cercano"],
        description: "Copy tone (default: informativo).",
      },
      audience: { type: "string", description: "Target audience (e.g: 'marketing managers B2B')." },
      cta: { type: "string", description: "Custom final call to action (if any)." },
      includeHashtags: { type: "boolean", description: "Include hashtags (default true)." },
      maxHashtags: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        description: "Maximum hashtags (default: 8 IG, 5 LinkedIn, 2 X).",
      },
      language: { type: "string", description: "BCP-47 language (default: es-AR)." },
      save: { type: "boolean", description: "Save social.md next to carousel.json (default false)." },
    },
    required: ["company"],
  },
  handler(args) {
    const a = args || {};
    // Chequeo sobre el valor crudo: slug("") cae al fallback "carrusel" y escondía el error.
    const rawCompany = String(a.company ?? "").trim();
    const rawName = String(a.name ?? a.slug ?? "").trim();
    if (!rawCompany) throw new Error("Falta `company` (requerido).");
    if (!rawName) throw new Error("Falta `name`/`slug` (requerido).");
    const company = slug(rawCompany);
    const name = slug(rawName);
    const record = readCarousel(company, name);
    const stored = record.stored;
    const meta = stored.meta || {};
    const title = meta.title || name;
    const category = meta.category || "";
    const kitName = (stored.kit && stored.kit.name) || "";
    const source = readSourceMd(record.dir);
    const dek = (source && (source.frontmatter.dek || (source.sections["Descripción curada"] || []).join(" "))) || "";
    const tone = a.tone || "informativo";
    const audience = a.audience || "";
    const language = a.language || "es-AR";
    const platforms = (Array.isArray(a.platforms) && a.platforms.length ? a.platforms : ["instagram", "linkedin"])
      .map((p) => String(p).toLowerCase())
      .filter((p) => ["instagram", "linkedin", "x", "facebook", "tiktok"].includes(p));
    if (!platforms.length) throw new Error("`platforms` vacío o inválido.");
    const slides = stored.slides || [];
    if (!slides.length) throw new Error("El carrusel no tiene slides.");
    const slideTexts = slides.map((s) => slidePlainText(s));
    const cover = slideTexts[0] || {};
    const allText = slideTexts
      .map((st) => [st.kicker, st.title, st.highlight, st.body, ...(st.items || [])].filter(Boolean).join(" "))
      .join(" ");
    const figures = [...extractFigures(allText)];
    const terms = [
      cover.title,
      cover.highlight,
      cover.kicker,
      title,
      ...(source && source.sections["Puntos"]
        ? source.sections["Puntos"].slice(0, 3).map((x) => x.replace(/^-\s*/, ""))
        : []),
    ].filter(Boolean);
    const hooks = hookVariants(title, cover.highlight || figures[0], cover.kicker, tone);
    const hashtagBudget = { instagram: 8, linkedin: 5, x: 2, facebook: 6, tiktok: 8 };
    const includeHashtags = a.includeHashtags !== false;
    const captions = {};
    const hashtags = {};
    for (const p of platforms) {
      captions[p] = buildCaption(p, {
        title,
        dek: dek || meta.description || "",
        hooks,
        audience,
        cta: a.cta || "",
        tone,
        figures,
        category,
        slideCount: slides.length,
      });
      if (includeHashtags) {
        const max =
          Number.isFinite(a.maxHashtags) && a.maxHashtags > 0 ? Math.min(a.maxHashtags, 30) : hashtagBudget[p];
        hashtags[p] = buildHashtags(terms, category, kitName, max);
        if (hashtags[p].length && p !== "x") {
          captions[p] = captions[p] + "\n\n" + hashtags[p].join(" ");
        } else if (hashtags[p].length && p === "x") {
          captions[p] = (captions[p] + " " + hashtags[p].join(" ")).slice(0, 280);
        }
      } else {
        hashtags[p] = [];
      }
    }
    const altTexts = slideTexts.map((st, i) => ({
      slide: i + 1,
      template: slides[i] && slides[i].template,
      alt: altTextFor(slides[i] || {}, st, i),
      chars: altTextFor(slides[i] || {}, st, i).length,
    }));
    const result = {
      company,
      slug: name,
      title,
      language,
      tone,
      audience: audience || null,
      source: source
        ? { path: source.file, used: true }
        : { used: false, note: "Sin source.md — copy basado solo en slides/meta." },
      hooks,
      captions,
      hashtags,
      altTexts,
      figures: figures.slice(0, 8),
      charLimits: { instagram: 2200, linkedin: 3000, x: 280, facebook: 63206, tiktok: 2200 },
      notes: [
        "Copy generado con heurísticas locales (sin API). Revisá y ajustá tono/CTA a mano.",
        "altText ≤125 chars por accesibilidad; no repetir el título literal si la slide ya lo dice.",
        "Hashtags: recortá a los relevantes para tu audiencia antes de publicar.",
      ],
      nextSteps: [
        "Pick the platform caption and paste it into your scheduler/writing tool.",
        "Check altTexts against the real photos (PHOTO REVIEW PROTOCOL).",
        "To persist, pass save:true to write social.md.",
      ],
    };
    let savedPath = null;
    if (a.save === true) {
      const sf = path.join(record.dir, "social.md");
      const lines = [
        `# Social copy — ${title}`,
        "",
        `- company: ${company}`,
        `- slug: ${name}`,
        `- tone: ${tone}`,
        `- language: ${language}`,
        `- generatedAt: ${new Date().toISOString()}`,
        "",
        "## Hooks",
        "",
        ...hooks.map((h, i) => `${i + 1}. ${h}`),
        "",
        ...platforms.map((p) => `## Caption — ${p}\n\n${captions[p]}\n`),
        "## Hashtags",
        "",
        ...platforms.map((p) => `- ${p}: ${(hashtags[p] || []).join(" ") || "(ninguno)"}\n`),
        "## Alt texts",
        "",
        ...altTexts.map((x) => `- slide ${x.slide} (${x.template}): ${x.alt}`),
        "",
        "## Notas",
        "",
        ...result.notes.map((n) => `- ${n}`),
        "",
      ];
      fs.writeFileSync(sf, lines.join("\n"), "utf8");
      savedPath = sf;
      result.saved = sf;
    }
    void savedPath;
    return JSON.stringify(result, null, 2);
  },
};
