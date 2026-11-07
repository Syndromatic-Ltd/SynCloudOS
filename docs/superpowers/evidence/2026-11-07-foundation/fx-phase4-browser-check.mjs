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

import { createServer } from "vite";
import { chromium, firefox, webkit } from "playwright";
import { writeFileSync } from "node:fs";

const directory = "docs/superpowers/evidence/2026-11-07-foundation";
const server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: true, headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } } });
await server.listen();
const port = server.httpServer.address().port;
const results = [];
try {
  for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
    if (process.env.FX_PHASE4_ENGINE && process.env.FX_PHASE4_ENGINE !== engine) continue;
    const browser = await launcher.launch({ headless: process.env.FX_PHASE4_HEADED !== "1", ...(engine === "chromium" ? { args: ["--enable-usermedia-screen-capturing", "--allow-http-screen-capture", "--auto-select-tab-capture-source-by-title=SynCloudOS FX verification", "--auto-accept-this-tab-capture"] } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 900, height: 650 } }), page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${port}/${directory}/fx-phase4-browser.html`);
      await page.waitForFunction(() => !!window.capabilityVerification);
      const call = method => page.evaluate(method => window.capabilityVerification[method](), method).catch(error => ({ error: { message: error.message } }));
      const capabilities = await call("capabilities");
      const preparation = await call("prepare"); await page.locator("video").click();
      const pip = await call("pipStart"), pipStop = pip.active ? await call("pipStop") : null;
      await page.locator("video").click(); const speech = await call("speech");
      const routes = await call("routes"), category = await call("category");
      await context.setOffline(true); await page.waitForTimeout(100); await context.setOffline(false); await page.waitForTimeout(100);
      const paths = await page.evaluate(() => window.capabilityVerification.paths);
      let location = { skipped: "No emulated speed override in this engine." };
      if (engine === "chromium") {
        await context.grantPermissions(["geolocation"]);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setGeolocationOverride", { latitude: 53.48, longitude: -2.24, accuracy: 5, speed: 12.5 });
        location = { emulated: true, ...await call("location") };
      }
      let element = { skipped: "No portable automatic native screen chooser for this engine." };
      if (engine === "chromium") { await page.locator("video").click(); element = await Promise.race([call("element"), new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), 10000))]); }
      await page.screenshot({ path: `${directory}/fx-phase4-${engine}-native-media.png` });
      await call("dispose");
      results.push({ engine, capabilities, preparation, pip, pipStop, speech, routes, category, paths, location, element, errors });
      console.log(JSON.stringify(results.at(-1)));
    } finally { await browser.close(); }
  }
} finally { await server.close(); writeFileSync(`${directory}/fx-phase4-browser-results${process.env.FX_PHASE4_HEADED === "1" ? "-headed" : ""}.json`, JSON.stringify(results, null, 2) + "\n"); }
