import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tools } from "../../mcp/registry.mjs";

/**
 * Schema ↔ handler contract:
 * every `a.foo` / `args.foo` read in a tool handler must exist in inputSchema.properties,
 * and every `payload.foo` read must exist in inputSchema.properties.payload.properties.
 * Guards against ajv additionalProperties:false rejecting valid calls before the handler runs.
 */

function collectPropReads(src, rootRe) {
  const props = new Set();
  for (const m of src.matchAll(rootRe)) props.add(m[1]);
  return props;
}

function schemaHas(schema, prop) {
  return !!(schema && schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, prop));
}

function payloadHas(schema, prop) {
  const p = schema && schema.properties && schema.properties.payload;
  if (!p || !p.properties) return true; // no payload bag → nothing to check
  if (Object.prototype.hasOwnProperty.call(p.properties, prop)) return true;
  // freeform payload without properties → open
  if (!p.properties || Object.keys(p.properties).length === 0) return true;
  return false;
}

describe("schema-contract: handler property reads match inputSchema", () => {
  for (const tool of tools) {
    test(`${tool.name}: a.* / args.* reads declared in schema`, () => {
      const src = tool.handler.toString();
      const reads = collectPropReads(src, /\b(?:a|args)\.([A-Za-z_][\w]*)/g);
      const missing = [...reads].filter((p) => !schemaHas(tool.inputSchema, p));
      assert.deepEqual(
        missing,
        [],
        `${tool.name}: handler reads not in inputSchema.properties: ${missing.join(", ")}`
      );
    });

    test(`${tool.name}: payload.* reads declared in schema.payload`, () => {
      const src = tool.handler.toString();
      const reads = collectPropReads(src, /\bpayload\.([A-Za-z_][\w]*)/g);
      const missing = [...reads].filter((p) => !payloadHas(tool.inputSchema, p));
      assert.deepEqual(
        missing,
        [],
        `${tool.name}: handler reads not in inputSchema.properties.payload.properties: ${missing.join(", ")}`
      );
    });
  }
});

describe("schema-contract: known edit_slide aliases present", () => {
  test("edit_slide exposes top-level field alias used by handler", () => {
    const t = tools.find((x) => x.name === "edit_slide");
    assert.ok(t.inputSchema.properties.field, "top-level field");
    assert.ok(t.inputSchema.properties.payload.properties.field, "payload.field");
  });

  test("edit_slide action enum covers all handler branches", () => {
    const t = tools.find((x) => x.name === "edit_slide");
    const enumVals = t.inputSchema.properties.action.enum || [];
    const src = t.handler.toString();
    // every action: branch label should appear as a string in the handler
    for (const action of enumVals) {
      assert.ok(src.includes(`"${action}"`), `edit_slide handler missing branch for ${action}`);
    }
    assert.ok(enumVals.includes("split"));
    assert.ok(enumVals.includes("set_layout"));
    assert.ok(enumVals.includes("add_block"));
    assert.ok(enumVals.includes("delete_block"));
    assert.ok(enumVals.includes("move_block"));
    assert.ok(enumVals.includes("set_block"));
    assert.ok(enumVals.includes("add_item"));
    assert.ok(enumVals.includes("delete_item"));
    assert.ok(enumVals.includes("add_pill"));
    assert.ok(enumVals.includes("update_pill"));
    assert.ok(enumVals.includes("delete_pill"));
  });
});
