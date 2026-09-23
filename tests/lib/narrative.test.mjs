import { test } from "node:test";
import assert from "node:assert/strict";
import { boldifyData, extractFigures, lintSlideTexts, narrativeAudit, formatStyleWarnings } from "../../mcp/lib/narrative.mjs";

test("extractFigures finds currency and percent", () => {
  const figs = [...extractFigures("Subió 12,5% con US$ 3 millones y $ 450")];
  assert.ok(figs.some((f) => f.includes("%")));
  assert.ok(figs.some((f) => f.includes("us$")));
  assert.ok(figs.some((f) => f.includes("$ 450") || f.includes("$450")));
  const mag = [...extractFigures("suma 3 millones de pesos")];
  assert.ok(mag.some((f) => f.includes("millones")));
});

test("boldifyData wraps key figures and skips already-marked text", () => {
  assert.equal(boldifyData("Creció 42% en el año"), "Creció **42%** en el año");
  assert.equal(boldifyData("**42%** ya marcado"), "**42%** ya marcado");
  assert.equal(boldifyData("sin cifras"), "sin cifras");
});

test("narrativeAudit flags missing cover/cta and middle cta", () => {
  const slides = [
    { template: "fact", elements: [{ type: "stack", children: [{ type: "body", text: "hola" }] }] },
    { template: "cta", elements: [] },
    { template: "fact", elements: [] },
  ];
  const audit = narrativeAudit(slides, "Título");
  const rules = audit.flags.map((f) => f.rule);
  assert.ok(rules.includes("missing-cover"));
  assert.ok(rules.includes("cta-in-middle"));
  assert.equal(audit.ok, false);
});

test("narrativeAudit flags duplicate figures across slides", () => {
  const slides = [
    { template: "cover", elements: [{ type: "stack", children: [{ type: "body", text: "Portada con 42% crecimiento" }] }] },
    { template: "fact", elements: [{ type: "stack", children: [{ type: "body", text: "Otra vez el 42%" }] }] },
    { template: "cta", elements: [] },
  ];
  const audit = narrativeAudit(slides, "Portada 42%");
  assert.ok(audit.flags.some((f) => f.rule === "duplicate-figure" && f.figure.includes("42")));
});

test("lintSlideTexts catches em-dash, no-es contrast and AI clichés", () => {
  const slides = [
    {
      template: "cover",
      elements: [{ type: "stack", children: [
        { type: "body", text: "No es suerte, es método — funciona." },
        { type: "body", text: "En un mundo donde todo cambia, cabe destacar el logro." },
      ] }],
    },
  ];
  const warnings = lintSlideTexts(slides);
  assert.ok(warnings.length >= 2);
  const text = formatStyleWarnings(warnings);
  assert.ok(/raya|—/.test(text) || warnings.some((w) => w.rule === "em-dash"));
  assert.ok(/cliché|cliche|en un mundo/i.test(text) || warnings.some((w) => /cliche/.test(w.rule)));
});
