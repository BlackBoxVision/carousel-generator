#!/usr/bin/env node
/**
 * Smoke test for MCP tools via JSON-RPC over stdio.
 * Keeps stdin open until responses arrive (server exits on stdin close).
 * Usage: node scripts/test-tools.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "mcp", "server.mjs");
const TMP_COMPANY = "smoketest";

function rpc(msgs, waitIds, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
    });
    let buf = "";
    let err = "";
    const results = new Map();
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error("timeout waiting for " + waitIds.join(",") + "\n" + err.slice(0, 500) + "\n" + buf.slice(0, 500)));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id != null) results.set(obj.id, obj);
        } catch {}
      }
      if (waitIds.every((id) => results.has(id))) {
        clearTimeout(timer);
        try { child.stdin.end(); } catch {}
        setTimeout(() => { try { child.kill(); } catch {} }, 50);
        resolve(results);
      }
    });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", () => {
      if (waitIds.every((id) => results.has(id))) {
        clearTimeout(timer);
        resolve(results);
      }
    });
    for (const m of msgs) child.stdin.write(JSON.stringify(m) + "\n");
  });
}

function contentText(res) {
  const r = res && res.result;
  if (!r) throw new Error("no result: " + JSON.stringify(res).slice(0, 300));
  if (r.isError) throw new Error("tool error: " + (r.content && r.content[0] && r.content[0].text || "").slice(0, 400));
  return (r.content || []).map((c) => c.text || "").join("\n");
}

let passed = 0;
const fails = [];
function assert(cond, label) {
  if (cond) { passed++; console.log("PASS", label); }
  else { fails.push(label); console.log("FAIL", label); }
}

async function main() {
  const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } };
  const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };
  const gen = {
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "generate_carousel", arguments: {
      title: "Smoke Tools", company: TMP_COMPANY, carouselName: "smoke-tools",
      slides: [
        { template: "cover", titleWhite: "SMOKE", titleOrange: "TEST", paragraphs: ["Verificación de tools MCP." ] },
        { template: "fact", titleWhite: "DATO", titleOrange: "42%", paragraphs: ["Creció 42% interanual." ] },
        { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Listo", text: "Todo verde." } },
      ],
      open: false, persist: true, outputDir: os.tmpdir(),
    } },
  };

  const phase1 = await rpc([init, list, gen], [1, 2, 3]);
  const tools = phase1.get(2).result.tools.map((t) => t.name);
  assert(tools.includes("render_preview"), "tools/list has render_preview");
  assert(tools.includes("social_copy"), "tools/list has social_copy");
  assert(tools.includes("import_editor_state"), "tools/list has import_editor_state");
  assert(tools.includes("set_slide_bg"), "tools/list has set_slide_bg");
  assert(tools.includes("set_carousel_meta"), "tools/list has set_carousel_meta");
  assert(tools.includes("validate_carousel"), "tools/list has validate_carousel");
  assert(tools.includes("duplicate_carousel"), "tools/list has duplicate_carousel");
  assert(tools.includes("export_pdf"), "tools/list has export_pdf");
  assert(tools.includes("delete_brand_kit"), "tools/list has delete_brand_kit");
  assert(tools.length >= 22, "tools count >= 22 (got " + tools.length + ")");

  const genText = contentText(phase1.get(3));
  assert(/Smoke Tools|smoke-tools|smoke/.test(genText), "generate_carousel returns path");

  const render = { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "render_preview", arguments: { company: TMP_COMPANY, name: "smoke-tools", format: "4:5" } } };
  const social = { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "social_copy", arguments: { company: TMP_COMPANY, name: "smoke-tools", tone: "directo", save: true } } };
  const phase2 = await rpc([init, render, social], [4, 5]);

  const rp = JSON.parse(contentText(phase2.get(4)));
  assert(rp.preview && rp.preview.ok === true, "render_preview ok");
  assert(rp.preview.count === 3, "render_preview 3 PNGs (got " + (rp.preview && rp.preview.count) + ")");
  assert((rp.preview.pngs || []).every((p) => fs.existsSync(p.path) && p.bytes > 3000), "PNG files exist and non-tiny");

  const sc = JSON.parse(contentText(phase2.get(5)));
  assert(sc.captions && sc.captions.instagram && sc.captions.linkedin, "social_copy captions IG+LI");
  assert(Array.isArray(sc.hooks) && sc.hooks.length > 0, "social_copy hooks");
  assert(Array.isArray(sc.altTexts) && sc.altTexts.every((a) => a.chars <= 125), "altTexts <= 125 chars");
  assert(sc.saved && fs.existsSync(sc.saved), "social.md saved");

  // import_editor_state roundtrip: mutate title via payload
  const impPayload = {
    action: "upsert", company: TMP_COMPANY, name: "smoke-tools",
    carousel: {
      version: 2, company: TMP_COMPANY, slug: "smoke-tools",
      meta: { title: "Smoke Tools Imported", format: "feed" },
      slides: [{ template: "cover", titleWhite: "IMPORT", titleOrange: "OK" }],
    },
  };
  const imp = { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "import_editor_state", arguments: { payload: impPayload, open: false } } };
  const phase3 = await rpc([init, imp], [6]);
  const impText = contentText(phase3.get(6));
  assert(/imported/i.test(impText) || /"imported": true/.test(impText), "import_editor_state imported");

  // new gap tools: duplicate, export_pdf, delete_brand_kit, list filter
  const listF = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_carousels", arguments: { company: TMP_COMPANY } } };
  const dup = { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "duplicate_carousel", arguments: { company: TMP_COMPANY, name: "smoke-tools", toName: "smoke-copy", open: false } } };
  const pdf = { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "export_pdf", arguments: { company: TMP_COMPANY, name: "smoke-tools", format: "4:5" } } };
  const saveDoomed = { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "save_brand_kit", arguments: { name: "smoke-doomed", kit: { name: "Doomed", colors: { primary: "#111111" } } } } };
  const delKitPrev = { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "delete_brand_kit", arguments: { name: "smoke-doomed" } } };
  const delKit = { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "delete_brand_kit", arguments: { name: "smoke-doomed", confirm: true } } };
  const phase4 = await rpc([init, listF, dup, pdf, saveDoomed, delKitPrev, delKit], [7, 8, 9, 10, 11, 12]);

  const lf = JSON.parse(contentText(phase4.get(7)));
  assert(lf.company === TMP_COMPANY, "list_carousels company filter");
  assert(Array.isArray(lf.carousels) && lf.carousels.every((c) => c.company === TMP_COMPANY), "filtered carousels");

  const dupText = contentText(phase4.get(8));
  assert(dupText.includes("smoke-copy"), "duplicate_carousel target");
  assert(fs.existsSync(path.join(os.homedir(), ".carousel-generator", "carousels", TMP_COMPANY, "smoke-copy", "carousel.json")), "duplicate carousel.json exists");

  const pdfOut = JSON.parse(contentText(phase4.get(9)));
  assert(pdfOut.pdf && pdfOut.pdf.htmlPath, "export_pdf htmlPath");
  assert(fs.existsSync(pdfOut.pdf.htmlPath), "export_pdf HTML exists");
  assert(pdfOut.pdf.ok === true || ["no-chrome", "chrome-failed"].includes(pdfOut.pdf.reason), "export_pdf payload shape");

  assert(/smoke-doomed/.test(contentText(phase4.get(10))), "save_brand_kit doomed");
  const prev = JSON.parse(contentText(phase4.get(11)));
  assert(prev.deleted === false, "delete_brand_kit preview");
  assert(/eliminado/i.test(contentText(phase4.get(12))), "delete_brand_kit confirm");
  assert(!fs.existsSync(path.join(os.homedir(), ".carousel-generator", "brand", "smoke-doomed", "kit.json")), "kit folder removed");

  console.log("---");
  console.log(fails.length ? "FAILURES: " + fails.length + " -> " + fails.join(" | ") : "ALL PASS (" + passed + ")");
  // cleanup
  try {
    fs.rmSync(path.join(os.homedir(), ".carousel-generator", "carousels", TMP_COMPANY), { recursive: true, force: true });
  } catch {}
  try {
    fs.rmSync(path.join(os.homedir(), ".carousel-generator", "brand", "smoke-doomed"), { recursive: true, force: true });
  } catch {}
  const html = path.join(os.tmpdir(), "smoketest-smoke-tools.html");
  try { if (fs.existsSync(html)) fs.unlinkSync(html); } catch {}
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
