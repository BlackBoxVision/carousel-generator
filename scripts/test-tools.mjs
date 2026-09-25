#!/usr/bin/env node
/**
 * Smoke test for MCP tools via JSON-RPC over stdio.
 * Keeps stdin open until responses arrive (server exits on stdin close).
 * Usage: node scripts/test-tools.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_TOOL_COUNT, EXPECTED_TOOL_NAMES } from "../tests/helpers/tools.mjs";
import { contentText, rpc } from "./lib/jsonrpc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "mcp", "server.mjs");
const TMP_COMPANY = "smoketest";
// Isolated home by default so `npm test` never writes to the real ~/.carousel-generator.
// Export CAROUSEL_GENERATOR_HOME explicitly when you WANT to run against your own data.
const OWNS_HOME = !process.env.CAROUSEL_GENERATOR_HOME;
if (OWNS_HOME) process.env.CAROUSEL_GENERATOR_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "carousel-tools-test-"));
const HOME = process.env.CAROUSEL_GENERATOR_HOME;
const CAROUSELS = path.join(HOME, "carousels");
const BRAND = path.join(HOME, "brand");

let passed = 0;
const fails = [];
function assert(cond, label) {
  if (cond) {
    passed++;
    console.log("PASS", label);
  } else {
    fails.push(label);
    console.log("FAIL", label);
  }
}

async function main() {
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  };
  const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };
  const gen = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "generate_carousel",
      arguments: {
        title: "Smoke Tools",
        company: TMP_COMPANY,
        carouselName: "smoke-tools",
        slides: [
          { template: "cover", titleWhite: "SMOKE", titleOrange: "TEST", paragraphs: ["Verificación de tools MCP."] },
          { template: "fact", titleWhite: "DATO", titleOrange: "42%", paragraphs: ["Creció 42% interanual."] },
          { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Listo", text: "Todo verde." } },
        ],
        open: false,
        persist: true,
        outputDir: os.tmpdir(),
      },
    },
  };

  const phase1 = await rpc([init, list, gen], [1, 2, 3]);
  const tools = phase1.get(2).result.tools.map((t) => t.name);
  for (const name of EXPECTED_TOOL_NAMES) {
    assert(tools.includes(name), "tools/list has " + name);
  }
  assert(tools.length === EXPECTED_TOOL_COUNT, "tools/list has exactly " + EXPECTED_TOOL_COUNT + " tools");

  const genText = contentText(phase1.get(3));
  assert(/Smoke Tools|smoke-tools|smoke/.test(genText), "generate_carousel returns path");

  // edit_slide parity actions (same tool, happy paths for set_layout / blocks)
  const edLayout = {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "edit_slide",
      arguments: {
        company: TMP_COMPANY,
        name: "smoke-tools",
        slide: 1,
        action: "set_layout",
        payload: { align: { title: "center" }, copyPos: { anchor: "bottom", offset: 1 } },
        open: false,
      },
    },
  };
  const edBlock = {
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: {
      name: "edit_slide",
      arguments: {
        company: TMP_COMPANY,
        name: "smoke-tools",
        slide: 1,
        action: "add_block",
        payload: { type: "body", text: "Párrafo smoke parity" },
        open: false,
      },
    },
  };
  const phaseEd = await rpc([init, edLayout, edBlock], [20, 22]);
  const layOut = JSON.parse(contentText(phaseEd.get(20)));
  assert(layOut.action === "set_layout", "edit_slide set_layout");
  const blockOut = JSON.parse(contentText(phaseEd.get(22)));
  assert(blockOut.action === "add_block" && blockOut.blockId, "edit_slide add_block");

  const render = {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "render_preview", arguments: { company: TMP_COMPANY, name: "smoke-tools", format: "4:5" } },
  };
  const social = {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "social_copy",
      arguments: { company: TMP_COMPANY, name: "smoke-tools", tone: "directo", save: true },
    },
  };
  const phase2 = await rpc([init, render, social], [4, 5]);

  const rp = JSON.parse(contentText(phase2.get(4)));
  assert(rp.preview && rp.preview.ok === true, "render_preview ok");
  assert(rp.preview.count === 3, "render_preview 3 PNGs (got " + (rp.preview && rp.preview.count) + ")");
  assert(
    (rp.preview.pngs || []).every((p) => fs.existsSync(p.path) && p.bytes > 3000),
    "PNG files exist and non-tiny",
  );
  const rpShas = (rp.preview.pngs || []).map((p) =>
    crypto.createHash("sha256").update(fs.readFileSync(p.path)).digest("hex"),
  );
  assert(new Set(rpShas).size === rpShas.length, "PNGs are distinct (regression: shared-frame bug #2043)");
  const rpDims = (rp.preview.pngs || []).map((p) => {
    const b = fs.readFileSync(p.path);
    return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  });
  assert(
    rpDims.every((d) => d === `${rp.preview.width}x${rp.preview.height}`),
    `PNG dims = canvas (got ${rpDims.join(", ")}, expected ${rp.preview.width}x${rp.preview.height})`,
  );

  const sc = JSON.parse(contentText(phase2.get(5)));
  assert(sc.captions && sc.captions.instagram && sc.captions.linkedin, "social_copy captions IG+LI");
  assert(Array.isArray(sc.hooks) && sc.hooks.length > 0, "social_copy hooks");
  assert(Array.isArray(sc.altTexts) && sc.altTexts.every((a) => a.chars <= 125), "altTexts <= 125 chars");
  assert(sc.saved && fs.existsSync(sc.saved), "social.md saved");

  // import_editor_state roundtrip: mutate title via payload
  const impPayload = {
    action: "upsert",
    company: TMP_COMPANY,
    name: "smoke-tools",
    carousel: {
      version: 2,
      company: TMP_COMPANY,
      slug: "smoke-tools",
      meta: { title: "Smoke Tools Imported", format: "feed" },
      slides: [
        { template: "cover", titleWhite: "IMPORT", titleOrange: "OK" },
        { template: "fact", titleWhite: "FACT", titleOrange: "42%", paragraphs: ["Dato 42% del periodo."] },
        { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Cierre", text: "Fin." } },
      ],
    },
  };
  const imp = {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "import_editor_state", arguments: { payload: impPayload, open: false } },
  };
  const phase3 = await rpc([init, imp], [6]);
  const impText = contentText(phase3.get(6));
  assert(/imported/i.test(impText) || /"imported": true/.test(impText), "import_editor_state imported");

  // new gap tools: duplicate, export_pdf, delete_brand_kit, list filter
  const listF = {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "list_carousels", arguments: { company: TMP_COMPANY } },
  };
  const dup = {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: {
      name: "duplicate_carousel",
      arguments: { company: TMP_COMPANY, name: "smoke-tools", toName: "smoke-copy", open: false },
    },
  };
  const pdf = {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "export_pdf", arguments: { company: TMP_COMPANY, name: "smoke-tools", format: "4:5" } },
  };
  const saveDoomed = {
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "save_brand_kit",
      arguments: { name: "smoke-doomed", kit: { name: "Doomed", colors: { primary: "#111111" } } },
    },
  };
  const delKitPrev = {
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "delete_brand_kit", arguments: { name: "smoke-doomed" } },
  };
  const delKit = {
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "delete_brand_kit", arguments: { name: "smoke-doomed", confirm: true } },
  };
  const phase4 = await rpc([init, listF, dup, pdf, saveDoomed, delKitPrev, delKit], [7, 8, 9, 10, 11, 12]);

  const lf = JSON.parse(contentText(phase4.get(7)));
  assert(lf.company === TMP_COMPANY, "list_carousels company filter");
  assert(Array.isArray(lf.carousels) && lf.carousels.every((c) => c.company === TMP_COMPANY), "filtered carousels");

  const dupText = contentText(phase4.get(8));
  assert(dupText.includes("smoke-copy"), "duplicate_carousel target");
  assert(
    fs.existsSync(path.join(CAROUSELS, TMP_COMPANY, "smoke-copy", "carousel.json")),
    "duplicate carousel.json exists",
  );

  const pdfOut = JSON.parse(contentText(phase4.get(9)));
  assert(pdfOut.pdf && pdfOut.pdf.htmlPath, "export_pdf htmlPath");
  assert(fs.existsSync(pdfOut.pdf.htmlPath), "export_pdf HTML exists");
  assert(
    pdfOut.pdf.ok === true || ["no-chrome", "chrome-failed"].includes(pdfOut.pdf.reason),
    "export_pdf payload shape",
  );
  if (pdfOut.pdf.ok === true && pdfOut.pdf.pdfPath && fs.existsSync(pdfOut.pdf.pdfPath)) {
    const pdfTxt = fs.readFileSync(pdfOut.pdf.pdfPath).toString("latin1");
    const pageObjs = (pdfTxt.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    const counts = (pdfTxt.match(/\/Count\s+(\d+)/g) || []).map((s) => parseInt(s.split(/\s+/)[1], 10));
    assert(
      pageObjs === pdfOut.pdf.count || counts.includes(pdfOut.pdf.count),
      `export_pdf one page per slide (pages=${pageObjs}, counts=[${counts}], expected=${pdfOut.pdf.count})`,
    );
  }

  assert(/smoke-doomed/.test(contentText(phase4.get(10))), "save_brand_kit doomed");
  const prev = JSON.parse(contentText(phase4.get(11)));
  assert(prev.deleted === false, "delete_brand_kit preview");
  assert(/eliminado/i.test(contentText(phase4.get(12))), "delete_brand_kit confirm");
  assert(!fs.existsSync(path.join(BRAND, "smoke-doomed", "kit.json")), "kit folder removed");

  console.log("---");
  console.log(fails.length ? "FAILURES: " + fails.length + " -> " + fails.join(" | ") : "ALL PASS (" + passed + ")");
  // cleanup
  try {
    fs.rmSync(path.join(CAROUSELS, TMP_COMPANY), { recursive: true, force: true });
  } catch {}
  try {
    fs.rmSync(path.join(BRAND, "smoke-doomed"), { recursive: true, force: true });
  } catch {}
  if (OWNS_HOME) {
    try {
      fs.rmSync(HOME, { recursive: true, force: true });
    } catch {}
  }
  const html = path.join(os.tmpdir(), "smoketest-smoke-tools.html");
  try {
    if (fs.existsSync(html)) fs.unlinkSync(html);
  } catch {}
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
