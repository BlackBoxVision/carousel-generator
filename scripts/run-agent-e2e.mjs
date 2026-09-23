#!/usr/bin/env node
/**
 * Runs the agent e2e prompt against opencode CLI with a free model,
 * capturing CAROUSEL_TOOL_LOG for the verifier.
 *
 * Usage:
 *   node scripts/run-agent-e2e.mjs --log /tmp/calls.jsonl --home /tmp/home --artifacts /tmp/art
 *
 * Env:
 *   OPENCODE_MODEL  (default: opencode/mimo-v2.6-flash-free)
 *   FIXTURE_URL     base URL of fixture-server (default http://127.0.0.1:8765)
 *   OPENCODE_API_KEY if required by Zen free tier
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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
      } else out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const logFile = args.log || path.join(ROOT, ".tmp-agent-calls.jsonl");
const home = args.home || path.join(ROOT, ".tmp-agent-home");
const artifacts = args.artifacts || path.join(ROOT, ".tmp-agent-artifacts");
const model = process.env.OPENCODE_MODEL || "opencode/mimo-v2.6-flash-free";
const fixtureUrl = process.env.FIXTURE_URL || "http://127.0.0.1:8765";

fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });
fs.writeFileSync(logFile, "");

const prompt = `Sos un agente MCP. El servidor "carousel-generator" está registrado como MCP local (tools de prefijo carousel_* o el nombre exacto de cada tool). Ejercitá EXACTAMENTE las 16 tools via tools/call del MCP "carousel" (NO leas el código fuente para invocarlas; usá las tools MCP disponibles). Dejá artefactos reales. Usá CAROUSEL_GENERATOR_HOME aislado (ya seteado en el entorno).

Contexto:
- URL de fixture homepage: ${fixtureUrl}/
- URL de fixture artículo: ${fixtureUrl}/nota/cafe-especialidad
- Company slug: agent-e2e
- NO uses rutas de tu máquina real; todo bajo el home de entorno (/tmp/agent-home).

Checklist obligatorio (las 16, todas deben terminar ok:true):
1. brand_kit_from_url con url=${fixtureUrl}/ y name=agent-brand (save default true)
2. list_brand_kits
3. load_brand_kit name=agent-brand
4. save_brand_kit name=agent-brand refinando colors.primary=#c45c26
5. generate_carousel title="Café Norte E2E" company=agent-e2e carouselName=e2e-main kitName=agent-brand persist=true open=false con 3+ slides (cover/fact/cta) y slides que mencionen 42%
6. list_carousels
7. load_carousel company=agent-e2e name=e2e-main open=false
8. save_carousel actualizando meta.title a "Café Norte E2E v2" (carousel v2 mínimo con 1 cover)
9. edit_slide update_text en e2e slide 1 blockType=text text="PORTADA E2E"
10. review_slide_images company=agent-e2e name=e2e-main
11. set_slide_photo company=agent-e2e name=e2e-main slide=1 source=${fixtureUrl}/static/beans.jpg
12. render_preview company=agent-e2e name=e2e-main format=4:5 (genera PNGs; si no hay Chrome, reportá el JSON igual)
13. social_copy company=agent-e2e name=e2e-main tone=informativo save=true
14. carousel_from_url url=${fixtureUrl}/nota/cafe-especialidad company=agent-e2e carouselName=e2e-from-url persist=true open=false
15. import_editor_state payload={action:"upsert",company:"agent-e2e",name:"e2e-imported",carousel:{version:2,company:"agent-e2e",slug:"e2e-imported",meta:{title:"Imported",format:"feed"},slides:[{template:"cover",titleWhite:"IMPORT",titleOrange:"OK"}]}} open=false
16. delete_carousel company=agent-e2e name=e2e-from-url SIN confirm (solo preview); después con confirm:true

Reglas:
- Invocá cada tool vía el MCP "carousel" (tools/call), NO vía shell/node import.
- Si una tool falla, reintentá con args corregidos hasta que quede ok:true.
- No te detengas hasta cubrir las 16.
- Al final resumí qué tools corriste.`;

const env = {
  ...process.env,
  CAROUSEL_GENERATOR_HOME: home,
  CAROUSEL_TOOL_LOG: logFile,
  OPENCODE_MODEL: model,
  // Allow external_directory under /tmp (home + artifacts) without interactive prompt.
  OPENCODE_PERMISSION: JSON.stringify({
    external_directory: {
      "/tmp/*": "allow",
      "/tmp/agent-home/*": "allow",
      "/tmp/agent-artifacts/*": "allow",
    },
  }),
};

console.log("[agent-e2e] model=", model, "home=", home, "log=", logFile);

const child = spawn("opencode", ["run", "--auto", "--model", model, prompt], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
let err = "";
child.stdout.on("data", (d) => {
  const s = d.toString();
  out += s;
  process.stdout.write(s);
});
child.stderr.on("data", (d) => {
  const s = d.toString();
  err += s;
  process.stderr.write(s);
});

const timeoutMs = parseInt(process.env.AGENT_E2E_TIMEOUT_MS || "900000", 10);
const timer = setTimeout(() => {
  console.error("[agent-e2e] timeout, killing opencode");
  try {
    child.kill("SIGKILL");
  } catch {}
}, timeoutMs);

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  fs.writeFileSync(path.join(artifacts, "agent-stdout.log"), out);
  fs.writeFileSync(path.join(artifacts, "agent-stderr.log"), err);
  console.log(`[agent-e2e] opencode exit code=${code} signal=${signal}`);
  // Verifier decides success — model exit code is advisory only.
  process.exit(0);
});

child.on("error", (e) => {
  clearTimeout(timer);
  console.error("[agent-e2e] failed to spawn opencode:", e.message);
  fs.writeFileSync(path.join(artifacts, "agent-spawn-error.txt"), String(e && e.stack || e));
  process.exit(0);
});
