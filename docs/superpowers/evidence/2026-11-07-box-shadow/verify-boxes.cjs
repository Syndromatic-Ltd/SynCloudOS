// Run from framework/. Requires the original site archive extracted into
// .artifacts/box-shadow-before-sdk/package, and the adopted site archive
// extracted into .artifacts/box-shadow-after-sdk/package with its receipt.json.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const out = __dirname;
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const h = React.createElement;

function styles(root) {
  const seen = new Set();
  function read(file) {
    if (seen.has(file)) return "";
    seen.add(file);
    return fs.readFileSync(file, "utf8").replace(/@import\s+"([^"]+)";/g,
      (_, name) => read(path.resolve(path.dirname(file), name)))
      .replace(/url\((["']?)([^"')]+)\1\)/g, (match, _quote, url) => {
        if (/^(?:data:|https?:|#)/.test(url)) return match;
        const asset = path.resolve(path.dirname(file), url.split(/[?#]/)[0]);
        if (!fs.existsSync(asset)) throw new Error(`Missing stylesheet asset: ${asset}`);
        const mime = ({ ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" })[path.extname(asset)] ?? "application/octet-stream";
        return `url("data:${mime};base64,${fs.readFileSync(asset).toString("base64")}")`;
      });
  }
  return read(path.join(root, "nse/styles.css")) + read(path.join(root, "nse/themes/atmo/styles.css"));
}

async function main() {
  const beforeRoot = path.resolve(".artifacts/box-shadow-before-sdk/package");
  const afterRoot = path.resolve(".artifacts/box-shadow-after-sdk/package");
  const before = await import(pathToFileURL(path.join(beforeRoot, "nse.js")).href);
  const after = await import(pathToFileURL(path.join(afterRoot, "nse.js")).href);
  const browser = await chromium.launch({ headless: true });
  const receipt = JSON.parse(fs.readFileSync(".artifacts/box-shadow-after-sdk/receipt.json", "utf8"));
  const measurements = [{ beforeArchive: "68881ae54dbfd31e196d5b49359d410be0952da9cf5257996673eecfa2f6dd54", afterCommit: receipt.commit, afterArchive: receipt.archiveSha256 }];
  for (const phase of ["before", "after"]) {
    const sdk = phase === "before" ? before : after;
    const css = styles(phase === "before" ? beforeRoot : afterRoot);
    const box = phase === "before"
      ? (props, text) => h(sdk.NSERoundedBox, props, text)
      : (props, text) => h(sdk.NSEBox, { boxType: "custom", ...props }, text);
    for (const scheme of ["light", "dark"]) for (const dpr of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 760, height: 280 }, deviceScaleFactor: dpr });
      const page = await context.newPage();
      const appearance = { "data-nse-appearance": "atmo", "data-nse-colour-scheme-resolved": scheme, "data-mode": scheme };
      const background = scheme === "dark" ? "#1d2630" : "#e8edf2";
      const suffix = scheme === "dark" ? "-dark" : "";
      const boxes = h("div", { ...appearance, style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, padding: 32 } },
        box({}, "Quick note"),
        box(phase === "before" ? { variant: "frame" } : { borderType: "lineBorder" }, "Framed note"),
        box(phase === "before" ? { variant: "shadow" } : { shadow: new sdk.NSEShadow({ shadowColor: "#0003", shadowOffset: { width: 0, height: -2 }, shadowBlurRadius: 6 }) }, "Floating note"));
      await page.setContent(`<style>body{margin:0;background:${background};font:14px sans-serif}*{box-sizing:border-box}${css}</style>${renderToStaticMarkup(boxes)}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `recipes-${phase}${suffix}-dpr${dpr}.png`) });
      const selector = phase === "before" ? ".nse-control-rounded-box" : ".nse-box";
      measurements.push({ phase, scheme, dpr, recipes: await page.locator(selector).evaluateAll(es => es.map(e => ({ text: e.textContent, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, slice: getComputedStyle(e).borderImageSlice, shadow: getComputedStyle(e).boxShadow }))) });
      if (phase === "after") {
        const slices = await page.locator(selector).evaluateAll(es => es.map(e => getComputedStyle(e).borderImageSlice));
        assert.deepEqual(slices, ["14", "18 fill", "18 fill"]);
      }
      await page.setViewportSize({ width: 320, height: 180 });
      const narrow = h("div", { ...appearance, style: { padding: 32 } }, h("div", { style: { width: 140, outline: "1px dashed #697786" } }, box({}, "Quick note")));
      await page.setContent(`<style>body{margin:0;background:${background};font:14px sans-serif}*{box-sizing:border-box}${css}</style>${renderToStaticMarkup(narrow)}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `narrow-${phase}${suffix}${dpr === 1 ? "" : "-dpr2"}.png`) });
      const width = await page.locator(selector).evaluate(e => e.getBoundingClientRect().width);
      if (phase === "before") assert.equal(width, 180);
      else assert(width <= 140, "A custom box must fit the available width.");
      measurements.push({ phase, scheme, dpr, availableWidth: 140, boxWidth: width });
      await context.close();
    }
  }
  const context = await browser.newContext({ viewport: { width: 760, height: 320 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const samples = h("div", { "data-nse-appearance": "atmo", style: { padding: 32, display: "flex", gap: 24, alignItems: "start" } },
    h(after.NSEBox, { "aria-label": "Custom", boxType: "custom", fillColor: "#ffeed0", borderColor: "#6b4b1e", borderWidth: 2, cornerRadius: 18, cornerCurve: "continuous", contentViewMargins: { width: 12, height: 8 }, style: { width: 200 } }, "Custom properties"),
    h(after.NSEBox, { "aria-label": "Transparent", boxType: "custom", fillColor: "red", isTransparent: true, style: { width: 200 } }, "Transparent interior"),
    h(after.NSEView, { "data-testid": "shadow", cornerRadius: 18, cornerCurve: "continuous", shadow: new after.NSEShadow({ shadowColor: "#0006", shadowOffset: { width: 0, height: -4 }, shadowBlurRadius: 12 }), style: { width: 200, padding: 20, background: "#bfd8ed" } }, h("button", null, "Focus")));
  await page.setContent(`<style>body{margin:0;background:#e8edf2;font:14px sans-serif}*{box-sizing:border-box}${styles(afterRoot)}</style>${renderToStaticMarkup(samples)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const properties = await page.getByRole("group", { name: "Custom" }).evaluate(e => ({ border: getComputedStyle(e).borderWidth, fill: getComputedStyle(e).backgroundColor, curve: getComputedStyle(e).getPropertyValue("corner-shape"), radius: getComputedStyle(e).borderRadius }));
  assert.equal(properties.border, "2px");
  assert.equal(properties.fill, "rgb(255, 238, 208)");
  assert.equal(properties.curve, "squircle");
  assert.equal(properties.radius, "18px");
  assert.equal(await page.getByRole("group", { name: "Transparent" }).evaluate(e => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Focus" }).focus();
  assert.equal(await page.locator("[data-testid=shadow]").evaluate(e => getComputedStyle(e).clipPath), "none");
  await page.screenshot({ path: path.join(out, "properties-after-dpr2.png") });
  await page.emulateMedia({ forcedColors: "active" });
  assert.equal(await page.locator("[data-testid=shadow]").evaluate(e => getComputedStyle(e).boxShadow), "none");
  await page.screenshot({ path: path.join(out, "properties-forced-colours-dpr2.png") });
  measurements.push({ properties, forcedColourShadow: "none", focusedButton: true });
  await context.close();
  await browser.close();
  fs.writeFileSync(path.join(out, "measurements.json"), JSON.stringify(measurements, null, 2) + "\n");
  console.log(JSON.stringify(measurements));
}
main().catch(error => { console.error(error); process.exit(1); });
