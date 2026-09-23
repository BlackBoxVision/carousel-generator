import path from "node:path";
import os from "node:os";
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
