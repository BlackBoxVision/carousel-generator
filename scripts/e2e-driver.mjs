#!/usr/bin/env node
/**
 * Deterministic e2e driver: exercises ALL 22 tools over JSON-RPC (stdio),
 * with no LLM and no external network (a local fixture server serves the
 * two *_from_url tools).
 *
 * Invariants checked on every call:
 *  - the result parses as pure JSON (no prose + "---" handoff);
 *  - the tool-specific payload assertions below hold;
 *  - at the end every name in EXPECTED_TOOL_NAMES was called successfully.
 *
 * Chrome is optional: render_preview / export_pdf may answer reason
 * "no-chrome" and the driver still passes (real PNGs are covered by
 * scripts/test-tools.mjs in the tools-e2e CI job).
 *
 * Usage: node scripts/e2e-driver.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_TOOL_COUNT, EXPECTED_TOOL_NAMES } from "../tests/helpers/tools.mjs";
import { contentText, initMsg, rpc, textJson, toolCall } from "./lib/jsonrpc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FIXTURE = path.join(ROOT, "scripts", "fixture-server.mjs");
const FIXTURE_PORT = parseInt(process.env.FIXTURE_PORT || "8777", 10);
const BASE = `http://127.0.0.1:${FIXTURE_PORT}`;

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-driver-home-"));
const COMPANY = "driver";
const CAROUSEL = "driver-suite";
const TINY_JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

let passed = 0;
const fails = [];
const called = new Set();
function check(cond, label) {
  if (cond) {
    passed++;
    console.log("PASS", label);
  } else {
    fails.push(label);
    console.log("FAIL", label);
  }
}

async function startFixture() {
  const child = spawn(process.execPath, [FIXTURE, String(FIXTURE_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: ROOT,
  });
  let out = "";
  child.stdout.on("data", (d) => {
    out += d.toString();
  });
  for (let i = 0; i < 60; i++) {
    if (out.includes(`READY ${FIXTURE_PORT}`)) return child;
    if (child.exitCode != null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill("SIGKILL");
  throw new Error("fixture server did not become ready: " + out.slice(0, 200));
}

/**
 * Runs one tools/call in its own connection (state lives on disk), asserts
 * the result is parseable JSON, records coverage and returns the object.
 */
async function step(id, name, args, verify) {
  const res = await rpc([initMsg(1, "e2e-driver"), toolCall(id, name, args)], [1, id]);
  let obj = null;
  try {
    obj = textJson(res.get(id));
    check(true, `${name}: parseable JSON`);
  } catch (e) {
    check(false, `${name}: parseable JSON (${String(e.message).slice(0, 160)})`);
    return null;
  }
  called.add(name);
  if (verify) verify(obj, contentText(res.get(id)));
  return obj;
}

async function main() {
  process.env.CAROUSEL_GENERATOR_HOME = HOME;
  process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL = "1"; // fixture server lives on 127.0.0.1
  const photoFile = path.join(HOME, "driver-photo.jpg");
  fs.writeFileSync(photoFile, TINY_JPG);

  const fixture = await startFixture();
  try {
    // --- tools/list: names + MCP annotations -------------------------------
    const listRes = await rpc([initMsg(1, "e2e-driver"), { jsonrpc: "2.0", id: 2, method: "tools/list" }], [1, 2]);
    const listed = listRes.get(2).result.tools;
    check(listed.length === EXPECTED_TOOL_COUNT, `tools/list has exactly ${EXPECTED_TOOL_COUNT} tools`);
    for (const n of EXPECTED_TOOL_NAMES)
      check(
        listed.some((t) => t.name === n),
        `tools/list has ${n}`,
      );
    for (const t of listed) {
      const a = t.annotations;
      check(
        !!a && typeof a.readOnlyHint === "boolean" && typeof a.destructiveHint === "boolean",
        `annotations present for ${t.name}`,
      );
    }

    // --- create / read ------------------------------------------------------
    const gen = await step(
      3,
      "generate_carousel",
      {
        title: "Driver Suite",
        company: COMPANY,
        carouselName: CAROUSEL,
        slides: [
          {
            template: "cover",
            titleWhite: "DRIVER",
            titleOrange: "SUITE",
            paragraphs: ["Deterministic coverage run."],
          },
          { template: "fact", titleWhite: "DATO", titleOrange: "42%", paragraphs: ["Creció 42% interanual."] },
          { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Listo", text: "Todo verde." } },
        ],
        open: false,
        persist: true,
        outputDir: path.join(HOME, "out"),
      },
      (o) => {
        check(o.ok === true && o.render && o.render.slides === 3, "generate_carousel ok + render.slides=3");
      },
    );

    await step(
      4,
      "save_carousel",
      {
        company: COMPANY,
        name: CAROUSEL,
        carousel: {
          version: 2,
          company: COMPANY,
          slug: CAROUSEL,
          meta: { title: "Driver Suite Saved", format: "feed" },
          slides: [
            {
              template: "cover",
              titleWhite: "DRIVER",
              titleOrange: "SAVED",
              paragraphs: ["Deterministic coverage run."],
            },
            { template: "fact", titleWhite: "DATO", titleOrange: "42%", paragraphs: ["Creció 42% interanual."] },
            { template: "cta", titleWhite: "FIN", titleOrange: "OK", ctaBox: { title: "Listo", text: "Todo verde." } },
          ],
        },
        open: false,
        outputDir: path.join(HOME, "out"),
      },
      (o) => check(!!o.saved, "save_carousel saved"),
    );

    await step(5, "load_carousel", { company: COMPANY, name: CAROUSEL, open: false }, (o) => {
      check(Array.isArray(o.slides) && o.slides.length === 3, "load_carousel 3 slides");
      check(o.meta && o.meta.title === "Driver Suite Saved", "load_carousel sees saved title");
    });

    await step(6, "list_carousels", { company: COMPANY }, (o) => {
      check(
        Array.isArray(o.carousels) && o.carousels.some((c) => c.slug === CAROUSEL),
        "list_carousels includes driver-suite",
      );
    });

    // --- structured edits ---------------------------------------------------
    await step(
      7,
      "edit_slide",
      {
        company: COMPANY,
        name: CAROUSEL,
        slide: 1,
        action: "update_text",
        payload: { blockType: "text", text: "DRIVER EDITADO" },
        open: false,
      },
      (o) => check(o.action === "update_text" && o.appliedTo === "slide 1", "edit_slide update_text"),
    );

    await step(8, "set_carousel_meta", { company: COMPANY, name: CAROUSEL, category: "notas", open: false }, (o) => {
      check(o.ok === true && o.render, "set_carousel_meta ok + render");
    });

    await step(
      9,
      "set_slide_bg",
      { company: COMPANY, name: CAROUSEL, slide: 2, mode: "gradient", gradient: "mint", open: false },
      (o) => {
        check(o.ok === true, "set_slide_bg ok");
      },
    );

    await step(
      10,
      "set_slide_photo",
      { company: COMPANY, name: CAROUSEL, slide: 3, source: photoFile, open: false },
      (o) => {
        check(o.ok === true && /slide 3/.test(o.summary || ""), "set_slide_photo ok + summary");
      },
    );

    await step(11, "validate_carousel", { company: COMPANY, name: CAROUSEL }, (o) => {
      check(typeof o.ok === "boolean" && Array.isArray(o.styleWarnings), "validate_carousel dry-run shape");
    });

    await step(12, "review_slide_images", { company: COMPANY, name: CAROUSEL }, (o) => {
      check(Array.isArray(o.slides) && Array.isArray(o.photoNeeds), "review_slide_images shape");
      check(typeof o.protocol === "string" && o.protocol.includes("PHOTO REVIEW PROTOCOL"), "review protocol text");
    });

    // --- brand kits ---------------------------------------------------------
    await step(13, "list_brand_kits", {}, (o) => {
      check(o.ok === true && Array.isArray(o.kits), "list_brand_kits shape");
    });
    await step(
      14,
      "save_brand_kit",
      { name: "driver-brand", kit: { name: "Driver Brand", colors: { primary: "#ff5a00" } } },
      (o) => {
        check(o.ok === true && o.name === "driver-brand" && fs.existsSync(o.file), "save_brand_kit writes kit.json");
      },
    );
    await step(15, "load_brand_kit", { name: "driver-brand" }, (o) => {
      check(o.colors && o.colors.primary === "#ff5a00", "load_brand_kit colors");
      check(!o.logo || !o.logo.img, "load_brand_kit masks base64 logo by default");
    });
    await step(16, "delete_brand_kit", { name: "driver-brand" }, (o) => {
      check(o.deleted === false, "delete_brand_kit previews without confirm");
    });
    await step(17, "delete_brand_kit", { name: "driver-brand", confirm: true }, (o) => {
      check(o.deleted === true, "delete_brand_kit confirm deletes");
      check(!fs.existsSync(path.join(HOME, "brand", "driver-brand", "kit.json")), "kit folder removed");
    });

    // --- deliverables (Chrome optional) ------------------------------------
    await step(
      18,
      "render_preview",
      {
        company: COMPANY,
        name: CAROUSEL,
        format: "4:5",
        slides: [1],
        outputDir: path.join(HOME, "previews"),
        open: false,
      },
      (o) => {
        const p = o.preview || {};
        check(p.ok === true || p.reason === "no-chrome", "render_preview ok or no-chrome");
        check(p.format === "feed", "render_preview 4:5 maps to feed");
      },
    );
    await step(19, "export_pdf", { company: COMPANY, name: CAROUSEL, format: "feed" }, (o) => {
      const p = o.pdf || {};
      check(!!p.htmlPath && fs.existsSync(p.htmlPath), "export_pdf htmlPath exists");
      check(p.ok === true || ["no-chrome", "chrome-failed"].includes(p.reason), "export_pdf ok or no-chrome");
      if (p.ok === true && p.pdfPath && fs.existsSync(p.pdfPath)) {
        const pdfTxt = fs.readFileSync(p.pdfPath).toString("latin1");
        const pageObjs = (pdfTxt.match(/\/Type\s*\/Page(?!s)/g) || []).length;
        check(pageObjs === p.count, `export_pdf one page per slide (${pageObjs} vs ${p.count})`);
      }
    });
    await step(20, "social_copy", { company: COMPANY, name: CAROUSEL, tone: "directo", save: true }, (o) => {
      check(!!(o.captions && o.captions.instagram && o.captions.linkedin), "social_copy captions IG+LI");
      check(Array.isArray(o.altTexts) && o.altTexts.every((a) => a.chars <= 125), "social_copy altTexts <= 125");
      check(!!o.saved && fs.existsSync(o.saved), "social.md saved");
    });

    // --- URL tools against the local fixture --------------------------------
    await step(21, "brand_kit_from_url", { url: `${BASE}/`, name: "driver-brand-url" }, (o) => {
      check(o.ok === true && fs.existsSync(o.file), "brand_kit_from_url writes kit.json");
      check(o.colors || o.confidence, "brand_kit_from_url exposes inference metadata");
    });
    await step(
      22,
      "carousel_from_url",
      {
        url: `${BASE}/nota/cafe-especialidad`,
        company: COMPANY,
        carouselName: "driver-from-url",
        kitName: "driver-brand-url",
        persist: true,
        open: false,
      },
      (o) => {
        check(o.ok === true && o.render && o.render.slug === "driver-from-url", "carousel_from_url persists");
        check(/PHOTO REVIEW PROTOCOL/.test(o.summary || ""), "carousel_from_url summary carries protocol");
      },
    );

    // --- import / duplicate / delete ----------------------------------------
    await step(
      23,
      "import_editor_state",
      {
        company: COMPANY,
        name: "driver-imported",
        carousel: {
          version: 2,
          company: COMPANY,
          slug: "driver-imported",
          meta: { title: "Imported By Driver", format: "feed" },
          slides: [{ template: "cover", titleWhite: "IMPORT", titleOrange: "OK" }],
        },
        open: false,
      },
      (o) => check(o.imported === true, "import_editor_state imported"),
    );

    await step(
      24,
      "duplicate_carousel",
      { company: COMPANY, name: CAROUSEL, toName: "driver-copy", open: false },
      (o) => {
        check(o.ok === true && o.render && o.render.slug === "driver-copy", "duplicate_carousel target");
        check(fs.existsSync(path.join(HOME, "carousels", COMPANY, "driver-copy", "carousel.json")), "copy on disk");
      },
    );

    await step(25, "delete_carousel", { company: COMPANY, name: "driver-copy" }, (o) => {
      check(o.deleted === false, "delete_carousel previews without confirm");
    });
    await step(26, "delete_carousel", { company: COMPANY, name: "driver-copy", confirm: true }, (o) => {
      check(o.deleted === true, "delete_carousel confirm deletes");
      check(!fs.existsSync(path.join(HOME, "carousels", COMPANY, "driver-copy")), "copy folder removed");
    });

    // --- coverage gate -------------------------------------------------------
    const missing = EXPECTED_TOOL_NAMES.filter((n) => !called.has(n));
    check(missing.length === 0, `all ${EXPECTED_TOOL_COUNT} tools called (missing: ${missing.join(", ") || "none"})`);
    check(called.size === EXPECTED_TOOL_COUNT, `exactly ${EXPECTED_TOOL_COUNT} tools exercised`);
  } finally {
    try {
      fixture.kill("SIGTERM");
    } catch {}
    try {
      fs.rmSync(HOME, { recursive: true, force: true });
    } catch {}
  }

  console.log("---");
  console.log(fails.length ? "FAILURES: " + fails.length + " -> " + fails.join(" | ") : "ALL PASS (" + passed + ")");
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  try {
    fs.rmSync(HOME, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
