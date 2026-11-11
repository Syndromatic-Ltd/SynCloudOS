// Server-free rendering probe: bundles the real component, CSS and Floating UI
// into a blank Playwright page. Does not acquire or touch a listening port.
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const output = new URL("../../artifacts/nse-popover/", import.meta.url);
const screenshotPath = name => fileURLToPath(new URL(name, output));
await mkdir(output, { recursive: true });
const bundle = await build({ entryPoints: ["tests/e2e/fixtures/nse-popover.tsx"], bundle: true, write: false, outdir: "artifacts/nse-popover", format: "iife", platform: "browser", jsx: "automatic", loader: { ".css": "empty" }, define: { "process.env.NODE_ENV": '"development"', "import.meta.env.DEV": "true" } });
// Atmo as it loads: control structure, then every Atmo.scostheme stylesheet in theme.css order.
const bundle = "src/Themes/Atmo.scostheme/Contents/Resources/";
const atmoFiles = [...(await readFile(bundle + "theme.css", "utf8")).matchAll(/@import "\.\/([^"]+)";/gu)].map(match => bundle + match[1]);
const css = (await Promise.all(["src/NSE/Overlays/nse-overlays.css", "src/NSE/Structure/controls.css", ...atmoFiles].map(path => readFile(path, "utf8")))).join("\n");
const fixtureCSS = `body{margin:0;background:#9ba8b5;font:14px system-ui}h2{font-size:17px;margin:0 0 8px}p{margin:0 0 16px}label{display:grid;gap:6px}input{font:inherit;padding:7px;border-radius:5px;border:1px solid #999;background:#fff;color:#222}.done{margin-top:16px;float:right;padding:5px 22px;border:1px solid #5b6571;border-radius:5px;background:linear-gradient(#fcfcfc,#c9c9c9);color:#222}#anchor{border-radius:6px;border:1px solid #5b6571;background:linear-gradient(#fcfcfc,#c9c9c9)}.paper{padding:22px;background:#efe2c6;color:#55462d;font-family:Georgia,serif}.paper h2{font-size:20px}.nse-appearance-provider{min-height:100vh}`;
const report = [];
for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await launcher.launch();
  try {
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: dpr });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.setContent('<div id="root"></div>');
      await page.addStyleTag({ content: css + fixtureCSS });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const surface = page.locator("#browser-popover");
      await surface.waitFor({ state: "visible" });
      await page.waitForFunction(() => document.querySelector("#browser-popover")?.getAnimations().length > 0);
      const opening = await surface.evaluate(node => node.getAnimations().map(animation => ({ name: animation.animationName, duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes() })));
      assert(opening.some(animation => animation.name === "nse-popover-scale-in" && animation.duration === 320));
      const scales = await surface.evaluate(node => {
        const animation = node.getAnimations().find(candidate => candidate.animationName === "nse-popover-scale-in");
        animation.pause();
        const values = [0, 180, 320].map(time => { animation.currentTime = time; return new DOMMatrixReadOnly(getComputedStyle(node).transform).a; });
        animation.currentTime = 0; animation.play(); return values;
      });
      assert(Math.abs(scales[0] - 0.85) < 0.001 && scales[1] > 1 && scales[1] < 1.02 && scales[2] === 1);
      await page.waitForFunction(() => document.querySelector("#browser-popover")?.getAnimations().every(animation => animation.playState === "finished"));
      const geometry = async () => surface.evaluate(node => {
        const rect = node.getBoundingClientRect(); const arrow = node.querySelector('[data-nse-part="arrow"]'); const anchor = document.getElementById("anchor").getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, placement: node.dataset.placement, arrowX: parseFloat(arrow?.style.left), arrowY: parseFloat(arrow?.style.top), anchorX: anchor.x + anchor.width / 2, anchorY: anchor.y + anchor.height / 2, anchorTop: anchor.top, anchorBottom: anchor.bottom, origin: getComputedStyle(node).transformOrigin, fill: getComputedStyle(node.querySelector('[data-nse-part="popover-outline"]')).fill, outline: node.querySelector('[data-nse-part="popover-outline"]').getAttribute("d") };
      });
      const light = await geometry(); assert.equal(light.fill, "rgb(230, 229, 229)");
      await page.screenshot({ path: screenshotPath(`${engine}-${dpr}-light.png`) });
      const animation = await surface.evaluate(node => node.getAnimations().find(animation => animation.animationName === "nse-popover-scale-in")?.startTime);
      await page.evaluate(() => window.popoverFixture.set({ x: 910, y: 660 }));
      await page.waitForFunction(() => document.querySelector("#browser-popover")?.dataset.placement === "top");
      const flipped = await geometry(); assert(flipped.x >= 8 && flipped.x + flipped.width <= 992); assert(Math.abs(flipped.x + flipped.arrowX + 10 - flipped.anchorX) < 1);
      assert.equal(await surface.evaluate(node => node.getAnimations().find(animation => animation.animationName === "nse-popover-scale-in")?.startTime), animation, "reposition must not replay entry");
      await page.evaluate(() => window.popoverFixture.set({ dark: true, x: 440, y: 160 }));
      await page.waitForFunction(() => document.querySelector("#browser-popover")?.dataset.mode === "dark");
      const dark = await geometry(); assert.equal(dark.fill, "rgb(38, 44, 52)");
      await page.screenshot({ path: screenshotPath(`${engine}-${dpr}-dark.png`) });
      await page.evaluate(() => window.popoverFixture.set({ paper: true }));
      await page.waitForFunction(() => document.querySelector("#browser-popover")?.style.getPropertyValue("--nse-popover-arrow-fill") === "#efe2c6");
      assert.equal((await geometry()).fill, "none");
      assert.equal(await surface.locator('[data-nse-part="popover-arrow-fill"]').evaluate(node => getComputedStyle(node).fill), "rgb(239, 226, 198)");
      await page.screenshot({ path: screenshotPath(`${engine}-${dpr}-paper.png`) });
      await page.evaluate(() => window.popoverFixture.set({ paper: false, tall: true, x: 300, y: 300, region: { x: 0, y: 80, width: 420, height: 560 } }));
      try {
        await page.waitForFunction(() => { const node = document.querySelector("#browser-popover"); return node?.getBoundingClientRect().height <= 544 && node.getBoundingClientRect().width <= 404; }, null, { timeout: 3000 });
      } catch (error) {
        console.error(await surface.evaluate(node => ({ outer: node.outerHTML.slice(0, 2000), style: { maxHeight: getComputedStyle(node).maxHeight, maxWidth: getComputedStyle(node).maxWidth, height: getComputedStyle(node).height, width: getComputedStyle(node).width } })));
        throw error;
      }
      const constrained = await geometry(); assert(constrained.x >= 8 && constrained.y >= 88 && constrained.x + constrained.width <= 412 && constrained.y + constrained.height <= 632);
      assert(constrained.placement === "top" ? constrained.y + constrained.height <= constrained.anchorTop : constrained.y >= constrained.anchorBottom, "sizing must keep the arrow beside its anchor, rather than shifting the plate over it");
      assert.equal(await surface.evaluate(node => node.style.getPropertyValue("--nse-popover-arrow-fill")), "", "removed content paint must not inherit its previous fill");
      await page.evaluate(() => window.popoverFixture.set({ open: false, reducedMotion: true, tall: false, region: undefined }));
      await surface.waitFor({ state: "detached" });
      await page.evaluate(() => window.popoverFixture.set({ open: true }));
      await surface.waitFor({ state: "visible" });
      const reduced = await surface.evaluate(node => node.getAnimations().map(animation => ({ name: animation.animationName, frames: animation.effect.getKeyframes() })));
      assert(reduced.every(animation => animation.frames.every(frame => !frame.transform)));
      await page.evaluate(() => window.popoverFixture.set({ open: false, reducedMotion: false }));
      await surface.waitFor({ state: "detached" });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => window.popoverFixture.set({ open: true }));
      await surface.waitFor({ state: "visible" });
      assert(await surface.evaluate(node => node.getAnimations().every(animation => animation.effect.getKeyframes().every(frame => !frame.transform))));
      await page.evaluate(() => window.popoverFixture.set({ mounted: false }));
      await page.locator('.nse-popover[data-state="closing"][inert][aria-hidden="true"]').waitFor();
      await page.locator(".nse-popover").waitFor({ state: "detached" });
      assert.deepEqual(errors, []);
      report.push({ engine, dpr, light, dark, flipped, constrained, opening, scales, reduced, errors });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 640 } });
    await page.setContent('<div id="root"></div>'); await page.addStyleTag({ content: css + fixtureCSS }); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const surface = page.locator("#browser-popover"); await surface.waitFor({ state: "visible" });
    assert.equal(await surface.getAttribute("data-nse-overlay-kind"), "action-sheet"); assert.equal(await surface.locator('[data-nse-part="arrow"]').count(), 0);
    await page.screenshot({ path: screenshotPath(`${engine}-compact.png`) });
    await page.close();
  } finally { await browser.close(); }
}
await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2));
console.log(`Passed ${report.length} desktop engine/DPR cases and 3 compact cases. Evidence: artifacts/nse-popover`);
