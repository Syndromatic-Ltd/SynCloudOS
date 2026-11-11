/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */


// Complementary deterministic frame sequence. Real app, renderer and native
// effects; Playwright's clock advances RAF and native effects are paused/seeked
// to the same time so screenshot readback cannot stretch the capture cadence.
import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { freezeHMR } from "../2026-11-07-about-repair/freeze-hmr.mjs";
const directory = fileURLToPath(new URL("./", import.meta.url));
const prefix = process.argv[2] ?? "faithful";
const browser = await chromium.launch();
const errors = [], result = { method: "Playwright clock plus paused native timeline seek; live compositor playback is recorded separately in motion.json", errors };
result.startupRetries=[];
async function openAbout(page){
  for(let attempt=0;;attempt++)try{
    await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout",{waitUntil:"domcontentloaded",timeout:120000});return;
  }catch(error){
    if(attempt>=3||!/ERR_CONNECTION_(REFUSED|RESET)/.test(String(error)))throw error;
    result.startupRetries.push(String(error));await new Promise(resolve=>setTimeout(resolve,2000));
  }
}
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
  await openAbout(page);
  await page.locator('.about-pane').waitFor({timeout:120000});
  await page.evaluate(()=>document.fonts.ready);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (let index = 0; index < 2; index++) { await page.clock.fastForward(4000); await page.evaluate(() => window.__seekNativeArtwork()); }
    const folder = `${prefix}-${reduced ? "reduced-controlled" : "tab-controlled"}`;
    mkdirSync(join(directory, folder), { recursive: true });
    const samples = [];
    await page.locator('.about-app [role="tab"]:visible').nth(1).click({ force: true });
    for (let index = 0; index <= (reduced ? 8 : 19); index++) {
      if (index) await page.clock.runFor(reduced ? 40 : 80);
      await page.evaluate(() => window.__seekNativeArtwork());
      const name = `${folder}/${String(index).padStart(2, "0")}.png`;
      await page.screenshot({ path: join(directory, name) });
      samples.push({ time: index * (reduced ? 40 : 80), name, panes: await page.evaluate(() => [...document.querySelectorAll(".about-pane")].map(element => {
        const artwork=element.querySelector('.about-hero-image')??element.querySelector('.about-hero-art img');
        const rect=artwork.getBoundingClientRect();
        return {section:element.dataset.section,opacity:Number(getComputedStyle(element).opacity),x:element.getBoundingClientRect().x,transform:getComputedStyle(element).transform,
          art:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,opacity:Number(getComputedStyle(artwork).opacity),transform:getComputedStyle(artwork).transform}};
      })) });
    }
    result[reduced ? "reduced" : "standard"] = samples;
    await page.close();
  }
  writeFileSync(join(directory, `${prefix}-controlled-motion.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ errors, standard: result.standard, reduced: result.reduced }, null, 2));
} finally { await browser.close(); }
