import { test } from "node:test";
import assert from "node:assert/strict";
import { blockId, findBlockInSlide, normalizeBlock, partitionListSlides, walkBlocks } from "../../mcp/lib/blocks.mjs";

test("blockId is deterministic", () => {
  assert.equal(blockId("text", 0), "text-1");
  assert.equal(blockId(undefined, 2), "block-3");
});

test("normalizeBlock coerces unknown types to body and defaults style/pos", () => {
  const b = normalizeBlock({ type: "weird", text: 42 }, 1);
  assert.equal(b.type, "body");
  assert.equal(b.text, "42");
  assert.deepEqual(b.style, {});
  assert.equal(b.pos, null);
  assert.ok(b.id);
});

test("normalizeBlock maps children recursively", () => {
  const b = normalizeBlock({ type: "stack", children: [{ type: "kicker", text: "K" }] });
  assert.equal(b.children[0].type, "kicker");
  assert.equal(b.children[0].text, "K");
});

test("walkBlocks visits nested nodes and can stop with true", () => {
  const nodes = [{ type: "stack", children: [{ type: "kicker", text: "A" }, { type: "text", text: "B" }] }];
  const seen = [];
  walkBlocks(nodes, (b) => { seen.push(b.type); return false; });
  assert.deepEqual(seen, ["stack", "kicker", "text"]);
  const first = [];
  walkBlocks(nodes, (b) => { first.push(b.type); return b.type === "kicker"; });
  assert.deepEqual(first, ["stack", "kicker"]);
});

test("findBlockInSlide finds by blockId or first of blockType", () => {
  const slide = { elements: [{ type: "stack", children: [
    { id: "kicker-1", type: "kicker", text: "KICK" },
    { id: "text-1", type: "text", text: "TITLE" },
  ] }] };
  assert.equal(findBlockInSlide(slide, "text-1", "").text, "TITLE");
  assert.equal(findBlockInSlide(slide, "", "kicker").text, "KICK");
  assert.equal(findBlockInSlide(slide, "nope", "missing"), null);
});

test("partitionListSlides splits lists into chunks of MAX_LIST_ITEMS (3)", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ emoji: "✅", title: "Item " + (i + 1) }));
  const slides = [{ template: "list", items }];
  const out = partitionListSlides(slides);
  const listSlides = out.filter((s) => s.template === "list");
  assert.equal(listSlides.length, 3);
  for (const s of listSlides) assert.ok(s.items.length <= 3);
  assert.equal(listSlides.reduce((n, s) => n + s.items.length, 0), 7);
});
