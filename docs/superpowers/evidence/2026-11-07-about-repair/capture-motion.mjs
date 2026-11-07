import { chromium } from "../../../../node_modules/playwright/index.mjs";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { freezeHMR } from "./freeze-hmr.mjs";
const directory = fileURLToPath(new URL("./", import.meta.url));
const browser = await chromium.launch();
const errors = [];
const captures = {};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await freezeHMR(page);
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const cdp = await context.newCDPSession(page);
  for (const reduced of [false, true]) {
    await page.locator('[role="tab"]:visible').nth(0).click(); await page.waitForTimeout(1600);
    if (reduced) { await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(400); }
    const frames = [];
    const listener = event => { frames.push({ time: event.metadata.timestamp, bytes: Buffer.from(event.data, "base64") }); void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }); };
    cdp.on("Page.screencastFrame", listener);
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1, maxWidth: 960, maxHeight: 600 });
    await page.waitForTimeout(250);
    const start = await page.evaluate(({ reduced }) => {
      const started = performance.now();
      window.__motionSamples = [];
      const sample = () => window.__motionSamples.push({ elapsed: performance.now() - started,
        panes: [...document.querySelectorAll(".about-pane")].map(element => ({ section: element.dataset.section,
          opacity: Number(getComputedStyle(element).opacity), x: element.getBoundingClientRect().x,
          transform: getComputedStyle(element).transform,
          native: element.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime, frames: animation.effect.getKeyframes(), timing: animation.effect.getTiming() })),
        })) });
      const id = setInterval(sample, reduced ? 20 : 80);
      document.querySelectorAll('[role="tab"]')[1].click(); sample();
      setTimeout(() => clearInterval(id), reduced ? 500 : 1800);
      return Date.now() / 1000;
    }, { reduced });
    await page.waitForTimeout(reduced ? 650 : 2100);
    await cdp.send("Page.stopScreencast"); cdp.off("Page.screencastFrame", listener);
    const samples = await page.evaluate(() => window.__motionSamples);
    const folder = reduced ? "reduced-frames" : "tab-frames";
    const targets = Array.from({ length: reduced ? 8 : 20 }, (_, index) => index * (reduced ? 40 : 80));
    const selected = [];
    const relevant = frames.filter(frame => frame.time >= start - 0.04);
    if (!relevant.length) throw new Error("No screencast frames");
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const closest = relevant.reduce((a, b) => Math.abs((a.time - start) * 1000 - target) < Math.abs((b.time - start) * 1000 - target) ? a : b);
      const name = `${folder}/${String(index).padStart(2, "0")}.png`;
      await sharp(closest.bytes).png().toFile(join(directory, name));
      selected.push({ target, actual: (closest.time - start) * 1000, name });
    }
    captures[reduced ? "reduced" : "standard"] = { samples, selected, rawFrameTimes: relevant.map(frame => (frame.time - start) * 1000) };
  }
  writeFileSync(join(directory, "motion.json"), JSON.stringify({ errors, ...captures }, null, 2));
  console.log(JSON.stringify({ errors, standard: captures.standard.selected, reduced: captures.reduced.selected }, null, 2));
} finally { await browser.close(); }
