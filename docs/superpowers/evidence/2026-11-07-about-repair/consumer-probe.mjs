import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import { freezeHMR } from "./freeze-hmr.mjs";
const browser = await chromium.launch();
const results = [];
try {
  for (const [route, viewport] of [["/journal", { width: 390, height: 844 }], ["/journal-old", { width: 390, height: 844 }], ["/memo-journal", { width: 1440, height: 900 }], ["/portfolio", { width: 1440, height: 900 }], ["/", { width: 1440, height: 900 }]]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(30000);
    await freezeHMR(page);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => {
      window.__nativeArtwork = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        window.__nativeArtwork.push({ className: this.className, frames, options });
        return animate.call(this, frames, options);
      };
    });
    const startupRetries = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`http://127.0.0.1:5199/__dev/login?to=${encodeURIComponent(route)}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      if (!errors.some(error => error.includes("Outdated Optimize Dep"))) break;
      startupRetries.push({ attempt, errors: errors.splice(0) });
    }
    const actions = [];
    const springSamples = [];
    if (route === "/journal") {
      const all = page.getByRole("button", { name: "All Notes", exact: true });
      if (await all.count()) await all.click();
      await page.waitForTimeout(400);
      const row = page.getByRole("option", { name: /Webspring 4.0 enters first implementation/ });
      const back = page.getByRole("button", { name: "Back to Notes", exact: true });
      if (!await row.count() && await back.count()) { await back.click(); await page.waitForTimeout(400); }
      if (await row.count()) { await row.click(); actions.push("Opened a published post from the compact note list"); }
      else actions.push("Inspected compact panes; no published-note option available in this browser context");
    } else if (route === "/journal-old") {
      const back = page.getByRole("button", { name: /Back to folders/i });
      if (await back.count()) { await back.click(); await page.waitForTimeout(400); }
      const all = page.getByRole("button", { name: "All Notes", exact: true });
      if (await all.count()) { await all.click(); actions.push("Animated from folders to the empty legacy note list"); }
      else actions.push("Inspected the legacy note list without seed posts");
    } else if (route === "/portfolio") {
      await page.getByRole("button", { name: "Collections", exact: true }).click(); actions.push("Opened the collections card spring");
      for (const delay of [0, 80, 160, 180]) {
        await page.waitForTimeout(delay);
        springSamples.push(await page.locator(".collections-popover").evaluate(element => ({ opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform })));
      }
    } else if (route === "/") {
      const about = page.getByRole("button", { name: "About", exact: true });
      if (await about.count()) { await about.click(); actions.push("Launched About through the dial icon and orb choreography"); }
      else actions.push("Inspected shell projection; no About button exposed in this browser context");
    }
    await page.waitForTimeout(1200);
    results.push({ route, errors, startupRetries, actions, springSamples, buttons: await page.getByRole("button").allTextContents(), native: await page.evaluate(() => window.__nativeArtwork),
      owners: await page.locator(".site-animation-owner").count(), text: (await page.locator("body").innerText()).slice(-2500) });
    await page.close();
  }
  writeFileSync(new URL("consumer-probe.json", import.meta.url), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(result => ({ route: result.route, errors: result.errors, owners: result.owners, buttons: result.buttons, native: result.native.length })), null, 2));
} finally { await browser.close(); }
