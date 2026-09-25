#!/usr/bin/env node
/**
 * Syncs manifest.json tools[] from the MCP tool registry (single source of truth).
 * Usage: node scripts/sync-manifest.mjs [--check]
 * --check: exit 1 if manifest is out of sync (no write).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tools } from "../mcp/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(ROOT, "manifest.json");
const check = process.argv.includes("--check");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

// Descriptions always come from the registry (single source of truth): the
// manifest is a generated artifact, never a place where text is authored.
const shortDescription = (tool) => {
  const d = tool.description || "";
  const first = d.split(/(?<=\.)\s+/)[0] || d;
  return first.length > 160 ? first.slice(0, 157).trimEnd() + "…" : first;
};

const nextTools = tools.map((t) => ({
  name: t.name,
  description: shortDescription(t),
}));

const changed =
  JSON.stringify(manifest.tools || []) !== JSON.stringify(nextTools) || tools.length !== (manifest.tools || []).length;

if (!changed) {
  console.log(`manifest.json tools[] already in sync (${tools.length} tools).`);
  process.exit(0);
}

if (check) {
  console.error(
    `manifest.json tools[] OUT OF SYNC: registry has ${tools.length}, manifest has ${(manifest.tools || []).length}.`,
  );
  const regNames = new Set(tools.map((t) => t.name));
  const manNames = new Set((manifest.tools || []).map((t) => t.name));
  for (const n of regNames) if (!manNames.has(n)) console.error(`  missing in manifest: ${n}`);
  for (const n of manNames) if (!regNames.has(n)) console.error(`  extra in manifest: ${n}`);
  if (regNames.size === manNames.size && regNames.size === tools.length) {
    const prev = new Map((manifest.tools || []).map((t) => [t.name, t.description]));
    for (const t of nextTools) {
      if (prev.get(t.name) !== t.description) console.error(`  stale description: ${t.name}`);
    }
    console.error("  (names match; descriptions are stale — run `npm run sync:manifest`)");
  }
  process.exit(1);
}

manifest.tools = nextTools;
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`manifest.json tools[] synced (${tools.length} tools).`);
