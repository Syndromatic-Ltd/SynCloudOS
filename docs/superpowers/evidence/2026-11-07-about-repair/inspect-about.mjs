import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { freezeHMR } from "./freeze-hmr.mjs";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await freezeHMR(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const startupRetries = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" }); await page.waitForTimeout(1800);
    if (!errors.some(error => error.includes("Outdated Optimize Dep"))) break;
    if (attempt < 2) startupRetries.push({ attempt, errors: errors.splice(0) });
  }
  const result = { errors, startupRetries, text: (await page.locator("body").innerText()).slice(-4000) };
  writeFileSync(new URL("about-final-inspection.json", import.meta.url), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
