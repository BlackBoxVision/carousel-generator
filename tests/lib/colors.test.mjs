import assert from "node:assert/strict";
import { test } from "node:test";
import { hexLum, hexMix, hexNorm, hexRgb, isGray, rgbHex } from "../../mcp/lib/colors.mjs";

test("hexNorm normalizes 3-digit and adds #", () => {
  assert.equal(hexNorm("f0a"), "#ff00aa");
  assert.equal(hexNorm("#ABC"), "#aabbcc");
  assert.equal(hexNorm("abc"), "#aabbcc");
});

test("hexRgb/rgbHex roundtrip", () => {
  assert.deepEqual(hexRgb("#ff8800"), [255, 136, 0]);
  assert.equal(rgbHex(255, 136, 0), "#ff8800");
});

test("hexMix interpolates between colors", () => {
  assert.equal(hexMix("#000000", "#ffffff", 0), "#000000");
  assert.equal(hexMix("#000000", "#ffffff", 1), "#ffffff");
  const mid = hexMix("#000000", "#ffffff", 0.5);
  assert.ok(mid.toLowerCase() === "#808080" || mid.toLowerCase() === "#7f7f7f");
});

test("hexLum and isGray", () => {
  assert.ok(hexLum("#ffffff") > hexLum("#000000"));
  assert.equal(isGray("#888888"), true);
  assert.equal(isGray("#ff8800"), false);
});
