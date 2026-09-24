import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectCategory,
  extractArticle,
  normalizeImageUrl,
  pickPhotoCandidates,
  splitTitleForCover,
} from "../../mcp/lib/article.mjs";

const HTML = `<!doctype html>
<html><head>
<title>Creció 42% el turismo en la Patagonia</title>
<meta property="og:site_name" content="El Diario">
<meta property="og:description" content="La temporada cerró con marcos históricos en Neuquén.">
</head>
<body>
<article>
<h1>Creció 42% el turismo en la Patagonia</h1>
<p>La temporada de invierno marcó un crecimiento del 42% respecto del año anterior en Neuquén y Bariloche.</p>
<p>El Ministerio de Turismo confirmó que la cifra incluye hotelería y servicios de montaña.</p>
<ul><li>Neuquén lideró con 500 mil visitantes</li><li>Bariloche sumó ofertas de esquí</li><li>Se crearon 2 mil puestos de trabajo</li></ul>
<img src="/img/turismo-patagonia.jpg" alt="Turismo">
<img src="/img/logo-diario.png" alt="logo">
</article>
</body></html>`;

test("extractArticle pulls title, dek, paras and items", () => {
  const art = extractArticle(HTML, "https://ejemplo.com/nota/turismo");
  assert.equal(art.title, "Creció 42% el turismo en la Patagonia");
  assert.ok(art.dek.includes("Patagonia") || art.dek.includes("Neuquén"));
  assert.ok(art.paras.length >= 2);
  assert.ok(art.items.length >= 3);
  assert.equal(art.site, "El Diario");
});

test("normalizeImageUrl resolves relative against page URL", () => {
  assert.equal(normalizeImageUrl("/img/a.jpg", "https://x.com/n/1"), "https://x.com/img/a.jpg");
  assert.equal(normalizeImageUrl("https://cdn.com/a.jpg", "https://x.com/"), "https://cdn.com/a.jpg");
  assert.equal(normalizeImageUrl("data:image/png;base64,AAA", "https://x.com/"), null);
});

test("pickPhotoCandidates skips logo-ish images", () => {
  const art = extractArticle(HTML, "https://ejemplo.com/nota/turismo");
  const cands = pickPhotoCandidates(art);
  assert.ok(cands.some((u) => u.includes("turismo-patagonia.jpg")));
  assert.ok(!cands.some((u) => u.includes("logo-diario.png")));
});

test("splitTitleForCover splits into white/orange halves", () => {
  const { white, orange } = splitTitleForCover("Creció 42% el turismo en la Patagonia");
  assert.ok(white.length > 0);
  assert.ok(orange.length > 0);
  assert.ok(/patagonia/i.test(white + " " + orange));
});

test("detectCategory returns a category or null", () => {
  const det = detectCategory(HTML);
  if (det) {
    assert.ok(typeof det.category === "string" && det.category.length > 0);
    assert.ok(det.source);
  }
});
