import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import generate from "../../mcp/tools/generate_carousel.mjs";
import setSlidePhoto from "../../mcp/tools/set_slide_photo.mjs";
import { tmpHome } from "../helpers/tmp-home.mjs";

const COMPANY = "photoco";
const NAME = "photo-test";
// JPEG mínimo (SOI + EOI): suficiente para copiar sin conversión.
const TINY_JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
let home;
let prevHome;
let photoFile;

before(() => {
  home = tmpHome("set-slide-photo-");
  prevHome = process.env.CAROUSEL_GENERATOR_HOME;
  process.env.CAROUSEL_GENERATOR_HOME = home.home;
  photoFile = path.join(home.home, "fuente.jpg");
  fs.writeFileSync(photoFile, TINY_JPG);
  return generate.handler({
    title: "Photo Test",
    company: COMPANY,
    carouselName: NAME,
    slides: [
      { template: "cover", titleWhite: "PORTADA", titleOrange: "TEST", paragraphs: ["Bajada."] },
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

const carouselFile = () => path.join(home.carouselDir, COMPANY, NAME, "carousel.json");

describe("set_slide_photo", () => {
  test("copies a local file into assets and persists bg", async () => {
    const out = await setSlidePhoto.handler({
      company: COMPANY,
      name: NAME,
      slide: 1,
      source: photoFile,
      scrim: 55,
      bgPos: "center 30%",
      open: false,
      outputDir: path.join(home.home, "out"),
    });
    assert.ok(out.includes("Foto actualizada en slide 1"));
    const stored = JSON.parse(fs.readFileSync(carouselFile(), "utf8"));
    const bg = stored.slides[0].bg;
    assert.equal(bg.type, "photo");
    assert.match(bg.asset, /^assets\/slide-1-background\.jpg$/);
    assert.equal(bg.scrim, 55);
    assert.equal(bg.bgPos, "center 30%");
    const copied = path.join(home.carouselDir, COMPANY, NAME, bg.asset);
    assert.ok(fs.existsSync(copied), "asset copied");
    assert.deepEqual([...fs.readFileSync(copied)], [...TINY_JPG]);
    const dir = path.join(home.carouselDir, COMPANY, NAME);
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")),
      [],
      "no .tmp leftovers",
    );
    assert.ok(
      stored.assets.some((a) => a.file === bg.asset),
      "manifest lists the asset",
    );
  });

  test("file: prefix and ~ paths are accepted", async () => {
    const out = await setSlidePhoto.handler({
      company: COMPANY,
      name: NAME,
      slide: 2,
      source: `file:${photoFile}`,
      open: false,
    });
    assert.ok(out.includes("Foto actualizada en slide 2"));
  });

  test("rejects a source outside the allowed folders", async () => {
    await assert.rejects(
      () => setSlidePhoto.handler({ company: COMPANY, name: NAME, slide: 1, source: "/etc/hosts" }),
      /fuera de las carpetas permitidas/,
    );
  });

  test("rejects a missing local file", async () => {
    await assert.rejects(
      () => setSlidePhoto.handler({ company: COMPANY, name: NAME, slide: 1, source: `${home.home}/no-existe.jpg` }),
      /Archivo no encontrado/,
    );
  });

  test("rejects invalid or out-of-range slides", async () => {
    await assert.rejects(
      () => setSlidePhoto.handler({ company: COMPANY, name: NAME, slide: 0, source: photoFile }),
      /entero >= 1/,
    );
    await assert.rejects(
      () => setSlidePhoto.handler({ company: COMPANY, name: NAME, slide: 99, source: photoFile }),
      /inexistente/,
    );
  });

  test("requires company, name and source", async () => {
    await assert.rejects(() => setSlidePhoto.handler({ name: NAME, source: photoFile }), /Falta `company`/);
    await assert.rejects(() => setSlidePhoto.handler({ company: COMPANY, source: photoFile }), /Falta `name`/);
    await assert.rejects(() => setSlidePhoto.handler({ company: COMPANY, name: NAME }), /Falta `source`/);
  });

  test("rejects an unknown carousel", async () => {
    await assert.rejects(
      () => setSlidePhoto.handler({ company: COMPANY, name: "nunca-existio", source: photoFile }),
      /no existe/,
    );
  });
});
