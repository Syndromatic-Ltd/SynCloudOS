import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const mode = process.argv[2];
if (!["normal", "addition"].includes(mode)) throw new Error("Choose normal or addition");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fabout", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: fileURLToPath(new URL(`blend-${mode}.png`, import.meta.url)) });
  const details = page.getByText("Technical details", { exact: true });
  if (await details.count()) await details.click();
  writeFileSync(new URL(`blend-${mode}.json`, import.meta.url), JSON.stringify({ errors, text: await page.locator("body").innerText() }, null, 2));
  if (!errors.length) await page.locator(".about-particles").screenshot({ path: fileURLToPath(new URL(`blend-${mode}-field.png`, import.meta.url)) });
} finally { await browser.close(); }
