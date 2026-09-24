import os from "node:os";
import path from "node:path";
import { APP_PATH, REPO_KITS } from "./const.mjs";
import { slug } from "./text.mjs";

export { APP_PATH, REPO_KITS };

export function homeDir() {
  return process.env.CAROUSEL_GENERATOR_HOME || path.join(os.homedir(), ".carousel-generator");
}
export function brandDir() {
  return path.join(homeDir(), "brand");
}
export function carouselDir() {
  return path.join(homeDir(), "carousels");
}
export function legacyKitsDir() {
  return path.join(homeDir(), "kits");
}
export function carouselPath(company, name) {
  return path.join(carouselDir(), slug(company), slug(name));
}
export function companyKitFile(sl) {
  return path.join(brandDir(), sl, "kit.json");
}

/** true si `abs` esta bajo $HOME, $TMPDIR, /tmp o CAROUSEL_GENERATOR_HOME. */
export function isPathAllowed(abs) {
  const roots = [os.homedir(), os.tmpdir(), "/tmp", homeDir()].map((r) => path.resolve(r));
  const target = path.resolve(abs);
  return roots.some((r) => target === r || target.startsWith(r + path.sep));
}

/**
 * Contencion de paths locales (lectura de fotos / escritura de HTML).
 * Estricto por defecto; bypass con CAROUSEL_GENERATOR_ALLOW_LOCAL=1.
 */
export function assertPathAllowed(abs, field = "path") {
  if (process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL === "1" || process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL === "true") {
    return abs;
  }
  if (!isPathAllowed(abs)) {
    throw new Error(
      `\`${field}\` fuera de las carpetas permitidas ($HOME, $TMPDIR, /tmp, CAROUSEL_GENERATOR_HOME): ${abs}. ` +
        "Seteá CAROUSEL_GENERATOR_ALLOW_LOCAL=1 si es intencional.",
    );
  }
  return abs;
}
