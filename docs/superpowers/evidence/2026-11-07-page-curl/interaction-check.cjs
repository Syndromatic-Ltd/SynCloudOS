const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const site = path.resolve(__dirname, '../../../../../site');
const { chromium } = createRequire(path.join(site, 'package.json'))('playwright');
const outputName = process.argv[2] || 'interaction-results';
const dpr = Number(process.argv[3] || 1);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const phone of [false, true]) for (const motion of ['no-preference', 'reduce']) {
      const receipt = JSON.parse(fs.readFileSync(path.join(site, 'vendor/framework-receipt.json'), 'utf8'));
      const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: dpr });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.route('**/@vite/client', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace('async function handleMessage(payload) {', "async function handleMessage(payload) { if (['update', 'full-reload', 'prune'].includes(payload.type)) return;").replace(/(?:window\.)?location\.reload\(\)/g, 'void 0');
        await route.fulfill({ response, body, contentType: 'text/javascript' });
      });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fportfolio');
      await page.locator('.book[data-artifact-id="cirrus-icons"]').dblclick();
      const reader = page.locator('[data-portfolio-reader]');
      await reader.waitFor();
      await page.waitForTimeout(1100);
      const start = Number(await reader.getAttribute('data-current-page'));
      const next = start + (phone ? 1 : 2);
      async function expectPage(expected) {
        await page.waitForFunction(value => document.querySelector('[data-portfolio-reader]')?.getAttribute('data-current-page') === String(value), expected);
        await page.waitForTimeout(750);
        assert.equal(await reader.getAttribute('data-phase'), 'reading');
        assert.equal(await reader.locator('[data-turn-progress]').getAttribute('data-turn-progress'), '0');
      }
      for (let repeat = 0; repeat < 3; repeat++) {
        await page.keyboard.press('ArrowRight'); await expectPage(next);
        await page.keyboard.press('ArrowLeft'); await expectPage(start);
      }
      // Content swipes start outside the engine's 72px edge activation zone.
      const box = await reader.locator('.nse-page-controller__leaf--forward').boundingBox();
      async function swipe(dx, expected) {
        const x = box.x + box.width * .5, y = box.y + box.height * .5;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + dx, y, { steps: 10 }); await page.mouse.up();
        await expectPage(expected);
      }
      await swipe(-60, next); await swipe(60, start);
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => ({ inside: Boolean(document.activeElement?.closest('[data-portfolio-reader]')), inert: Boolean(document.activeElement?.closest('[inert]')) }));
      assert.equal(focus.inside, true); assert.equal(focus.inert, false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      assert.equal(await reader.count(), 0);
      const returnedToShelf = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'grid');
      assert.equal(returnedToShelf, true);
      assert.deepEqual(errors, []);
      results.push({ phone, motion, dpr, checkedAt: new Date().toISOString(), frameworkCommit: receipt.commit, archiveSha256: receipt.archiveSha256, keyboardRoundTrips: 3, contentSwipes: 2, focus, returnedToShelf, errors });
      console.log(phone ? 'phone' : 'desktop', motion, 'passed');
      await context.close();
    }
    fs.writeFileSync(path.join(__dirname, 'after', `${outputName}.json`), JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
