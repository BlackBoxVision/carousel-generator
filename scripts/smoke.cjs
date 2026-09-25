const fs = require("fs");
const vm = require("vm");

function anyProxy() {
  const f = function () { return proxy; };
  const proxy = new Proxy(f, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => "";
      if (p === "value") return "";
      if (p === "checked") return false;
      if (p === "dataset") return {};
      if (p === "style") return {};
      if (p === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}

const store = {};
const sandbox = {
  console,
  setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  document: {
    getElementById: () => anyProxy(),
    createElement: () => anyProxy(),
    querySelector: () => null,
    addEventListener() {},
    activeElement: null,
    body: anyProxy(),
    documentElement: { style: { setProperty() {} } },
  },
  confirm: () => true,
  alert: (m) => { throw new Error("ALERT: " + m); },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]).join("\n;\n");

const data = {
  kit: {
    name: "Default",
    colors: { primary: "#0ea5e9", secondary: "#0f172a", tertiary: "#ffffff", slideBg: "#1e293b" },
    fonts: { heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", googleUrl: "" },
    logo: { letter: "c", text: "Carousel" },
    gradients: [{ name: "navy", css: "linear-gradient(145deg,#1e3a5f,#0f172a)" }],
  },
  meta: { title: "Test" },
  slides: [
    { template: "cover", titleWhite: "A\nB", titleOrange: "C", paragraphs: ["**bold** x"] },
    { template: "fact", items: [{ emoji: "🐟", title: "T", desc: "D" }] },
  ],
};
sandbox.window.CAROUSEL_DATA = data;

vm.runInContext(script, sandbox, { filename: "app.js" });

const t = (expr) => vm.runInContext(expr, sandbox);
const assert = (name, cond) => console.log((cond ? "PASS" : "FAIL") + " " + name);
assert("slides=2", t("state.slides.length") === 2);
assert("kit name", t("state.kit.name") === "Default");
assert("md bold+br", t('md("**hola**\\nchau")') === "<b>hola</b><br>chau");
assert("slug", t('slug("Corvina Negra \\u00bfYa?")') === "corvina-negra-ya");
assert("esc", t('esc(\'<a href="x">\')') === "&lt;a href=&quot;x&quot;&gt;");
assert("titleWhite kept", t("state.slides[0].titleWhite") === "A\nB");
assert("sel=0", t("sel") === 0);

t("selectSlide(1)");
assert("select 1", t("sel") === 1);
t('setF("eyebrow","E1")');
assert("setF", t("state.slides[1].eyebrow") === "E1");
t('addSlide("cta")');
assert("addSlide len=3", t("state.slides.length") === 3);
t("moveSlide(2,-1)");
assert("moveSlide", t("state.slides[1].template") === "cta");
t("dupSlide(0)");
assert("dupSlide len=4", t("state.slides.length") === 4);
t("delSlide(0)");
assert("delSlide len=3", t("state.slides.length") === 3);

t('switchKit("builtin:default")');
assert("switchKit keeps Default", t("state.kit.name") === "Default");
t("toggleGuides()");
t('setBgGrad("navy")');
assert("setBgGrad", t("state.slides[sel].bg.value") === "navy");
t("applyTemplate()");
assert("applyTemplate keeps sel", typeof t("sel") === "number");
assert("default format feed", t("state.meta.format") === "feed");
t('setFormat("story")');
assert("setFormat story", t("state.meta.format") === "story");
assert("story class", t("slideHTML(state.slides[0],0)").includes("fmt-story"));
assert("safe zones", t("slideHTML(state.slides[0],0)").includes("UI inferior"));
t('setFormat("square")');
assert("square class", t("slideHTML(state.slides[0],0)").includes("fmt-square"));
assert("FORMATS px", t("FORMATS.story.px") === "1080×1920");

// Cascada highlightColors en render (slide raíz → .orange/.hl heredan)
t('state.kit.highlightColors={turismo:"#0f766e"}');
t('state.meta.category="Turismo"');
assert("cascade category hl-bg", t("slideHTML(state.slides[0],0)").includes("--hl-bg:#0f766e"));
t(`(function walk(ns){for(const el of ns||[]){if(el.type==="highlight"){el.style.background="#ff0000"}if(el.children)walk(el.children)}})(state.slides[0].elements)`);
assert("highlight block override wins", t("slideHTML(state.slides[0],0)").includes("--hl-bg:#ff0000"));
t(`(function walk(ns){for(const el of ns||[]){if(el.type==="highlight"){delete el.style.background}if(el.children)walk(el.children)}})(state.slides[0].elements)`);
t('state.meta.category=""');
assert("cascade falls back to primary", t("slideHTML(state.slides[0],0)").includes("--hl-bg:" + t("state.kit.colors.primary")));
console.log("SMOKE DONE");
