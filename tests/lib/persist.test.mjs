import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { pruneAssets, writeJsonAtomic } from "../../mcp/lib/fsutil.mjs";
import { carouselPath } from "../../mcp/lib/paths.mjs";
import { hydrateCarousel, persistCarousel, readCarousel } from "../../mcp/lib/persist.mjs";
import { tmpHome } from "../helpers/tmp-home.mjs";

const COMPANY = "persistco";
let home;
let prevHome;

before(() => {
  home = tmpHome("persist-");
  prevHome = process.env.CAROUSEL_GENERATOR_HOME;
  process.env.CAROUSEL_GENERATOR_HOME = home.home;
});

after(() => {
  if (prevHome === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
  else process.env.CAROUSEL_GENERATOR_HOME = prevHome;
  home.cleanup();
});

function baseData(extra = {}) {
  return {
    version: 2,
    kit: { name: "Default", colors: { primary: "#0ea5e9" } },
    meta: { title: "Persist Test", format: "feed" },
    slides: [
      { id: "slide-1", template: "cover", text: "Hola", bg: { type: "gradient", value: "navy" } },
      { id: "slide-2", template: "cta", text: "Chau" },
    ],
    ...extra,
  };
}

test("persistCarousel writes carousel.json without temp leftovers", () => {
  const out = persistCarousel(baseData(), COMPANY, "roundtrip");
  assert.ok(fs.existsSync(out.file));
  const left = fs.readdirSync(out.dir).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(left, [], "no .tmp files");
  const stored = JSON.parse(fs.readFileSync(out.file, "utf8"));
  assert.equal(stored.version, 2);
  assert.equal(stored.company, "persistco");
  assert.equal(stored.slug, "roundtrip");
  assert.ok(Array.isArray(stored.assets));
  const reread = readCarousel(COMPANY, "roundtrip");
  assert.equal(reread.stored.meta.title, "Persist Test");
  assert.equal(reread.dir, carouselPath(COMPANY, "roundtrip"));
});

test("readCarousel reports missing, corrupt, invalid and oversized files in Spanish", () => {
  assert.throws(() => readCarousel(COMPANY, "nope"), /no existe/);

  const corruptDir = carouselPath(COMPANY, "corrupt");
  fs.mkdirSync(corruptDir, { recursive: true });
  fs.writeFileSync(path.join(corruptDir, "carousel.json"), "{ no es json");
  assert.throws(() => readCarousel(COMPANY, "corrupt"), /corrupto/);

  const invalidDir = carouselPath(COMPANY, "invalid");
  fs.mkdirSync(invalidDir, { recursive: true });
  fs.writeFileSync(path.join(invalidDir, "carousel.json"), JSON.stringify({ version: 2 }));
  assert.throws(() => readCarousel(COMPANY, "invalid"), /inválido/);

  const bigDir = carouselPath(COMPANY, "big");
  fs.mkdirSync(bigDir, { recursive: true });
  const fd = fs.openSync(path.join(bigDir, "carousel.json"), "w");
  fs.writeSync(fd, "x".repeat(33 * 1024 * 1024));
  fs.closeSync(fd);
  assert.throws(() => readCarousel(COMPANY, "big"), /demasiado grande/);
  fs.rmSync(bigDir, { recursive: true, force: true });
});

test("hydrateCarousel inlines assets and maps bg fields back onto the slide", () => {
  const data = baseData();
  const dir = carouselPath(COMPANY, "hydrate");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "slide-1-background.png"), Buffer.from([137, 80, 78, 71]));
  fs.writeFileSync(path.join(dir, "logo.png"), Buffer.from([137, 80, 78, 71]));
  data.slides[0].bg = {
    type: "photo",
    asset: "assets/slide-1-background.png",
    scrim: 55,
    bgPos: "center 30%",
    overlayLight: false,
  };
  data.kit.logo = { letter: "x", asset: "logo.png" };
  const out = hydrateCarousel(data, dir);
  assert.ok(out.slides[0].bg.src.startsWith("data:image/png;base64,"), "photo hydrated");
  assert.equal(out.slides[0].scrim, 55, "scrim lifted to slide level");
  assert.equal(out.slides[0].bgPos, "center 30%");
  assert.equal(out.slides[0].overlayLight, false);
  assert.ok(out.kit.logo.img.startsWith("data:image/png;base64,"), "logo hydrated");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("hydrateCarousel refuses assets that escape the carousel directory", () => {
  const dir = carouselPath(COMPANY, "escape");
  fs.mkdirSync(dir, { recursive: true });
  const outside = path.join(path.dirname(dir), "secret.png");
  fs.writeFileSync(outside, Buffer.from([137, 80, 78, 71]));
  try {
    const data = baseData();
    data.slides[0].bg = { type: "photo", asset: "../secret.png" };
    const out = hydrateCarousel(data, dir);
    assert.equal(out.slides[0].bg.src, undefined, "../ asset is not hydrated");
    assert.ok(fs.existsSync(outside), "outside file untouched");
  } finally {
    fs.rmSync(outside, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneAssets drops stale manifest entries and unreferenced images only", () => {
  const dir = carouselPath(COMPANY, "prune");
  const assetsDir = path.join(dir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, "source.md"), "fuente");
  fs.writeFileSync(path.join(assetsDir, "keep.png"), "keep");
  fs.writeFileSync(path.join(assetsDir, "orphan.png"), "orphan");
  const manifest = [
    { id: "keep", file: "assets/keep.png" },
    { id: "gone", file: "assets/gone.png" },
    { id: "escaped", file: "../secret.png" },
  ];
  const res = pruneAssets(dir, manifest);
  assert.deepEqual(
    manifest.map((m) => m.id),
    ["keep"],
  );
  assert.ok(res.dropped.includes("assets/gone.png"));
  assert.ok(res.dropped.includes("../secret.png"));
  assert.ok(res.removed.includes("orphan.png"));
  assert.ok(fs.existsSync(path.join(assetsDir, "keep.png")));
  assert.ok(!fs.existsSync(path.join(assetsDir, "orphan.png")));
  assert.ok(fs.existsSync(path.join(dir, "source.md")), "non-image files kept");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("writeJsonAtomic never leaves the target truncated on success", () => {
  const target = path.join(os.tmpdir(), `atomic-${process.pid}.json`);
  try {
    fs.writeFileSync(target, "old");
    writeJsonAtomic(target, { a: 1 });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), { a: 1 });
    const leftovers = fs
      .readdirSync(path.dirname(target))
      .filter((f) => f.includes(`.${path.basename(target)}.`) && f.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(target, { force: true });
  }
});
