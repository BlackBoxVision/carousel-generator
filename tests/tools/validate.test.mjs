import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tools, callTool, validateArgs, getTool } from "../../mcp/registry.mjs";
import { compileValidators, makeValidator } from "../../mcp/lib/validate.mjs";

describe("ajv validators compile for all 22 tools", () => {
  test("compileValidators builds a validator per tool without throwing", () => {
    const map = compileValidators(tools);
    assert.equal(map.size, 22);
    for (const t of tools) assert.equal(typeof map.get(t.name), "function", t.name);
  });

  test("makeValidator exposes validateArgs for known and unknown tools", () => {
    const v = makeValidator(tools);
    assert.equal(v("list_brand_kits", {}), true);
    assert.throws(() => v("nope", {}), /Herramienta desconocida/);
  });
});

describe("required fields", () => {
  test("load_carousel without company rejects", () => {
    assert.throws(() => validateArgs("load_carousel", {}), /Falta company \(requerido\)/);
  });

  test("edit_slide without action rejects", () => {
    assert.throws(
      () => validateArgs("edit_slide", { company: "c", name: "n" }),
      /Falta action \(requerido\)/
    );
  });

  test("set_slide_photo without source rejects", () => {
    assert.throws(
      () => validateArgs("set_slide_photo", { company: "c", name: "n" }),
      /Falta source \(requerido\)/
    );
  });

  test("save_brand_kit without kit rejects", () => {
    assert.throws(
      () => validateArgs("save_brand_kit", { name: "k" }),
      /Falta kit \(requerido\)/
    );
  });
});

describe("types", () => {
  test("render_preview slides must be array", () => {
    assert.throws(
      () => validateArgs("render_preview", { company: "c", name: "n", slides: "not-array" }),
      /`slides` debe ser array/
    );
  });

  test("social_copy maxHashtags must be number when present", () => {
    assert.throws(
      () => validateArgs("social_copy", { company: "c", name: "n", maxHashtags: "ten" }),
      /`maxHashtags` debe ser number/
    );
  });

  test("generate_carousel open must be boolean", () => {
    assert.throws(
      () => validateArgs("generate_carousel", { title: "t", open: "yes" }),
      /`open` debe ser boolean/
    );
  });
});

describe("enums", () => {
  test("generate_carousel format enum", () => {
    assert.throws(
      () => validateArgs("generate_carousel", { title: "t", format: "hd" }),
      /`format` debe ser uno de: feed, square, story/
    );
  });

  test("edit_slide action enum", () => {
    assert.throws(
      () => validateArgs("edit_slide", { company: "c", name: "n", action: "nope" }),
      /`action` debe ser uno de: update_text, move, duplicate, delete, add, split, set_layout/
    );
  });

  test("edit_slide accepts new parity actions", () => {
    for (const action of ["split", "set_layout", "add_block", "delete_block", "move_block", "set_block", "add_item", "delete_item", "add_pill", "update_pill", "delete_pill"]) {
      assert.equal(
        validateArgs("edit_slide", { company: "c", name: "n", action }),
        true,
        action
      );
    }
  });

  test("edit_slide top-level field alias validates as enum", () => {
    assert.throws(
      () => validateArgs("edit_slide", { company: "c", name: "n", action: "update_text", field: "nope" }),
      /`field` debe ser uno de/
    );
    assert.equal(
      validateArgs("edit_slide", { company: "c", name: "n", action: "update_text", field: "desc" }),
      true
    );
  });

  test("set_slide_bg mode enum", () => {
    assert.throws(
      () => validateArgs("set_slide_bg", { company: "c", name: "n", mode: "photo" }),
      /`mode` debe ser uno de: gradient, css, remove/
    );
  });

  test("set_carousel_meta format enum", () => {
    assert.throws(
      () => validateArgs("set_carousel_meta", { company: "c", name: "n", format: "hd" }),
      /`format` debe ser uno de: feed, square, story/
    );
  });

  test("set_slide_bg without mode rejects", () => {
    assert.throws(
      () => validateArgs("set_slide_bg", { company: "c", name: "n" }),
      /Falta mode \(requerido\)/
    );
  });

  test("export_pdf rejects unknown format alias after normalize is not enum-locked", () => {
    // format is free string at schema level (aliases like 4:5); bad values fall back in handler
    assert.equal(
      validateArgs("export_pdf", { company: "c", name: "n", format: "4:5" }),
      true
    );
  });

  test("delete_brand_kit without name rejects", () => {
    assert.throws(
      () => validateArgs("delete_brand_kit", {}),
      /Falta name \(requerido\)/
    );
  });
});

describe("strict additionalProperties", () => {
  test("unknown top-level key rejects on generate_carousel", () => {
    assert.throws(
      () => validateArgs("generate_carousel", { title: "t", totallyUnknown: 1 }),
      /Propiedad no permitida: totallyUnknown/
    );
  });

  test("unknown top-level key rejects on list_carousels", () => {
    assert.throws(
      () => validateArgs("list_carousels", { foo: 1 }),
      /Propiedad no permitida: foo/
    );
  });

  test("unknown nested key inside a slide rejects", () => {
    assert.throws(
      () =>
        validateArgs("generate_carousel", {
          title: "t",
          slides: [{ template: "cover", notASlideProp: true }],
        }),
      /Propiedad no permitida: notASlideProp/
    );
  });

  test("unknown key inside edit_slide payload rejects", () => {
    assert.throws(
      () =>
        validateArgs("edit_slide", {
          company: "c",
          name: "n",
          action: "update_text",
          payload: { text: "x", bogus: 1 },
        }),
      /Propiedad no permitida: bogus/
    );
  });
});

describe("bare freeform objects stay open", () => {
  test("save_carousel carousel bag accepts unknown keys", () => {
    assert.equal(
      validateArgs("save_carousel", {
        company: "c",
        name: "n",
        carousel: { version: 2, anyKey: "ok", nestedToo: { deep: true } },
        open: false,
      }),
      true
    );
  });

  test("save_brand_kit kit bag accepts unknown keys", () => {
    assert.equal(
      validateArgs("save_brand_kit", {
        name: "k",
        kit: { name: "Brand", whatever: 123, colors: { primary: "#fff" } },
      }),
      true
    );
  });

  test("import_editor_state carousel bag accepts unknown keys", () => {
    assert.equal(
      validateArgs("import_editor_state", {
        carousel: { version: 2, slug: "x", extraField: true },
        open: false,
      }),
      true
    );
  });
});

describe("valid real-world args pass", () => {
  test("generate_carousel with open:false (as used in e2e) passes validation", () => {
    assert.equal(
      validateArgs("generate_carousel", {
        title: "Smoke Tools",
        company: "smoketest",
        carouselName: "smoke-tools",
        slides: [
          { template: "cover", titleWhite: "SMOKE", titleOrange: "TEST", paragraphs: ["x"] },
        ],
        open: false,
        persist: true,
        outputDir: "/tmp",
      }),
      true
    );
  });

  test("save_carousel with open:false passes validation", () => {
    assert.equal(
      validateArgs("save_carousel", {
        company: "c",
        name: "n",
        carousel: { version: 2, meta: { title: "T" }, slides: [] },
        open: false,
      }),
      true
    );
  });

  test("callTool still runs handler for valid args (list_brand_kits)", async () => {
    const out = await callTool("list_brand_kits", {});
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  });

  test("callTool rejects unknown tool before validation", async () => {
    await assert.rejects(() => callTool("does_not_exist", {}), /Herramienta desconocida/);
  });

  test("callTool rejects invalid args with validation message (not handler crash)", async () => {
    await assert.rejects(
      () => callTool("load_carousel", {}),
      /Falta company \(requerido\)/
    );
  });
});

describe("published inputSchema keeps additionalProperties absent (except open fixes)", () => {
  test("root schemas do not expose additionalProperties: false to tools/list", () => {
    for (const t of tools) {
      // we intentionally do NOT publish the strict keyword — runtime only
      // (unless a future decision changes this)
      const has = "additionalProperties" in t.inputSchema;
      // bare roots may or may not have it; assert we didn't mass-mutate:
      if (has) {
        // only acceptable if it was always there — currently none should be
        assert.fail(`${t.name} root unexpectedly exposes additionalProperties`);
      }
    }
  });

  test("generate_carousel and save_carousel now declare open", () => {
    assert.ok(getTool("generate_carousel").inputSchema.properties.open);
    assert.equal(getTool("generate_carousel").inputSchema.properties.open.type, "boolean");
    assert.ok(getTool("save_carousel").inputSchema.properties.open);
    assert.equal(getTool("save_carousel").inputSchema.properties.open.type, "boolean");
  });
});
