import assert from "node:assert/strict";
import { test } from "node:test";
import { callTool, getTool, listToolsForRpc, tools } from "../../mcp/registry.mjs";
import { EXPECTED_TOOL_NAMES as EXPECTED } from "../helpers/tools.mjs";

test("registry exposes exactly the 22 tools", () => {
  assert.equal(tools.length, 22);
  assert.deepEqual(tools.map((t) => t.name).sort(), [...EXPECTED].sort());
});

test("every tool has the {name, description, inputSchema, handler} contract", () => {
  for (const t of tools) {
    assert.equal(typeof t.name, "string", t.name + " name");
    assert.ok(t.description && t.description.length > 20, t.name + " description");
    assert.equal(t.inputSchema.type, "object", t.name + " schema type");
    assert.equal(typeof t.handler, "function", t.name + " handler");
    assert.ok(EXPECTED.includes(t.name), t.name + " is a known tool");
  }
});

test("listToolsForRpc returns name/description/inputSchema plus MCP annotations", () => {
  const rpc = listToolsForRpc();
  assert.equal(rpc.length, 22);
  for (const t of rpc) {
    assert.deepEqual(Object.keys(t).sort(), ["annotations", "description", "inputSchema", "name"]);
    const a = t.annotations;
    assert.equal(typeof a.readOnlyHint, "boolean", t.name + " readOnlyHint");
    assert.equal(typeof a.destructiveHint, "boolean", t.name + " destructiveHint");
    assert.equal(typeof a.idempotentHint, "boolean", t.name + " idempotentHint");
    assert.equal(typeof a.openWorldHint, "boolean", t.name + " openWorldHint");
    if (a.readOnlyHint) assert.equal(a.destructiveHint, false, t.name + " read-only must not be destructive");
  }
});

test("annotations flag exactly the destructive and open-world tools", () => {
  const rpc = new Map(listToolsForRpc().map((t) => [t.name, t.annotations]));
  for (const n of ["delete_carousel", "delete_brand_kit"]) {
    assert.equal(rpc.get(n).destructiveHint, true, n + " is destructive");
  }
  for (const n of ["brand_kit_from_url", "carousel_from_url", "set_slide_photo"]) {
    assert.equal(rpc.get(n).openWorldHint, true, n + " fetches URLs");
  }
  for (const n of [
    "list_carousels",
    "load_carousel",
    "validate_carousel",
    "review_slide_images",
    "list_brand_kits",
    "load_brand_kit",
  ]) {
    assert.equal(rpc.get(n).readOnlyHint, true, n + " is read-only");
  }
  assert.equal(rpc.get("edit_slide").readOnlyHint, false);
});

test("getTool finds by name and returns null for unknown", () => {
  assert.equal(getTool("generate_carousel").name, "generate_carousel");
  assert.equal(getTool("nope"), null);
});

test("callTool rejects unknown tool with Spanish error", async () => {
  await assert.rejects(() => callTool("nope", {}), /Herramienta desconocida/);
});

test("list_carousels handler works with isolated home", async () => {
  const { tmpHome } = await import("../helpers/tmp-home.mjs");
  const t = tmpHome("registry-list-");
  const prev = process.env.CAROUSEL_GENERATOR_HOME;
  try {
    process.env.CAROUSEL_GENERATOR_HOME = t.home;
    const out = await callTool("list_carousels", {});
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  } finally {
    if (prev === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
    else process.env.CAROUSEL_GENERATOR_HOME = prev;
    t.cleanup();
  }
});

test("list_brand_kits handler works with isolated home", async () => {
  const { tmpHome } = await import("../helpers/tmp-home.mjs");
  const t = tmpHome("registry-kits-");
  const prev = process.env.CAROUSEL_GENERATOR_HOME;
  try {
    process.env.CAROUSEL_GENERATOR_HOME = t.home;
    const out = await callTool("list_brand_kits", {});
    assert.equal(typeof out, "string");
  } finally {
    if (prev === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
    else process.env.CAROUSEL_GENERATOR_HOME = prev;
    t.cleanup();
  }
});
