import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); if (message.text().includes("AFXTRACE")) console.log(message.text()); });
await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" });
await page.waitForTimeout(4500);
await page.screenshot({ path: fileURLToPath(new URL("probe-company.png", import.meta.url)) });
await page.locator('[role="tab"]:visible').nth(1).click();
const samples = [];
for (const wait of [0, 80, 160, 160, 240, 500]) {
  await page.waitForTimeout(wait);
  samples.push(await page.evaluate(() => [...document.querySelectorAll('.about-pane, [data-nse-child-transition] > div')].map(element => ({
    section: element.getAttribute("data-section"), className: element.className,
    opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform,
    animations: element.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime, timing: animation.effect.getTiming(), frames: animation.effect.getKeyframes() })),
  }))));
}
writeFileSync(new URL("probe.json", import.meta.url), JSON.stringify({ samples, errors }, null, 2));
console.log(JSON.stringify({ errors, samples: samples.map(s => s.map(e => ({ section: e.section, opacity: e.opacity, transform: e.transform, animations: e.animations.length }))) }, null, 2));
await browser.close();

