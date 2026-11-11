import { chromium } from "../../../../node_modules/playwright/index.mjs";
import sharp from "sharp";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { freezeHMR } from "./freeze-hmr.mjs";

const directory = fileURLToPath(new URL("./", import.meta.url));
const baseline = "C:/Users/Kavish Krishnakumar/AppData/Local/Temp/claude/C--Users-Kavish-Krishnakumar/cf6d67a8-095b-4276-8632-0a5bf1e8dd9d/scratchpad/sweep/about-baseline";
const tabs = ["company", "framework", "team"];
const browser = await chromium.launch();
const errors = [];
const result = { viewports: {}, transitions: [], floor: {}, reduced: [], errors };
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
async function state(page) {
  return page.evaluate(() => ({ at: performance.now(), panes: [...document.querySelectorAll(".about-pane")].map(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    const art = element.querySelector(".about-hero-art img");
    return { section: element.dataset.section, opacity: Number(style.opacity), transform: style.transform, x: rect.x, width: rect.width,
      art: art ? { width: art.getBoundingClientRect().width, transform: getComputedStyle(art).transform, opacity: getComputedStyle(art).opacity } : null,
      native: element.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime,
        timing: { ...animation.effect.getTiming(), iterations: String(animation.effect.getTiming().iterations) }, frames: animation.effect.getKeyframes() })),
    };
  }) }));
}
async function screenshot(page, name) { await page.screenshot({ path: join(directory, name) }); }
function observe(page, label) {
  page.on("pageerror", error => errors.push({ label, type: "pageerror", text: error.message }));
  page.on("console", message => { if (message.type() === "error") errors.push({ label, type: "console", text: message.text() }); });
}
async function open(context, label) {
  const page = await context.newPage(); observe(page, label);
  await freezeHMR(page);
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" });
  await page.locator(".about-pane").waitFor();
  await page.waitForTimeout(3200);
  return page;
}
try {
  for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await open(context, device);
    result.viewports[device] = [];
    for (let index = 0; index < tabs.length; index++) {
      if (index) { await page.locator('[role="tab"]:visible').nth(index).click(); await page.waitForTimeout(2200); }
      const name = `${device}-${tabs[index]}.png`;
      await screenshot(page, name);
      copyFileSync(join(baseline, name), join(directory, `baseline-${name}`));
      await sharp({ create: { width: viewport.width * 2, height: viewport.height, channels: 3, background: "#000" } })
        .composite([{ input: join(baseline, name), left: 0, top: 0 }, { input: join(directory, name), left: viewport.width, top: 0 }])
        .png().toFile(join(directory, `compare-${name}`));
      result.viewports[device].push({ section: tabs[index], ...await state(page) });
    }
    if (device === "desktop") {
      await page.locator('[role="tab"]:visible').nth(0).click(); await page.waitForTimeout(2000);
      mkdirSync(join(directory, "tab-frames"), { recursive: true });
      const cdp = await context.newCDPSession(page);
      await page.locator('[role="tab"]:visible').nth(1).click();
      const start = Date.now();
      for (let index = 0; index <= 19; index++) {
        await sleep(index * 80 - (Date.now() - start));
        const sample = await state(page);
        const image = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, captureBeyondViewport: false });
        const name = `tab-frames/${String(index).padStart(2, "0")}.png`;
        writeFileSync(join(directory, name), Buffer.from(image.data, "base64"));
        result.transitions.push({ elapsed: Date.now() - start, name, ...sample });
      }
      await page.waitForTimeout(1200);
      for (const index of [2, 0, 1, 0]) { await page.locator('[role="tab"]:visible').nth(index).click(); await page.waitForTimeout(1700); }
      const floorState = () => page.evaluate(() => {
        const floor = document.querySelector(".about-scene-floor"), dots = document.querySelector(".about-scene-floor-dots");
        return { floorTransform: getComputedStyle(floor).transform, clipping: getComputedStyle(floor).overflow,
          dotsTransform: getComputedStyle(dots).transform, native: dots.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime, iterations: String(animation.effect.getTiming().iterations) })) };
      });
      result.floor.before = await floorState(); await screenshot(page, "floor-0.png");
      await page.waitForTimeout(700); result.floor.after = await floorState(); await screenshot(page, "floor-700.png");
      // Headless Chromium may keep background targets visible. Record that
      // fact, then exercise the host's actual visibility listener explicitly.
      const background = await context.newPage(); await background.goto("about:blank"); await background.bringToFront();
      result.floor.backgroundVisibility = await page.evaluate(() => document.visibilityState);
      if (result.floor.backgroundVisibility !== "hidden") {
        result.floor.visibilityProbe = "synthetic document visibility notification (headless targets stay visible)";
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          document.dispatchEvent(new Event("visibilitychange"));
        });
      } else result.floor.visibilityProbe = "real background target";
      await page.waitForTimeout(150); result.floor.hidden = await floorState(); await page.waitForTimeout(350); result.floor.hiddenLater = await floorState();
      await background.close(); await page.bringToFront();
      await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); });
      await page.waitForTimeout(350); result.floor.resumed = await floorState();
      await page.locator(".about-pane-scroll").evaluate(element => { element.scrollTop = 650; element.dispatchEvent(new Event("scroll")); });
      await page.waitForTimeout(1500); await screenshot(page, "desktop-scrolled.png");
      result.scroll = await page.locator(".about-pane-scroll").evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
      await page.locator(".about-pane-scroll").evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
      await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(500);
      mkdirSync(join(directory, "reduced-frames"), { recursive: true });
      await page.locator('[role="tab"]:visible').nth(1).click();
      const reducedStart = Date.now();
      for (let index = 0; index < 8; index++) {
        await sleep(index * 40 - (Date.now() - reducedStart));
        const sample = await state(page);
        const image = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, captureBeyondViewport: false });
        const name = `reduced-frames/${String(index).padStart(2, "0")}.png`;
        writeFileSync(join(directory, name), Buffer.from(image.data, "base64"));
        result.reduced.push({ elapsed: Date.now() - reducedStart, name, ...sample });
      }
      await page.waitForTimeout(500); result.floor.reduced = await floorState();
    }
    await context.close();
  }
  writeFileSync(join(directory, "browser.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ errors, transitions: result.transitions.length, reduced: result.reduced.length, floor: result.floor, scroll: result.scroll }, null, 2));
} finally { await browser.close(); }
