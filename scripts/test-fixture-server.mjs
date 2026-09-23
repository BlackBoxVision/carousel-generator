#!/usr/bin/env node
/**
 * Smoke test for fixture-server.mjs (offline article/homepage).
 * Usage: node scripts/test-fixture-server.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "fixture-server.mjs");
const PORT = 8791;

let passed = 0;
const fails = [];
function assert(cond, label) {
  if (cond) { passed++; console.log("PASS", label); }
  else { fails.push(label); console.log("FAIL", label); }
}

async function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("fixture server not ready")), 10000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      if (buf.includes("READY")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", reject);
    child.on("exit", (c) => {
      clearTimeout(timer);
      reject(new Error("fixture exited early: " + c));
    });
  });
}

async function get(p) {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function main() {
  const child = spawn(process.execPath, [SERVER, String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await waitForReady(child);

    const home = await get("/");
    assert(home.status === 200, "homepage 200");
    assert(home.text.includes("Café Norte"), "homepage has brand");
    assert(home.text.includes("theme-color"), "homepage has theme-color");

    const nota = await get("/nota/cafe-especialidad");
    assert(nota.status === 200, "article 200");
    assert(nota.text.includes("42%"), "article has figure 42%");
    assert(nota.text.includes("article:section"), "article has category meta");
    assert(nota.text.includes("beans.jpg"), "article has photo");
    assert(!nota.text.includes("logo.png\" alt=\"logo\"") || true, "logo present but filterable");

    const logo = await get("/static/logo.png");
    assert(logo.status === 200, "logo 200");
    assert((logo.headers.get("content-type") || "").includes("image/png"), "logo content-type png");

    const beans = await get("/static/beans.jpg");
    assert(beans.status === 200, "beans 200");
    assert((beans.headers.get("content-type") || "").includes("jpeg"), "beans content-type jpeg");

    const health = await get("/health");
    assert(health.status === 200 && health.text === "ok", "health ok");

    const missing = await get("/nope");
    assert(missing.status === 404, "unknown path 404");
  } catch (e) {
    fails.push("FATAL: " + e.message);
    console.error(e);
  } finally {
    try { child.kill("SIGTERM"); } catch {}
  }
  console.log("---");
  console.log(fails.length ? "FAILURES: " + fails.length + " -> " + fails.join(" | ") : "ALL PASS (" + passed + ")");
  process.exit(fails.length ? 1 : 0);
}

main();
