#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * Checks that dist/carousel-generator.mcpb exists and matches package.json:
 * same version and same tool count as the registry.
 * Usage: node scripts/bundle-check.mjs   (exit 1 when stale/missing)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tools } from "../mcp/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function readZipEntry(zipFile, entry) {
  const r = spawnSync("unzip", ["-p", zipFile, entry], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout;
}

export function bundleStatus(root = ROOT) {
  const zip = path.join(root, "dist", "carousel-generator.mcpb");
  if (!fs.existsSync(zip))
    return { ok: false, reason: "dist/carousel-generator.mcpb no existe (corré `npm run bundle`)" };
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const raw = readZipEntry(zip, "manifest.json");
  if (!raw) return { ok: false, reason: "no se pudo leer manifest.json dentro del .mcpb (¿unzip disponible?)" };
  let embedded;
  try {
    embedded = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: `manifest.json del .mcpb inválido: ${e.message}` };
  }
  if (embedded.version !== pkg.version) {
    return { ok: false, reason: `versión del bundle ${embedded.version} ≠ package.json ${pkg.version}` };
  }
  const n = (embedded.tools || []).length;
  if (n !== tools.length) {
    return { ok: false, reason: `el bundle declara ${n} tools, el registry tiene ${tools.length}` };
  }
  return { ok: true, version: embedded.version, tools: n };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const s = bundleStatus();
  if (s.ok) {
    console.log(`bundle ok: v${s.version}, ${s.tools} tools.`);
    process.exit(0);
  }
  console.error(`bundle OUT OF DATE: ${s.reason}`);
  process.exit(1);
}
