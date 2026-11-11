import assert from "node:assert/strict";
import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { freezeHMR } from "./freeze-hmr.mjs";
const browser = await chromium.launch(), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await freezeHMR(page);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.clock.install();
  await page.addInitScript(() => {
    const entries = [], original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      const entry = { animation, start: performance.now(), cancelled: false, finished: false };
      entries.push(entry); animation.pause(); animation.currentTime = 0;
      const cancel = animation.cancel.bind(animation);
      animation.cancel = () => { entry.cancelled = true; cancel(); };
      return animation;
    };
    window.__seekAbout = () => {
      for (const entry of entries) {
        if (entry.cancelled || entry.finished) continue;
        const elapsed = Math.max(0, performance.now() - entry.start), end = entry.animation.effect.getComputedTiming().endTime;
        entry.animation.currentTime = Math.min(elapsed, end);
        if (Number.isFinite(end) && elapsed >= end) { entry.finished = true; entry.animation.finish(); }
      }
    };
  });
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (let index = 0; index < 2; index++) { await page.clock.fastForward(4000); await page.evaluate(() => window.__seekAbout()); }
  await page.locator('[role="tab"]:visible').nth(1).click({ force: true });
  await page.clock.runFor(620); await page.evaluate(() => window.__seekAbout());
  const sample = () => page.evaluate(() => [...document.querySelectorAll(".about-pane")].map(element => ({ section: element.dataset.section,
    opacity: Number(getComputedStyle(element).opacity), x: element.getBoundingClientRect().x, transform: getComputedStyle(element).transform,
    sameLeavingElement: element.dataset.section === "framework" ? element === window.__leavingPane : null,
    native: element.getAnimations().map(animation => ({ frames: animation.effect.getKeyframes(), state: animation.playState, time: animation.currentTime })),
  })));
  await page.evaluate(() => { window.__leavingPane = document.querySelector('.about-pane[data-section="framework"]'); });
  const before = await sample();
  await page.screenshot({ path: fileURLToPath(new URL("rapid-before.png", import.meta.url)) });
  await page.locator('[role="tab"]:visible').nth(2).click({ force: true });
  const after = await sample();
  await page.screenshot({ path: fileURLToPath(new URL("rapid-after.png", import.meta.url)) });
  const a = before.find(pane => pane.section === "framework"), b = after.find(pane => pane.section === "framework");
  assert(a && b && b.sameLeavingElement); assert(Math.abs(a.x - b.x) < 0.01); assert(Math.abs(a.opacity - b.opacity) < 0.001);
  await page.clock.runFor(160); await page.evaluate(() => window.__seekAbout());
  const travelling = await sample();
  await page.clock.runFor(1100); await page.evaluate(() => window.__seekAbout());
  await page.clock.runFor(32); await page.evaluate(() => window.__seekAbout());
  // Finishing a seeked WAAPI effect queues browser rendering/promise work
  // independently of the virtual RAF clock.
  await page.waitForTimeout(120);
  const settled = await sample();
  const holds = await page.evaluate(() => [...document.querySelectorAll('[data-nse-child-transition] > div')].map(element => ({ html: element.outerHTML.slice(0, 160), native: element.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime, end: animation.effect.getComputedTiming().endTime })) })));
  const result = { method: "Real Chromium app and native effects with controlled RAF/native seeking, same as capture-controlled.mjs", errors, before, after, travelling, settled, holds };
  writeFileSync(new URL("rapid-selection.json", import.meta.url), JSON.stringify(result, null, 2));
  assert(travelling.find(pane => pane.section === "framework").opacity < b.opacity);
  assert.equal(settled.length, 1); assert.equal(settled[0].section, "team"); assert.equal(errors.length, 0);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
