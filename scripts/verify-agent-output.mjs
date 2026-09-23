#!/usr/bin/env node
/**
 * Verifies agent e2e output: CAROUSEL_TOOL_LOG coverage (19/19 ok:true)
 * + per-tool artifact assertions. Exit code = job result (not the model's).
 *
 * Usage:
 *   node scripts/verify-agent-output.mjs --log <calls.jsonl> --home <CAROUSEL_GENERATOR_HOME>
 *   node scripts/verify-agent-output.mjs --log calls.jsonl --home /tmp/home --artifacts /tmp/artifacts
 */
import fs from "node:fs";
import path from "node:path";

const EXPECTED_TOOLS = [
  "generate_carousel",
  "list_carousels",
  "load_carousel",
  "save_carousel",
  "delete_carousel",
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

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isNonTinyFile(p, minBytes = 100) {
  try {
    const st = fs.statSync(p);
    return st.isFile() && st.size >= minBytes;
  } catch {
    return false;
  }
}

function listCarouselsHome(home) {
  const root = path.join(home, "carousels");
  const out = [];
  if (!exists(root)) return out;
  for (const company of fs.readdirSync(root)) {
    const cdir = path.join(root, company);
    if (!fs.statSync(cdir).isDirectory()) continue;
    for (const slug of fs.readdirSync(cdir)) {
      out.push({ company, slug, dir: path.join(cdir, slug) });
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const logFile = args.log;
  const home = args.home;
  const artifactsDir = args.artifacts || home;

  const failures = [];
  const warnings = [];
  const passes = [];

  const ok = (label) => passes.push(label);
  const fail = (label, detail) => failures.push({ label, detail });
  const warn = (label, detail) => warnings.push({ label, detail });

  // --- 1. Coverage: every expected tool called with ok:true ---
  if (!logFile || !exists(logFile)) {
    fail("tool log exists", `CAROUSEL_TOOL_LOG not found at ${logFile || "(missing --log)"}`);
  } else {
    const entries = readLog(logFile);
    if (!entries.length) {
      fail("tool log non-empty", `${logFile} has no JSONL entries`);
    } else {
      const byTool = new Map();
      for (const e of entries) {
        if (!byTool.has(e.name)) byTool.set(e.name, []);
        byTool.get(e.name).push(e);
      }
      let covered = 0;
      for (const name of EXPECTED_TOOLS) {
        const calls = byTool.get(name) || [];
        const good = calls.some((c) => c.ok === true);
        if (good) {
          covered++;
          ok(`tool called ok:true — ${name}`);
        } else if (calls.length) {
          const err = calls.find((c) => c.ok === false);
          fail(`tool called ok:true — ${name}`, `only failed calls: ${err && err.error ? err.error.slice(0, 300) : "unknown error"}`);
        } else {
          fail(`tool called ok:true — ${name}`, "never called");
        }
      }
      const extra = [...byTool.keys()].filter((n) => !EXPECTED_TOOLS.includes(n));
      if (extra.length) warn("extra tools called", extra.join(", "));
      console.log(`coverage: ${covered}/${EXPECTED_TOOLS.length}`);
      if (covered === EXPECTED_TOOLS.length) ok(`coverage ${EXPECTED_TOOLS.length}/${EXPECTED_TOOLS.length}`);
      else fail(`coverage ${EXPECTED_TOOLS.length}/${EXPECTED_TOOLS.length}`, `only ${covered}/${EXPECTED_TOOLS.length}`);
    }
  }

  // --- 2. Artifact assertions ---
  if (!home || !exists(home)) {
    fail("home exists", `CAROUSEL_GENERATOR_HOME missing at ${home || "(missing --home)"}`);
  } else {
    const carousels = listCarouselsHome(home);
    if (carousels.length) ok(`at least one carousel persisted (${carousels.length})`);
    else fail("at least one carousel persisted", `no folders under ${path.join(home, "carousels")}`);

    // generate_carousel: a carousel.json with version 2 + slides
    const withJson = carousels.filter((c) => exists(path.join(c.dir, "carousel.json")));
    if (withJson.length) {
      ok(`carousel.json present (${withJson.length})`);
      let versionOk = false;
      for (const c of withJson) {
        try {
          const stored = JSON.parse(fs.readFileSync(path.join(c.dir, "carousel.json"), "utf8"));
          if (stored.version === 2 && Array.isArray(stored.slides) && stored.slides.length >= 1) versionOk = true;
        } catch {}
      }
      if (versionOk) ok("carousel.json version=2 with slides");
      else fail("carousel.json version=2 with slides", "no valid v2 carousel.json found");
    } else {
      fail("carousel.json present", "no carousel.json under home/carousels");
    }

    // save_brand_kit / brand_kit_from_url: brand/{slug}/kit.json
    const brandRoot = path.join(home, "brand");
    const kits = exists(brandRoot)
      ? fs
          .readdirSync(brandRoot)
          .map((sl) => ({ sl, file: path.join(brandRoot, sl, "kit.json") }))
          .filter((k) => exists(k.file))
      : [];
    if (kits.length) ok(`brand kit saved (${kits.map((k) => k.sl).join(", ")})`);
    else fail("brand kit saved", `no kit.json under ${brandRoot}`);

    // render_preview: PNG files under carousels/**/previews/ or artifacts dir
    const pngs = [];
    const walk = (dir) => {
      if (!exists(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        try {
          const st = fs.statSync(p);
          if (st.isDirectory()) walk(p);
          else if (entry.endsWith(".png") && st.size > 3000) pngs.push(p);
        } catch {}
      }
    };
    walk(path.join(home, "carousels"));
    if (artifactsDir && artifactsDir !== home) walk(artifactsDir);
    if (pngs.length) ok(`render_preview PNGs (${pngs.length})`);
    else fail("render_preview PNGs", "no PNG >3KB under home/carousels (or --artifacts)");

    // social_copy: social.md somewhere
    let socialMd = null;
    for (const c of carousels) {
      const p = path.join(c.dir, "social.md");
      if (exists(p)) {
        socialMd = p;
        break;
      }
    }
    if (socialMd) ok(`social.md written (${socialMd})`);
    else fail("social.md written", "no social.md under any carousel dir (agent should pass save:true)");

    // source.md from carousel_from_url (may be skipped if exists)
    let sourceMd = null;
    for (const c of carousels) {
      const p = path.join(c.dir, "source.md");
      if (exists(p)) {
        sourceMd = p;
        break;
      }
    }
    if (sourceMd) ok(`source.md written (${sourceMd})`);
    else warn("source.md written", "no source.md (carousel_from_url may have skipped writeSourceMd)");

    // HTML previews (generate/load)
    const htmls = [];
    const walkHtml = (dir, depth = 0) => {
      if (!exists(dir) || depth > 6) return;
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        try {
          const st = fs.statSync(p);
          if (st.isDirectory()) walkHtml(p, depth + 1);
          else if (entry.endsWith(".html") && st.size > 1000) htmls.push(p);
        } catch {}
      }
    };
    walkHtml(home);
    if (artifactsDir && artifactsDir !== home) walkHtml(artifactsDir);
    if (htmls.length) ok(`HTML previews (${htmls.length})`);
    else warn("HTML previews", "no HTML >1KB found (may be in ~/Downloads)");
  }

  // --- Report ---
  console.log("\n=== verify-agent-output ===");
  console.log(`pass: ${passes.length}`);
  console.log(`warn: ${warnings.length}`);
  console.log(`fail: ${failures.length}`);
  if (warnings.length) {
    console.log("\n-- warnings --");
    for (const w of warnings) console.log(`  ~ ${w.label}${w.detail ? ": " + w.detail : ""}`);
  }
  if (failures.length) {
    console.log("\n-- failures --");
    for (const f of failures) console.log(`  ✖ ${f.label}${f.detail ? ": " + f.detail : ""}`);
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
}

main();
