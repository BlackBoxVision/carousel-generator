import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpHome } from "../helpers/tmp-home.mjs";
import generate from "../../mcp/tools/generate_carousel.mjs";
import saveCarousel from "../../mcp/tools/save_carousel.mjs";
import loadCarousel from "../../mcp/tools/load_carousel.mjs";
import listCarousels from "../../mcp/tools/list_carousels.mjs";
import deleteCarousel from "../../mcp/tools/delete_carousel.mjs";
import editSlide from "../../mcp/tools/edit_slide.mjs";
import setSlideBg from "../../mcp/tools/set_slide_bg.mjs";
import setCarouselMeta from "../../mcp/tools/set_carousel_meta.mjs";
import validateCarousel from "../../mcp/tools/validate_carousel.mjs";
import reviewSlide from "../../mcp/tools/review_slide_images.mjs";
import saveKit from "../../mcp/tools/save_brand_kit.mjs";
import listKits from "../../mcp/tools/list_brand_kits.mjs";
import loadKit from "../../mcp/tools/load_brand_kit.mjs";
import socialCopy from "../../mcp/tools/social_copy.mjs";

const COMPANY = "testco";
let home;
let prevHome;

before(() => {
  home = tmpHome("tool-handlers-");
  prevHome = process.env.CAROUSEL_GENERATOR_HOME;
  process.env.CAROUSEL_GENERATOR_HOME = home.home;
});

after(() => {
  if (prevHome === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
  else process.env.CAROUSEL_GENERATOR_HOME = prevHome;
  home.cleanup();
});

const slides = () => [
  { template: "cover", titleWhite: "PORTADA", titleOrange: "TEST", paragraphs: ["Bajada de prueba con 42%."], open: false },
  { template: "fact", titleWhite: "DATO", titleOrange: "10%", paragraphs: ["Creció 10% en el periodo."] },
  { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Listo", text: "Todo bien." } },
];

describe("generate/save/load/list/delete carousel", () => {
  test("generate_carousel persists and returns paths", async () => {
    const out = await generate.handler({
      title: "Nota Test", company: COMPANY, carouselName: "nota-test",
      slides: slides(), open: false, persist: true,
      outputDir: path.join(home.home, "out"),
    });
    assert.ok(out.includes("nota-test"));
    const json = path.join(home.carouselDir, COMPANY, "nota-test", "carousel.json");
    assert.ok(fs.existsSync(json), "carousel.json exists");
    const stored = JSON.parse(fs.readFileSync(json, "utf8"));
    assert.equal(stored.version, 2);
    assert.equal(stored.slides.length, 3);
  });

  test("list_carousels finds the company", async () => {
    const out = await listCarousels.handler({});
    assert.ok(out.includes(COMPANY));
    assert.ok(out.includes("nota-test"));
  });

  test("load_carousel returns HTML path and hydrates", async () => {
    const out = await loadCarousel.handler({ company: COMPANY, name: "nota-test", open: false });
    assert.ok(out.includes("nota-test"));
  });

  test("save_carousel updates title via v2 payload", async () => {
    const out = await saveCarousel.handler({
      company: COMPANY, name: "nota-test",
      carousel: {
        version: 2, company: COMPANY, slug: "nota-test",
        meta: { title: "Nota Test Updated", format: "feed" },
        slides: [{ template: "cover", titleWhite: "NUEVO", titleOrange: "TITULO" }],
      },
      open: false,
    });
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "nota-test", "carousel.json"), "utf8"));
    assert.equal(stored.meta.title, "Nota Test Updated");
    assert.equal(stored.slides.length, 1);
    assert.ok(typeof out === "string");
  });

  test("save_carousel creates new carousel when company has no kit (kit fallback)", () => {
    const out = saveCarousel.handler({
      company: "no-kit-co", name: "fresh-import",
      carousel: {
        version: 2, company: "no-kit-co", slug: "fresh-import",
        meta: { title: "Fresh", format: "feed" },
        slides: [{ template: "cover", titleWhite: "NEW", titleOrange: "OK" }],
      },
      open: false,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.saved ? true : false, true);
    const json = path.join(home.carouselDir, "no-kit-co", "fresh-import", "carousel.json");
    assert.ok(fs.existsSync(json), "carousel.json created without company kit");
    const stored = JSON.parse(fs.readFileSync(json, "utf8"));
    assert.equal(stored.version, 2);
    assert.ok(stored.kit && stored.kit.colors, "kit resolved via fallback");
  });

  test("delete_carousel previews without confirm, deletes with confirm", async () => {
    const preview = await deleteCarousel.handler({ company: COMPANY, name: "nota-test" });
    const p = JSON.parse(preview);
    assert.equal(p.deleted, false);
    assert.ok(fs.existsSync(path.join(home.carouselDir, COMPANY, "nota-test", "carousel.json")));

    const done = await deleteCarousel.handler({ company: COMPANY, name: "nota-test", confirm: true });
    assert.ok(/eliminado/i.test(done));
    assert.ok(!fs.existsSync(path.join(home.carouselDir, COMPANY, "nota-test", "carousel.json")));
  });

  test("delete_carousel errors when missing", () => {
    assert.throws(() => deleteCarousel.handler({ company: COMPANY, name: "no-existe" }), /no existe/);
  });
});

describe("edit_slide", () => {
  before(async () => {
    await generate.handler({
      title: "Edit Test", company: COMPANY, carouselName: "edit-test",
      slides: slides(), open: false, persist: true,
      outputDir: path.join(home.home, "out"),
    });
  });

  test("update_text changes a block by blockType", async () => {
    const out = JSON.parse(await editSlide.handler({
      company: COMPANY, name: "edit-test", slide: 1, action: "update_text",
      payload: { blockType: "text", text: "PORTADA EDITADA" },
      open: false,
    }));
    assert.equal(out.action, "update_text");
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    const texts = [];
    const walk = (ns) => { for (const b of ns || []) { if (b.text) texts.push(b.text); if (b.children) walk(b.children); } };
    walk(stored.slides[0].elements);
    assert.ok(texts.includes("PORTADA EDITADA"));
  });

  test("move reorders slides", async () => {
    await editSlide.handler({ company: COMPONENT_SAFE(), name: "edit-test", action: "move", payload: { to: 3 }, open: false });
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides.length, 3);
    assert.equal(stored.slides[2].template, "cover");
  });

  test("duplicate and delete slides", async () => {
    await editSlide.handler({ company: COMPANY, name: "edit-test", action: "duplicate", slide: 1, open: false });
    let stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides.length, 4);
    await editSlide.handler({ company: COMPANY, name: "edit-test", action: "delete", slide: 2, open: false });
    stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides.length, 3);
  });

  test("rejects invalid action and missing payload.text", async () => {
    await assert.rejects(() => editSlide.handler({ company: COMPANY, name: "edit-test", action: "nope" }), /action/);
    await assert.rejects(() => editSlide.handler({
      company: COMPANY, name: "edit-test", action: "update_text", payload: { blockType: "text" },
    }), /payload\.text/);
  });

  test("add inserts a new blank slide with template", async () => {
    const before = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    const n0 = before.slides.length;
    const out = JSON.parse(await editSlide.handler({
      company: COMPONENT_SAFE(), name: "edit-test", action: "add",
      payload: { template: "fact" }, open: false,
    }));
    assert.equal(out.action, "add");
    assert.equal(out.slides, n0 + 1);
    assert.equal(out.template, "fact");
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides.length, n0 + 1);
    assert.equal(stored.slides[stored.slides.length - 1].template, "fact");
  });

  test("add rejects unknown template", async () => {
    await assert.rejects(() => editSlide.handler({
      company: COMPANY, name: "edit-test", action: "add", payload: { template: "nope" },
    }), /template/);
  });
});

function COMPONENT_SAFE() { return COMPANY; }

describe("review_slide_images", () => {
  test("returns slides with photoNeeds for photo-less slides", async () => {
    const out = JSON.parse(await reviewSlide.handler({ company: COMPANY, name: "edit-test" }));
    assert.equal(out.company, COMPANY);
    assert.ok(Array.isArray(out.slides));
    assert.ok(out.slides.length >= 3);
    assert.ok(Array.isArray(out.photoNeeds));
    assert.ok(out.photoNeeds.length >= 1);
    assert.ok(out.protocol.includes("PHOTO"));
    assert.ok(out.narrativeAudit && "flags" in out.narrativeAudit);
  });
});

describe("brand kits", () => {
  test("save/list/load kit roundtrip", async () => {
    const saved = await saveKit.handler({
      name: "testbrand",
      kit: { name: "Test Brand", colors: { primary: "#ff5a00" } },
    });
    assert.ok(saved.includes("testbrand"));
    const list = await listKits.handler({});
    assert.ok(list.includes("testbrand"));
    const kit = JSON.parse(await loadKit.handler({ name: "testbrand" }));
    assert.equal(kit.colors.primary, "#ff5a00");
    assert.equal(kit.name, "Test Brand");
  });

  test("load_kit errors for unknown kit", () => {
    assert.throws(() => loadKit.handler({ name: "no-kit-here" }), /no existe/);
  });
});

describe("social_copy", () => {
  test("generates captions, hooks and altTexts for persisted carousel", async () => {
    const out = JSON.parse(await socialCopy.handler({
      company: COMPANY, name: "edit-test", tone: "directo",
    }));
    assert.ok(out.captions.instagram);
    assert.ok(out.captions.linkedin);
    assert.ok(out.hooks.length > 0);
    assert.ok(out.altTexts.every((a) => a.chars <= 125));
    assert.ok(out.altTexts.length >= 3);
  });
});

describe("set_slide_bg", () => {
  test("applies gradient from kit", async () => {
    const out = await setSlideBg.handler({
      company: COMPANY, name: "edit-test", slide: 1, mode: "gradient", gradient: "navy",
      open: false,
    });
    assert.ok(out.includes("gradient"));
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides[0].bg.type, "gradient");
    assert.equal(stored.slides[0].bg.value, "navy");
  });

  test("applies custom css", async () => {
    await setSlideBg.handler({
      company: COMPONENT_SAFE(), name: "edit-test", slide: 2, mode: "css",
      css: "linear-gradient(135deg,#111,#333)", open: false,
    });
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides[1].bg.type, "css");
    assert.ok(stored.slides[1].bg.css.includes("linear-gradient"));
  });

  test("remove resets to first kit gradient", async () => {
    await setSlideBg.handler({
      company: COMPANY, name: "edit-test", slide: 1, mode: "remove", open: false,
    });
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.slides[0].bg.type, "gradient");
  });

  test("rejects unknown gradient and missing mode fields", () => {
    assert.throws(() => setSlideBg.handler({
      company: COMPANY, name: "edit-test", mode: "gradient", gradient: "nope",
    }), /Gradiente/);
    assert.throws(() => setSlideBg.handler({
      company: COMPANY, name: "edit-test", mode: "gradient",
    }), /Falta `gradient`/);
    assert.throws(() => setSlideBg.handler({
      company: COMPANY, name: "edit-test", mode: "css",
    }), /Falta `css`/);
  });
});

describe("set_carousel_meta", () => {
  test("updates title, format, category and showCount", async () => {
    const out = await setCarouselMeta.handler({
      company: COMPANY, name: "edit-test",
      title: "Meta Test", format: "square", category: "demo", showCount: false,
      open: false,
    });
    assert.ok(out.includes("square"));
    const stored = JSON.parse(fs.readFileSync(path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json"), "utf8"));
    assert.equal(stored.meta.title, "Meta Test");
    assert.equal(stored.meta.format, "square");
    assert.equal(stored.meta.canvas.w, 1080);
    assert.equal(stored.meta.canvas.h, 1080);
    assert.equal(stored.meta.category, "demo");
    assert.equal(stored.meta.showCount, false);
  });

  test("rejects when no field provided and invalid format", () => {
    assert.throws(() => setCarouselMeta.handler({ company: COMPANY, name: "edit-test" }), /title \| format/);
    assert.throws(() => setCarouselMeta.handler({
      company: COMPANY, name: "edit-test", format: "hd",
    }), /feed, square, story/);
  });
});

describe("validate_carousel", () => {
  test("dry-run audit on persisted carousel without writing", async () => {
    const jsonPath = path.join(home.carouselDir, COMPANY, "edit-test", "carousel.json");
    const before = fs.readFileSync(jsonPath, "utf8");
    const out = JSON.parse(await validateCarousel.handler({ company: COMPANY, name: "edit-test" }));
    assert.equal(typeof out.ok, "boolean");
    assert.ok(Array.isArray(out.styleWarnings));
    assert.ok(out.narrativeAudit && "flags" in out.narrativeAudit);
    assert.ok(out.protocol.includes("NARRATIVE"));
    assert.equal(fs.readFileSync(jsonPath, "utf8"), before, "validate must not write");
  });

  test("accepts loose slides for dry-run without company", async () => {
    const out = JSON.parse(await validateCarousel.handler({
      slides: [
        { template: "cover", titleWhite: "HOLA", titleOrange: "MUNDO" },
        { template: "cta", titleWhite: "FIN", titleOrange: "OK" },
      ],
      title: "Dry Run",
    }));
    assert.equal(out.slides, 2);
    assert.equal(out.title, "Dry Run");
    assert.ok(Array.isArray(out.narrativeAudit.flags));
  });

  test("rejects empty input", () => {
    assert.throws(() => validateCarousel.handler({}), /company|slides/);
    assert.throws(() => validateCarousel.handler({ slides: [] }), /No hay slides/);
  });
});
