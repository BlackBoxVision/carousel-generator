#!/usr/bin/env node
/**
 * Offline e2e for carousel_from_url / brand_kit_from_url against the fixture server.
 * Usage: node scripts/test-from-url.mjs [baseUrl]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "mcp", "server.mjs");
const BASE = process.argv[2] || "http://127.0.0.1:8765";
const TMP_COMPANY = "fromurltest";

function rpc(msgs, waitIds, { timeoutMs = 90000, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let buf = "";
    let err = "";
    const results = new Map();
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(
        new Error("timeout waiting for " + waitIds.join(",") + "\n" + err.slice(0, 800) + "\n" + buf.slice(0, 800)),
      );
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
        try {
          child.stdin.end();
        } catch {}
        setTimeout(() => {
          try {
            child.kill();
          } catch {}
        }, 50);
        resolve(results);
      }
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
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
  if (!r) throw new Error("no result: " + JSON.stringify(res).slice(0, 400));
  if (r.isError)
    throw new Error("tool error: " + ((r.content && r.content[0] && r.content[0].text) || "").slice(0, 600));
  return (r.content || []).map((c) => c.text || "").join("\n");
}

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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "fromurl-home-"));
  const env = { CAROUSEL_GENERATOR_HOME: home };
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fromurl", version: "1" } },
  };

  // brand_kit_from_url
  const kitCall = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "brand_kit_from_url", arguments: { url: BASE + "/", name: "fixture-brand" } },
  };
  const r1 = await rpc([init, kitCall], [1, 2], { env });
  const kitText = contentText(r1.get(2));
  assert(/generado|guardado/i.test(kitText), "brand_kit_from_url saved kit");
  const kitFile = path.join(home, "brand", "fixture-brand", "kit.json");
  assert(fs.existsSync(kitFile), "kit.json on disk");
  if (fs.existsSync(kitFile)) {
    const kit = JSON.parse(fs.readFileSync(kitFile, "utf8"));
    assert(!!kit.colors && !!kit.colors.primary, "kit has colors.primary");
    assert(kit.name === "Café Norte" || kit.name === "fixture-brand" || !!kit.name, "kit has name");
  }

  // carousel_from_url
  const carCall = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "carousel_from_url",
      arguments: {
        url: BASE + "/nota/cafe-especialidad",
        company: TMP_COMPANY,
        carouselName: "from-url",
        persist: true,
        open: false,
        kitName: "fixture-brand",
      },
    },
  };
  const r2 = await rpc([init, carCall], [1, 3], { env });
  const carText = contentText(r2.get(3));
  assert(/Carrusel desde URL creado/i.test(carText), "carousel_from_url created");
  assert(/photoNeeds/i.test(carText), "photoNeeds section present");
  assert(/PHOTO REVIEW PROTOCOL/i.test(carText), "PHOTO_REVIEW_PROTOCOL present");
  assert(/narrativeAudit/i.test(carText), "narrativeAudit present");
  const jsonPath = path.join(home, "carousels", TMP_COMPANY, "from-url", "carousel.json");
  assert(fs.existsSync(jsonPath), "carousel.json persisted");
  if (fs.existsSync(jsonPath)) {
    const stored = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert(stored.version === 2 && stored.slides.length >= 3, "v2 with >=3 slides");
    assert(stored.meta && stored.meta.category, "meta.category set (Mercado)");
  }
  const sourceMd = path.join(home, "carousels", TMP_COMPANY, "from-url", "source.md");
  assert(fs.existsSync(sourceMd), "source.md written");

  // delete with confirm after preview
  const delPreview = {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "delete_carousel", arguments: { company: TMP_COMPANY, name: "from-url" } },
  };
  const r3 = await rpc([init, delPreview], [1, 4], { env });
  const dp = JSON.parse(contentText(r3.get(4)));
  assert(dp.deleted === false, "delete preview without confirm");
  const delConfirm = {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "delete_carousel", arguments: { company: TMP_COMPANY, name: "from-url", confirm: true } },
  };
  const r4 = await rpc([init, delConfirm], [1, 5], { env });
  assert(/eliminado/i.test(contentText(r4.get(5))), "delete with confirm");

  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {}
  console.log("---");
  console.log(fails.length ? "FAILURES: " + fails.length + " -> " + fails.join(" | ") : "ALL PASS (" + passed + ")");
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
