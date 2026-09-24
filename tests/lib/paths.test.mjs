import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  assertPathAllowed,
  brandDir,
  carouselDir,
  carouselPath,
  homeDir,
  isPathAllowed,
} from "../../mcp/lib/paths.mjs";
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

test("isPathAllowed: home, tmp y CAROUSEL_GENERATOR_HOME si; sistemas no", () => {
  assert.equal(isPathAllowed(path.join(os.homedir(), "Downloads", "x.html")), true);
  assert.equal(isPathAllowed(path.join(os.tmpdir(), "a", "b.png")), true);
  assert.equal(isPathAllowed("/tmp/agent-home/x.html"), true);
  assert.equal(isPathAllowed("/etc/passwd"), false);
  assert.equal(isPathAllowed("/var/root/secret.png"), false);
  const t = tmpHome("paths-allowed-");
  const prev = process.env.CAROUSEL_GENERATOR_HOME;
  try {
    process.env.CAROUSEL_GENERATOR_HOME = t.home;
    assert.equal(isPathAllowed(path.join(t.home, "carousels", "a", "b.json")), true);
  } finally {
    if (prev === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
    else process.env.CAROUSEL_GENERATOR_HOME = prev;
    t.cleanup();
  }
});

test("assertPathAllowed lanza en español y se saltea con CAROUSEL_GENERATOR_ALLOW_LOCAL", () => {
  const prev = process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
  try {
    delete process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
    assert.throws(() => assertPathAllowed("/etc/passwd", "source"), /fuera de las carpetas permitidas/);
    assert.throws(() => assertPathAllowed("/etc/passwd", "source"), /CAROUSEL_GENERATOR_ALLOW_LOCAL/);
    process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL = "1";
    assert.equal(assertPathAllowed("/etc/passwd"), "/etc/passwd");
  } finally {
    if (prev === undefined) delete process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
    else process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL = prev;
  }
});
