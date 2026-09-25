import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import generate from "../../mcp/tools/generate_carousel.mjs";
import renderPreview from "../../mcp/tools/render_preview.mjs";
import { tmpHome } from "../helpers/tmp-home.mjs";

const COMPANY = "renderco";
const NAME = "render-test";
let home;
let prevHome;

before(() => {
  home = tmpHome("render-preview-");
  prevHome = process.env.CAROUSEL_GENERATOR_HOME;
  process.env.CAROUSEL_GENERATOR_HOME = home.home;
  return generate.handler({
    title: "Render Test",
    company: COMPANY,
    carouselName: NAME,
    slides: [
      { template: "cover", titleWhite: "PORTADA", titleOrange: "RENDER", paragraphs: ["Bajada."] },
      { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Listo", text: "Ok." } },
    ],
    open: false,
    persist: true,
    outputDir: path.join(home.home, "out"),
  });
});

after(() => {
  if (prevHome === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
  else process.env.CAROUSEL_GENERATOR_HOME = prevHome;
  home.cleanup();
});

describe("render_preview", () => {
  test("validates raw company and name before slug fallback", () => {
    assert.throws(() => renderPreview.handler({ name: NAME }), /Falta `company`/);
    assert.throws(() => renderPreview.handler({ company: COMPANY }), /Falta `name`\/`slug`/);
  });

  test("rejects an unknown carousel", () => {
    assert.throws(() => renderPreview.handler({ company: COMPANY, name: "nunca-existio" }), /no existe/);
  });

  test("rejects slides outside the carousel range", () => {
    assert.throws(
      () => renderPreview.handler({ company: COMPANY, name: NAME, slides: [99], open: false }),
      /fuera de rango/,
    );
  });

  test("renders slide 1 in feed format (or reports no-chrome deterministically)", () => {
    const outDir = path.join(home.home, "previews");
    const out = renderPreview.handler({
      company: COMPANY,
      name: NAME,
      format: "4:5",
      slides: [1],
      outputDir: outDir,
      open: false,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.preview.format, "feed", "4:5 alias maps to feed");
    assert.equal(parsed.preview.requested, 1);
    assert.ok(parsed.preview.htmlPath.endsWith(`${NAME}-preview.html`));
    if (parsed.preview.ok) {
      assert.equal(parsed.preview.count, 1);
      assert.equal(parsed.preview.pngs[0].slide, 1);
      const png = parsed.preview.pngs[0].path;
      assert.ok(fs.existsSync(png), "png rendered");
      assert.ok(fs.statSync(png).size > 0, "png not empty");
      assert.equal(parsed.preview.width, 1080);
      assert.equal(parsed.preview.height, 1350);
    } else {
      assert.equal(parsed.preview.reason, "no-chrome");
      assert.ok(fs.existsSync(parsed.preview.htmlPath), "html fallback still written");
    }
  });
});
