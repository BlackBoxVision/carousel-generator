import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  decodeEntities,
  deepMerge,
  excerptText,
  expandHome,
  significantTokens,
  slug,
  stripMd,
} from "../../mcp/lib/text.mjs";

test("slug normalizes accents, spaces and trims", () => {
  assert.equal(slug("¡Hola Mundo!"), "hola-mundo");
  assert.equal(slug("  Café & Tostión  "), "cafe-tostion");
  assert.equal(slug(""), "carrusel");
  assert.equal(slug(null), "carrusel");
  assert.ok(slug("x".repeat(80)).length <= 50);
});

test("deepMerge nests objects and replaces arrays", () => {
  const out = deepMerge({ a: { b: 1, c: 2 }, list: [1] }, { a: { c: 3 }, list: [9, 9] });
  assert.deepEqual(out, { a: { b: 1, c: 3 }, list: [9, 9] });
  assert.equal(deepMerge({ a: 1 }, null).a, 1);
});

test("decodeEntities strips entities and collapses whitespace", () => {
  assert.equal(decodeEntities("  A&nbsp;&amp;&nbsp;B  "), "A & B");
  assert.equal(decodeEntities("&#39;quoted&#39;"), "'quoted'");
});

test("excerptText truncates with ellipsis", () => {
  const long = "p ".repeat(60);
  const out = excerptText(long);
  assert.ok(out.length <= 70);
  assert.ok(out.endsWith("…"));
  assert.equal(excerptText("corto"), "corto");
});

test("stripMd removes bold and highlight markers", () => {
  assert.equal(stripMd("**42%** ==clave=="), "42% clave");
});

test("significantTokens drops stopwords, short and pure-digit tokens", () => {
  const toks = significantTokens("El mercado de la tecnología creció 42% en 2024 con inversión fuerte");
  assert.ok(toks.includes("mercado"));
  assert.ok(toks.includes("tecnologia")); // accents stripped by NFD normalize
  assert.ok(!toks.includes("del"));
  assert.ok(!toks.includes("42%"));
  assert.ok(!toks.includes("2024"));
});

test("expandHome resolves leading ~", () => {
  assert.equal(expandHome("~/x"), path.join(os.homedir(), "x"));
  assert.equal(expandHome("/abs"), "/abs");
});
