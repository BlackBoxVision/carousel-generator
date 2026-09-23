import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Creates an isolated CAROUSEL_GENERATOR_HOME for tests and returns { home, env, cleanup }.
 * Call cleanup in after/finally so personal kits/carousels are never touched.
 */
export function tmpHome(prefix = "carousel-test-") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const env = { CAROUSEL_GENERATOR_HOME: home };
  return {
    home,
    env,
    brandDir: path.join(home, "brand"),
    carouselDir: path.join(home, "carousels"),
    cleanup() {
      try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
    },
  };
}
