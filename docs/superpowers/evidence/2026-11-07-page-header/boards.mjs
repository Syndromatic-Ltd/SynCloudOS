import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
const root = 'C:/Users/KAVISH~1/AppData/Local/Temp/claude/C--Users-Kavish-Krishnakumar/cf6d67a8-095b-4276-8632-0a5bf1e8dd9d/scratchpad/headermock/project';
const browser = await chromium.launch({ headless: true });
const measurements = {};
for (const [name, width, height] of [['Main',960,600], ['Phone',390,844], ['Prefs',520,560]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // The exported boards contain static markup; support.js is absent from the export.
  await page.setContent((await readFile(`${root}/${name}.dc.html`, 'utf8')).replace('<script src="./support.js"></script>', ''));
  await page.screenshot({ path: fileURLToPath(new URL(`board-${name.toLowerCase()}.png`, import.meta.url)) });
  measurements[name] = await page.locator('h1').evaluate(element => ({ bounds: element.getBoundingClientRect().toJSON(), font: getComputedStyle(element).font, colour: getComputedStyle(element).color }));
  await page.close();
}
await writeFile(new URL('board-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
await browser.close();
