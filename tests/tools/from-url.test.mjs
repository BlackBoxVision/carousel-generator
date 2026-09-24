import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import brandKitFromUrl from "../../mcp/tools/brand_kit_from_url.mjs";
import carouselFromUrl from "../../mcp/tools/carousel_from_url.mjs";
import { tmpHome } from "../helpers/tmp-home.mjs";

let home;
let prevHome;

before(() => {
  home = tmpHome("from-url-");
  prevHome = process.env.CAROUSEL_GENERATOR_HOME;
  process.env.CAROUSEL_GENERATOR_HOME = home.home;
});

after(() => {
  if (prevHome === undefined) delete process.env.CAROUSEL_GENERATOR_HOME;
  else process.env.CAROUSEL_GENERATOR_HOME = prevHome;
  home.cleanup();
});

test("brand_kit_from_url validates url without touching the network", async () => {
  await assert.rejects(() => brandKitFromUrl.handler({}), /Falta `url`/);
  await assert.rejects(() => brandKitFromUrl.handler({ url: "no-una-url" }), /URL inválida/);
  await assert.rejects(
    () => brandKitFromUrl.handler({ url: "ftp://example.com/kits" }),
    /Solo se aceptan URLs http\(s\)/,
  );
});

test("brand_kit_from_url blocks private and local hosts offline", async () => {
  await assert.rejects(() => brandKitFromUrl.handler({ url: "http://127.0.0.1:9/x" }), /URL bloqueada/);
  await assert.rejects(
    () => brandKitFromUrl.handler({ url: "http://169.254.169.254/latest/meta-data" }),
    /URL bloqueada/,
  );
});

test("carousel_from_url validates url without touching the network", async () => {
  await assert.rejects(() => carouselFromUrl.handler({}), /Falta `url`/);
  await assert.rejects(() => carouselFromUrl.handler({ url: "http://" }), /Invalid URL|URL inválida/);
});

test("carousel_from_url rejects non-http protocols and private hosts", async () => {
  await assert.rejects(() => carouselFromUrl.handler({ url: "ftp://example.com/nota" }), /Protocolo no permitido/);
  await assert.rejects(() => carouselFromUrl.handler({ url: "http://10.0.0.1:8080/nota" }), /URL bloqueada/);
});
