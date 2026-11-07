import assert from "node:assert/strict";
import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch(), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(new URL("index.html", import.meta.url).href);
  const comparisons = page.locator('img[src^="compare-"]');
  assert.equal(await comparisons.count(), 6);
  for (const image of await comparisons.all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => element.decode());
    assert(await image.evaluate(element => element.naturalWidth > 0));
  }
  await page.locator("#mode").selectOption("reduced");
  const reducedLabel = await page.locator("#time").innerText(); assert.equal(reducedLabel, "0 ms");
  await page.locator("#image").evaluate(element => element.decode());
  const fullResolutionFrameWidth = await page.locator("#image").evaluate(element => element.naturalWidth); assert.equal(fullResolutionFrameWidth, 1440);
  assert.equal(errors.length, 0);
  const result = { errors, comparisons: 6, reducedLabel, fullResolutionFrameWidth, rapidComparisonImages: await page.locator('img[src^="rapid-"]').count() };
  writeFileSync(new URL("viewer-verification.json", import.meta.url), JSON.stringify(result, null, 2)); console.log(result);
} finally { await browser.close(); }
