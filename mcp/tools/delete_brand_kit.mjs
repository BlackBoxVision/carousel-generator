import fs from "node:fs";
import path from "node:path";
import { brandDir } from "../lib/paths.mjs";
import { findKitFile } from "../lib/kits.mjs";
import { slug } from "../lib/text.mjs";

export default {
  name: "delete_brand_kit",
  description: [
    "Delete a personal brand kit under ~/.carousel-generator/brand/{empresa}/kit.json.",
    "WHAT: two-step safety — without confirm:true returns a preview; with confirm:true deletes. Repo kits (mcp/kits/) are protected.",
    "WHEN: user explicitly asked to remove a personal kit after confirmation.",
    "SISTERS: list_brand_kits (find), save_brand_kit (create/update), load_brand_kit (inspect).",
    "ANTI: NEVER confirm:true without asking the user first; never delete repo kits.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre/slug del kit a eliminar." },
      confirm: { type: "boolean", description: "false (default): solo muestra el preview. true: borra permanentemente." },
    },
    required: ["name"],
  },
  handler(args) {
    const a = args || {};
    const name = a.name !== undefined && a.name !== null && String(a.name).trim()
      ? slug(String(a.name).trim())
      : "";
    if (!name) throw new Error("Falta `name` (nombre del kit).");
    const found = findKitFile(name);
    if (!found) throw new Error(`Brand kit "${name}" no existe.`);
    const personal = path.join(brandDir(), name, "kit.json");
    const isPersonal = found.file === personal || found.file.startsWith(brandDir() + path.sep);
    if (!isPersonal) {
      throw new Error(`El kit "${name}" es del repo (${found.file}) y no se puede borrar con delete_brand_kit. Solo se borran kits personales de ${brandDir()}.`);
    }
    if (!a.confirm) {
      let sizeBytes = 0;
      try { sizeBytes = fs.statSync(found.file).size; } catch {}
      return JSON.stringify({
        name,
        file: found.file,
        folder: path.dirname(found.file),
        sizeBytes,
        deleted: false,
        hint: "Llamá de nuevo con confirm:true para borrar permanentemente este kit.",
      }, null, 2);
    }
    const folder = path.dirname(found.file);
    fs.rmSync(folder, { recursive: true, force: true });
    return `Brand kit "${name}" eliminado (${folder}).`;
  },
};
