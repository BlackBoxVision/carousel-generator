import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import importEditorState from "../../mcp/tools/import_editor_state.mjs";
import { tmpHome } from "../helpers/tmp-home.mjs";

const COMPANY = "pushco";
// PNG 1x1 mínimo como data URL (para probar la migración a assets/).
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let home;
let prevHome;

before(() => {
  home = tmpHome("import-editor-");
  prevHome = process.env.CAROUSEL_GENERATOR_HOME;
  process.env.CAROUSEL_GENERATOR_HOME = home.home;
});

after(() => {
  if (prevHome === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
  else process.env.CAROUSEL_GENERATOR_HOME = prevHome;
  home.cleanup();
});

function carouselV2(extra = {}) {
  return {
    version: 2,
    company: COMPANY,
    slug: "push-test",
    meta: { title: "Push Test", format: "feed" },
    slides: [{ template: "cover", titleWhite: "HOLA", titleOrange: "MUNDO" }],
    ...extra,
  };
}

const storedOf = (company, name) =>
  JSON.parse(fs.readFileSync(path.join(home.carouselDir, company, name, "carousel.json"), "utf8"));

describe("import_editor_state", () => {
  test("upserts from top-level company/name/carousel", async () => {
    const out = await importEditorState.handler({
      company: COMPANY,
      name: "push-test",
      carousel: carouselV2(),
      open: false,
    });
    assert.ok(out.includes("importado") || out.includes("saved") || typeof out === "string");
    const stored = storedOf(COMPANY, "push-test");
    assert.equal(stored.version, 2);
    assert.equal(stored.meta.title, "Push Test");
    assert.equal(stored.slides.length, 1);
  });

  test("moves base64 photo into assets/ and never persists it in carousel.json", async () => {
    await importEditorState.handler({
      company: COMPANY,
      name: "push-assets",
      carousel: carouselV2({
        slug: "push-assets",
        slides: [
          {
            template: "cover",
            titleWhite: "FOTO",
            titleOrange: "PUSH",
            bg: { type: "photo", src: `data:image/png;base64,${PNG_B64}`, scrim: 40 },
          },
        ],
      }),
      open: false,
    });
    const dir = path.join(home.carouselDir, COMPANY, "push-assets");
    const raw = fs.readFileSync(path.join(dir, "carousel.json"), "utf8");
    assert.ok(!raw.includes("base64,"), "no base64 left in carousel.json");
    const stored = JSON.parse(raw);
    const bg = stored.slides[0].bg;
    assert.match(bg.asset, /^assets\/slide-1-background\.png$/);
    assert.ok(fs.existsSync(path.join(dir, bg.asset)), "asset copied");
    assert.ok(
      stored.assets.some((a) => a.file === bg.asset),
      "manifest entry",
    );
    assert.equal(bg.scrim, 40, "scrim lifted onto bg");
  });

  test("accepts a payload string with action wrapper (client that truncates nested args)", async () => {
    await importEditorState.handler({
      payload: JSON.stringify({
        action: "upsert",
        company: COMPANY,
        name: "from-payload",
        carousel: carouselV2({ slug: "from-payload", meta: { title: "Desde Payload", format: "feed" } }),
      }),
      open: false,
    });
    assert.equal(storedOf(COMPANY, "from-payload").meta.title, "Desde Payload");
  });

  test("rejects an unparseable payload string", async () => {
    await assert.rejects(() => importEditorState.handler({ payload: "{ no es json" }), /No se pudo parsear/);
  });

  test("rejects a payload without editor state", async () => {
    await assert.rejects(
      () => importEditorState.handler({ payload: JSON.stringify({ action: "upsert" }) }),
      /Falta el estado/,
    );
    await assert.rejects(() => importEditorState.handler({}), /Falta el estado/);
  });

  test("propagates save_carousel validation errors", async () => {
    await assert.rejects(
      () =>
        importEditorState.handler({
          company: COMPANY,
          name: "bad-import",
          carousel: { version: 2, slides: { nope: true } },
          open: false,
        }),
      /debe ser un array/,
    );
  });
});
