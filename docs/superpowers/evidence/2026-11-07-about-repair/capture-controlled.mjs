// Complementary deterministic frame sequence. Real app, renderer and native
// effects; Playwright's clock advances RAF and native effects are paused/seeked
// to the same time so screenshot readback cannot stretch the capture cadence.
import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { freezeHMR } from "./freeze-hmr.mjs";
const directory = fileURLToPath(new URL("./", import.meta.url));
const browser = await chromium.launch();
const errors = [], result = { method: "Playwright clock plus paused native timeline seek; live compositor playback is recorded separately in motion.json", errors };
try {
  for (const reduced of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  await freezeHMR(page);
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.clock.install();
  await page.addInitScript(() => {
    const entries = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      const entry = { animation, start: performance.now(), cancelled: false, finished: false };
      entries.push(entry); animation.pause(); animation.currentTime = 0;
      const cancel = animation.cancel.bind(animation);
      animation.cancel = () => { entry.cancelled = true; cancel(); };
      return animation;
    };
    window.__seekNativeArtwork = () => {
      for (const entry of entries) {
        if (entry.cancelled || entry.finished) continue;
        const elapsed = Math.max(0, performance.now() - entry.start);
        const end = entry.animation.effect.getComputedTiming().endTime;
        entry.animation.currentTime = Math.min(elapsed, end);
        if (Number.isFinite(end) && elapsed >= end) { entry.finished = true; entry.animation.finish(); }
      }
    };
  });
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (let index = 0; index < 2; index++) { await page.clock.fastForward(4000); await page.evaluate(() => window.__seekNativeArtwork()); }
    const folder = reduced ? "reduced-controlled" : "tab-controlled";
    mkdirSync(join(directory, folder), { recursive: true });
    const samples = [];
    await page.locator('[role="tab"]:visible').nth(1).click({ force: true });
    for (let index = 0; index <= (reduced ? 8 : 19); index++) {
      if (index) await page.clock.runFor(reduced ? 40 : 80);
      await page.evaluate(() => window.__seekNativeArtwork());
      const name = `${folder}/${String(index).padStart(2, "0")}.png`;
      await page.screenshot({ path: join(directory, name) });
      samples.push({ time: index * (reduced ? 40 : 80), name, panes: await page.evaluate(() => [...document.querySelectorAll(".about-pane")].map(element => ({ section: element.dataset.section,
        opacity: Number(getComputedStyle(element).opacity), x: element.getBoundingClientRect().x, transform: getComputedStyle(element).transform }))) });
    }
    result[reduced ? "reduced" : "standard"] = samples;
    await page.close();
  }
  writeFileSync(join(directory, "controlled-motion.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ errors, standard: result.standard, reduced: result.reduced }, null, 2));
} finally { await browser.close(); }
