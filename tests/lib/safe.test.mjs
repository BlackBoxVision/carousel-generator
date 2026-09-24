import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { safeCss, safeKit, safeStyleObject } from "../../mcp/lib/safe.mjs";

const CONTROL = String.fromCharCode(7); // BEL

describe("safeCss", () => {
  test("acepta CSS y font-family con comillas simples", () => {
    assert.equal(safeCss("linear-gradient(135deg,#111,#333)"), "linear-gradient(135deg,#111,#333)");
    assert.equal(safeCss("'Inter', system-ui, sans-serif"), "'Inter', system-ui, sans-serif");
    assert.equal(safeCss("url('img/a.jpg')"), "url('img/a.jpg')");
    assert.equal(safeCss("  center 30%  "), "center 30%");
    assert.equal(safeCss(undefined), "");
  });

  test('rechaza < > " y controles (XSS)', () => {
    assert.throws(() => safeCss("</style><script>alert(1)</script>"), /caracteres no permitidos/);
    assert.throws(() => safeCss('x" onmouseover="alert(1)'), /caracteres no permitidos/);
    assert.throws(() => safeCss("a>"), /caracteres no permitidos/);
    assert.throws(() => safeCss(`a${CONTROL}b`), /caracteres no permitidos/);
  });

  test("rechaza strings largos", () => {
    assert.throws(() => safeCss("x".repeat(2001)), /demasiado largo/);
  });
});

describe("safeStyleObject", () => {
  test("conserva numeros y strings sanos", () => {
    const out = safeStyleObject({ align: "center", sizePct: 120, background: "#fff" });
    assert.deepEqual(out, { align: "center", sizePct: 120, background: "#fff" });
  });

  test("rechaza style con inyeccion", () => {
    assert.throws(() => safeStyleObject({ background: "red;x</style>" }), /caracteres no permitidos/);
    assert.throws(() => safeStyleObject({ color: 'red" onerror="x' }), /caracteres no permitidos/);
  });
});

describe("safeKit", () => {
  test("conserva logo.img data URL y sanea gradients", () => {
    const kit = safeKit({
      name: "x",
      logo: { letter: "x", img: "data:image/png;base64,AAAA", background: "#fff" },
      gradients: [{ name: "navy", css: "linear-gradient(145deg,#1e3a5f,#0f172a 65%)" }],
      fonts: { heading: "'Inter', sans-serif" },
    });
    assert.equal(kit.logo.img, "data:image/png;base64,AAAA");
    assert.equal(kit.gradients[0].css, "linear-gradient(145deg,#1e3a5f,#0f172a 65%)");
  });

  test("rechaza gradients css con inyeccion", () => {
    assert.throws(
      () => safeKit({ gradients: [{ name: "x", css: "red</style><script>x</script>" }] }),
      /caracteres no permitidos/,
    );
  });

  test("googleUrl debe ser https", () => {
    assert.throws(() => safeKit({ fonts: { googleUrl: "http://evil.example/x.css" } }), /https:\/\//);
    assert.doesNotThrow(() => safeKit({ fonts: { googleUrl: "https://fonts.googleapis.com/css2?family=Inter" } }));
  });
});
