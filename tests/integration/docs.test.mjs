#!/usr/bin/env node
/**
 * Drift guards between code and docs: README tools table, versions and
 * manifest descriptions must match the registry (single source of truth).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SERVER_INFO, SERVER_INSTRUCTIONS } from "../../mcp/lib/const.mjs";
import { listToolsForRpc } from "../../mcp/registry.mjs";
import { EXPECTED_TOOL_COUNT, EXPECTED_TOOL_NAMES } from "../helpers/tools.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("README documents exactly the expected tools in its table", () => {
  const readme = read("README.md");
  const rows = [...readme.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]).filter((n) => n.includes("_"));
  assert.deepEqual(
    [...rows].sort(),
    [...EXPECTED_TOOL_NAMES].sort(),
    "README tools table rows must match tests/helpers/tools.mjs (add/remove the row there)",
  );
  assert.ok(readme.includes("twenty-two tools"), "README says twenty-two tools");
  assert.ok(!/\b(21|23) tools\b/.test(readme), "README has no stale tool count");
});

test("package.json, manifest.json and SERVER_INFO share one version", () => {
  const pkg = JSON.parse(read("package.json"));
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.version, pkg.version, "manifest.json version ≠ package.json");
  assert.equal(SERVER_INFO.version, pkg.version, "SERVER_INFO.version ≠ package.json");
});

test("manifest tools[] matches the registry names and descriptions", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const rpc = listToolsForRpc();
  assert.equal(manifest.tools.length, EXPECTED_TOOL_COUNT);
  assert.deepEqual(
    manifest.tools.map((t) => t.name).sort(),
    [...EXPECTED_TOOL_NAMES].sort(),
    "manifest tool names ≠ checklist",
  );
  for (const t of rpc) {
    const entry = manifest.tools.find((m) => m.name === t.name);
    assert.ok(entry, `manifest has ${t.name}`);
    // El manifest guarda la primera oración de la description (ver sync-manifest.mjs).
    const base = entry.description.replace(/…$/, "");
    assert.ok(
      t.description.startsWith(base),
      `${t.name} description drifted (run sync:manifest): ${entry.description}`,
    );
    assert.ok(entry.description.length > 20, `${t.name} description too short`);
  }
});

test("SERVER_INSTRUCTIONS points to the key tools and protocols", () => {
  for (const name of [
    "edit_slide",
    "set_slide_photo",
    "set_slide_bg",
    "set_carousel_meta",
    "validate_carousel",
    "render_preview",
    "export_pdf",
    "social_copy",
    "delete_carousel",
    "delete_brand_kit",
  ]) {
    assert.ok(SERVER_INSTRUCTIONS.includes(name), `SERVER_INSTRUCTIONS mentions ${name}`);
  }
  assert.ok(SERVER_INSTRUCTIONS.includes("PHOTO REVIEW PROTOCOL"));
  assert.ok(SERVER_INSTRUCTIONS.includes("NARRATIVE REVIEW PROTOCOL"));
});
