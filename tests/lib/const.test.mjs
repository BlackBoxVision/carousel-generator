import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { APP_PATH, SERVER_INFO, TEMPLATES, MAX_LIST_ITEMS, PHOTO_REVIEW_PROTOCOL, NARRATIVE_REVIEW_PROTOCOL, canvasForFormat } from "../../mcp/lib/const.mjs";

test("SERVER_INFO matches package version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_PATH, "..", "..", "package.json"), "utf8"));
  assert.equal(SERVER_INFO.name, "carousel-generator");
  assert.equal(SERVER_INFO.version, pkg.version);
});

test("TEMPLATES and MAX_LIST_ITEMS constants", () => {
  assert.deepEqual(TEMPLATES, ["cover", "fact", "map", "list", "cta"]);
  assert.equal(MAX_LIST_ITEMS, 3);
});

test("protocols are non-empty multi-line strings", () => {
  assert.ok(PHOTO_REVIEW_PROTOCOL.split("\n").length >= 3);
  assert.ok(NARRATIVE_REVIEW_PROTOCOL.split("\n").length >= 3);
  assert.match(PHOTO_REVIEW_PROTOCOL, /visión|vision|verify|re-audit/i);
});

test("canvasForFormat maps feed/square/story", () => {
  assert.deepEqual(canvasForFormat("feed"), { w: 1080, h: 1350 });
  assert.deepEqual(canvasForFormat("square"), { w: 1080, h: 1080 });
  assert.deepEqual(canvasForFormat("story"), { w: 1080, h: 1920 });
  assert.deepEqual(canvasForFormat("4:5"), { w: 1080, h: 1350 });
});

test("app editor template exists with data marker", () => {
  const html = fs.readFileSync(APP_PATH, "utf8");
  assert.ok(html.includes("<!--CAROUSEL_DATA-->"));
});
