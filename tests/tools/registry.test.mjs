import { test } from "node:test";
import assert from "node:assert/strict";
import { tools, getTool, listToolsForRpc, callTool } from "../../mcp/registry.mjs";

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

test("listToolsForRpc returns name/description/inputSchema only", () => {
  const rpc = listToolsForRpc();
  assert.equal(rpc.length, 22);
  for (const t of rpc) {
    assert.deepEqual(Object.keys(t).sort(), ["description", "inputSchema", "name"]);
  }
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
