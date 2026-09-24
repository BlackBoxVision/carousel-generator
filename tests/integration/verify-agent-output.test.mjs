#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
/**
 * Unit tests for scripts/verify-agent-output.mjs logic (spawned as CLI).
 */
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERIFIER = path.join(ROOT, "scripts", "verify-agent-output.mjs");

const EXPECTED = [
  "generate_carousel",
  "list_carousels",
  "load_carousel",
  "save_carousel",
  "delete_carousel",
  "duplicate_carousel",
  "export_pdf",
  "delete_brand_kit",
  "review_slide_images",
  "set_slide_photo",
  "edit_slide",
  "set_slide_bg",
  "set_carousel_meta",
  "validate_carousel",
  "save_brand_kit",
  "list_brand_kits",
  "load_brand_kit",
  "brand_kit_from_url",
  "carousel_from_url",
  "import_editor_state",
  "render_preview",
  "social_copy",
];

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "verify-home-"));
  const cdir = path.join(home, "carousels", "agent-e2e", "e2e-main");
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(
    path.join(cdir, "carousel.json"),
    JSON.stringify(
      {
        version: 2,
        company: "agent-e2e",
        slug: "e2e-main",
        meta: { title: "T", format: "feed" },
        slides: [{ id: "s1", template: "cover", elements: [] }],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(cdir, "social.md"), "# social\n");
  fs.writeFileSync(path.join(cdir, "source.md"), "# source\n");
  const kitDir = path.join(home, "brand", "agent-brand");
  fs.mkdirSync(kitDir, { recursive: true });
  fs.writeFileSync(path.join(kitDir, "kit.json"), JSON.stringify({ name: "X", colors: { primary: "#c45c26" } }));
  const prev = path.join(cdir, "previews", "feed");
  fs.mkdirSync(prev, { recursive: true });
  // PNG > 3KB (minimal valid-ish bytes)
  fs.writeFileSync(path.join(prev, "slide-01.png"), Buffer.alloc(4096, 7));
  return home;
}

function writeLog(dir, entries) {
  const file = path.join(dir, "calls.jsonl");
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return file;
}

test("verifier passes with full 22/22 coverage and artifacts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-ok-"));
  try {
    const home = makeHome();
    const log = writeLog(
      dir,
      EXPECTED.map((name, i) => ({ name, ok: true, durationMs: 10 + i, at: new Date().toISOString() })),
    );
    const r = spawnSync(process.execPath, [VERIFIER, "--log", log, "--home", home], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /coverage: 22\/22/);
    assert.match(r.stdout, /ALL CHECKS PASSED/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier fails when a tool is missing from the log", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-miss-"));
  try {
    const home = makeHome();
    const incomplete = EXPECTED.filter((n) => n !== "render_preview");
    const log = writeLog(
      dir,
      incomplete.map((name) => ({ name, ok: true, durationMs: 5, at: new Date().toISOString() })),
    );
    const r = spawnSync(process.execPath, [VERIFIER, "--log", log, "--home", home], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /render_preview/);
    assert.match(r.stdout, /coverage: 21\/22/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier fails when a tool only has ok:false calls", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-fail-"));
  try {
    const home = makeHome();
    const entries = EXPECTED.map((name) =>
      name === "generate_carousel"
        ? { name, ok: false, durationMs: 5, at: new Date().toISOString(), error: "boom" }
        : { name, ok: true, durationMs: 5, at: new Date().toISOString() },
    );
    const log = writeLog(dir, entries);
    const r = spawnSync(process.execPath, [VERIFIER, "--log", log, "--home", home], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /generate_carousel/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier fails when home missing carousel.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-empty-"));
  try {
    const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), "verify-empty-home-"));
    const log = writeLog(
      dir,
      EXPECTED.map((name) => ({ name, ok: true, durationMs: 1, at: new Date().toISOString() })),
    );
    const r = spawnSync(process.execPath, [VERIFIER, "--log", log, "--home", emptyHome], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /carousel\.json/);
    fs.rmSync(emptyHome, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier fails when log file missing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "verify-nolog-"));
  try {
    const r = spawnSync(process.execPath, [VERIFIER, "--log", path.join(home, "missing.jsonl"), "--home", home], {
      encoding: "utf8",
    });
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /tool log/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
