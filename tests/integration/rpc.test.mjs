import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ROOT, INIT, call, contentText, rpc } from "../helpers/rpc.mjs";

describe("MCP JSON-RPC integration", () => {
  test("initialize + tools/list returns 22 tools", async () => {
    const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };
    const res = await rpc([INIT, list], [1, 2], { timeoutMs: 30000 });
    assert.equal(res.get(1).result.serverInfo.name, "carousel-generator");
    const tools = res.get(2).result.tools;
    assert.equal(tools.length, 22);
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("generate_carousel"));
    assert.ok(names.includes("render_preview"));
    assert.ok(names.includes("social_copy"));
    assert.ok(names.includes("duplicate_carousel"));
    assert.ok(names.includes("export_pdf"));
    assert.ok(names.includes("delete_brand_kit"));
    for (const t of tools) {
      assert.equal(t.inputSchema.type, "object");
      assert.ok(t.description);
    }
  });

  test("tools/call list_carousels returns content", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "rpc-home-"));
    try {
      const c = call(3, "list_carousels", {});
      const res = await rpc([INIT, c], [1, 3], { timeoutMs: 30000, env: { CAROUSEL_GENERATOR_HOME: home } });
      const text = contentText(res.get(3));
      assert.equal(typeof text, "string");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("tools/call unknown tool returns isError", async () => {
    const c = call(4, "does_not_exist", {});
    const res = await rpc([INIT, c], [1, 4], { timeoutMs: 30000 });
    assert.equal(res.get(4).result.isError, true);
    const text = (res.get(4).result.content || []).map((x) => x.text || "").join("\n");
    assert.match(text, /ERROR|desconocida|unknown/i);
  });

  test("tools/call invalid args returns isError with validation message", async () => {
    const c = call(7, "load_carousel", {}); // missing required company
    const res = await rpc([INIT, c], [1, 7], { timeoutMs: 30000 });
    assert.equal(res.get(7).result.isError, true);
    const text = (res.get(7).result.content || []).map((x) => x.text || "").join("\n");
    assert.match(text, /^ERROR: /);
    assert.match(text, /Falta company \(requerido\)/);
  });

  test("tools/call unknown property returns isError (strict additionalProperties)", async () => {
    const c = call(8, "list_carousels", { nope: true });
    const res = await rpc([INIT, c], [1, 8], { timeoutMs: 30000 });
    assert.equal(res.get(8).result.isError, true);
    const text = (res.get(8).result.content || []).map((x) => x.text || "").join("\n");
    assert.match(text, /Propiedad no permitida: nope/);
  });

  test("CAROUSEL_TOOL_LOG records ok:false for failing calls", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "rpc-log-"));
    const log = path.join(home, "calls.jsonl");
    try {
      const c = call(5, "load_carousel", { company: "none", name: "none" });
      await rpc([INIT, c], [1, 5], { timeoutMs: 30000, env: { CAROUSEL_GENERATOR_HOME: home, CAROUSEL_TOOL_LOG: log } });
      assert.ok(fs.existsSync(log), "tool log written");
      const lines = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      const entry = lines.find((l) => l.name === "load_carousel");
      assert.ok(entry, "entry for load_carousel");
      assert.equal(entry.ok, false);
      assert.ok(entry.error);
      assert.ok(Number.isFinite(entry.durationMs));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("CAROUSEL_TOOL_LOG records ok:true for succeeding calls", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "rpc-log-ok-"));
    const log = path.join(home, "calls.jsonl");
    try {
      const c = call(6, "list_brand_kits", {});
      await rpc([INIT, c], [1, 6], { timeoutMs: 30000, env: { CAROUSEL_GENERATOR_HOME: home, CAROUSEL_TOOL_LOG: log } });
      const lines = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      assert.ok(lines.some((l) => l.name === "list_brand_kits" && l.ok === true));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("manifest sync", () => {
  test("sync-manifest --check passes", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "sync-manifest.mjs"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /in sync/);
  });
});
