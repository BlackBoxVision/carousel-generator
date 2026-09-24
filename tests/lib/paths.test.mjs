import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { brandDir, carouselDir, carouselPath, homeDir } from "../../mcp/lib/paths.mjs";
import { tmpHome } from "../helpers/tmp-home.mjs";

test("CAROUSEL_GENERATOR_HOME redirects homeDir/brandDir/carouselDir", () => {
  const t = tmpHome("paths-home-");
  const prev = process.env.CAROUSEL_GENERATOR_HOME;
  try {
    process.env.CAROUSEL_GENERATOR_HOME = t.home;
    assert.equal(homeDir(), t.home);
    assert.equal(brandDir(), t.brandDir);
    assert.equal(carouselDir(), t.carouselDir);
    assert.equal(carouselPath("Acme", "Mi Nota"), path.join(t.carouselDir, "acme", "mi-nota"));
  } finally {
    if (prev === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
    else process.env.CAROUSEL_GENERATOR_HOME = prev;
    t.cleanup();
  }
});

test("falls back to ~/.carousel-generator when env unset", () => {
  const prev = process.env.CAROUSEL_GENERATOR_HOME;
  try {
    delete process.env.CAROUSEL_GENERATOR_HOME;
    assert.ok(homeDir().endsWith(".carousel-generator"));
    assert.ok(!homeDir().startsWith("/tmp"));
  } finally {
    if (prev !== undefined) process.env.CAROUSEL_GENERATOR_HOME = prev;
  }
});
