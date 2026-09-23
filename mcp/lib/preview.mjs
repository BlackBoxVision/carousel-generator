import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function normalizePreviewFormat(f, fallback) {
  const raw = String(f || "").trim().toLowerCase();
  const map = {
    feed: "feed", "4:5": "feed", "45": "feed", "4x5": "feed",
    square: "square", "1:1": "square", "11": "square", "1x1": "square",
    story: "story", "9:16": "story", "916": "story", "9x16": "story", reels: "story", tiktok: "story",
  };
  if (map[raw]) return map[raw];
  if (["feed", "square", "story"].includes(raw)) return raw;
  return fallback && ["feed", "square", "story"].includes(fallback) ? fallback : "feed";
}
export function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}
export function findChromeBin() {
  const envChrome = process.env.CHROME_PATH && process.env.CHROME_PATH.trim();
  if (envChrome && fs.existsSync(envChrome)) return envChrome;
  const candidates = [];
  if (process.platform === "darwin") {
    const home = os.homedir();
    const pwRoot = path.join(home, "Library", "Caches", "ms-playwright");
    for (const dir of safeReaddir(pwRoot)) {
      if (!/^chromium_headless_shell/i.test(dir)) continue;
      candidates.push(path.join(pwRoot, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"));
      candidates.push(path.join(pwRoot, dir, "chrome-headless-shell-mac", "chrome-headless-shell"));
    }
    for (const dir of safeReaddir(pwRoot)) {
      if (!/^chromium-\d/i.test(dir)) continue;
      candidates.push(path.join(pwRoot, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
      candidates.push(path.join(pwRoot, dir, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
    }
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    );
  } else if (process.platform === "win32") {
    const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    candidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe")
    );
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium");
  }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  for (const name of ["google-chrome", "chromium", "chromium-browser", "chrome"]) {
    try {
      const r = spawnSync("which", [name], { encoding: "utf8" });
      if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
    } catch {}
  }
  return null;
}
export function chromeScreenshot(bin, url, pngPath, width, height) {
  const isHeadlessShell = /chrome-headless-shell|headless_shell/i.test(bin);
  const args = [];
  if (!isHeadlessShell) args.push("--headless=new");
  args.push(
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--disable-dev-shm-usage",
    "--allow-file-access-from-files",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=" + width + "," + height,
    "--force-device-scale-factor=1",
    "--virtual-time-budget=8000",
    "--run-all-compositor-stages-before-draw",
    "--screenshot=" + pngPath,
    url
  );
  try { fs.rmSync(pngPath, { force: true }); } catch {}
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error && (r.error.code === "ETIMEDOUT" || /ETIMEDOUT|timed out/i.test(String(r.error.message || "")))) {
    if (fs.existsSync(pngPath)) return pngPath;
    const r2 = spawnSync(bin, args, { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
    if (r2.error && !fs.existsSync(pngPath)) throw new Error("No se pudo ejecutar Chrome: " + r2.error.message);
    if (!fs.existsSync(pngPath)) {
      const err = (r2.stderr || r2.stdout || r.stderr || r.stdout || "").slice(0, 400);
      throw new Error("Chrome no generó el PNG (" + pngPath + "). " + err);
    }
    return pngPath;
  }
  if (r.error) throw new Error("No se pudo ejecutar Chrome: " + r.error.message);
  if (!fs.existsSync(pngPath)) {
    const err = (r.stderr || r.stdout || "").slice(0, 400);
    throw new Error("Chrome no generó el PNG (" + pngPath + "). " + err);
  }
  return pngPath;
}
export function fileUrl(p) {
  const abs = path.resolve(p);
  let u = "file://" + abs.split(path.sep).map(encodeURIComponent).join("/");
  return u;
}
