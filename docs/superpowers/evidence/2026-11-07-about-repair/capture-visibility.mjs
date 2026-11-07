import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import { freezeHMR } from "./freeze-hmr.mjs";
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await freezeHMR(page);
  page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" }); await page.waitForTimeout(2200);
  const state = () => page.locator(".about-scene-floor-dots").evaluate(element => ({ transform: getComputedStyle(element).transform,
    native: element.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime, iterations: String(animation.effect.getTiming().iterations) })) }));
  const result = { method: "Synthetic visibility notification; await native.ready before checking the suspended interval", errors, before: await state() };
  await page.evaluate(async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.all(document.querySelector(".about-scene-floor-dots").getAnimations().map(animation => animation.ready));
  });
  result.hidden = await state(); await page.waitForTimeout(400); result.hiddenLater = await state();
  await page.evaluate(async () => {
    delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange"));
    await Promise.all(document.querySelector(".about-scene-floor-dots").getAnimations().map(animation => animation.ready));
  });
  await page.waitForTimeout(400); result.resumed = await state();
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(200); result.reduced = await state();
  writeFileSync(new URL("visibility.json", import.meta.url), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
