const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const site = path.resolve(__dirname, '../../../../../site');
const { chromium } = createRequire(path.join(site, 'package.json'))('playwright');
const phase = process.argv[2] || 'before';
const output = path.join(__dirname, phase);
fs.mkdirSync(output, { recursive: true });

// QA: both layouts, appearances and motion preferences; opening, dog-ear
// buttons, edge swipes, upper/lower corner drags, cancellation and completion.
// Each drag is held before release so velocity cannot mask the snap threshold.
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const phone of [false, true]) for (const colour of ['light', 'dark']) for (const motion of ['no-preference', 'reduce']) {
    const name = `${phone ? 'phone' : 'desktop'}-${colour}-${motion}`;
    if (process.argv[3] && name !== process.argv[3]) continue;
    const folder = path.join(output, name);
    fs.mkdirSync(folder, { recursive: true });
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: colour });
    const page = await context.newPage();
    // Pin each test to the modules it loaded. Shared-worktree HMR or another
    // session restarting Vite must not erase a held book mid-capture. This
    // changes only Vite's development reloader in this browser context.
    if (phase === 'after') await page.route('**/@vite/client', async route => {
      const response = await route.fetch();
      const body = await response.text();
      const marker = 'async function handleMessage(payload) {';
      if (!body.includes(marker)) throw new Error('Vite client reloader shape changed');
      const pinned = body.replace(marker, `${marker}\n if (['update', 'full-reload', 'prune'].includes(payload.type)) return;`)
        .replace(/(?:window\.)?location\.reload\(\)/g, 'void 0');
      await route.fulfill({ response, body: pinned, contentType: 'text/javascript' });
    });
    await page.emulateMedia({ reducedMotion: motion });
    const errors = [];
    const consoleErrors = [];
    const failedRequests = [];
    const receipt = JSON.parse(fs.readFileSync(path.join(site, 'vendor/framework-receipt.json'), 'utf8'));
    page.on('pageerror', error => { errors.push(String(error)); fs.writeFileSync(path.join(folder, 'errors.json'), JSON.stringify(errors)); });
    page.on('crash', () => { errors.push('Page crashed'); fs.writeFileSync(path.join(folder, 'errors.json'), JSON.stringify(errors)); });
    page.on('console', message => { if (message.type() === 'error') { consoleErrors.push(message.text()); fs.writeFileSync(path.join(folder, 'console-errors.json'), JSON.stringify(consoleErrors, null, 2)); } });
    page.on('requestfailed', request => { failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }); fs.writeFileSync(path.join(folder, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2)); });
    const navigations = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push({ url: frame.url(), time: Date.now() }); });
    await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fportfolio');
    await page.locator('.book[data-artifact-id="cirrus-icons"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const reader = page.locator('[data-portfolio-reader]');
    const states = [];
    const baselinePath = path.join(__dirname, 'before', name, 'states.json');
    const baseline = phase === 'after' && fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')).states : [];
    async function capture(label) {
      if (!await reader.count()) {
        fs.writeFileSync(path.join(folder, 'interrupted.json'), JSON.stringify({ label, url: page.url(), errors, navigations, body: (await page.locator('body').innerText()).slice(0, 4000) }, null, 2));
        throw new Error(`Reader disappeared at ${name}/${label}; see interrupted.json`);
      }
      await page.screenshot({ path: path.join(folder, `${label}.png`), scale: 'css' });
      states.push({ label, page: await reader.getAttribute('data-current-page'), phase: await reader.getAttribute('data-phase'), leaves: await reader.locator('.nse-page').evaluateAll(es => es.map(e => ({ direction: e.dataset.direction, progress: e.dataset.progress, phase: e.dataset.phase, corner: e.dataset.corner, renderer: e.dataset.curlRenderer, surface: e.dataset.curlSurface, reduced: e.dataset.reduced }))) });
      states.at(-1).focus = await page.evaluate(() => ({ html: document.activeElement?.outerHTML.slice(0, 300), insideReader: Boolean(document.activeElement?.closest('[data-portfolio-reader]')), inert: Boolean(document.activeElement?.closest('[inert]')) }));
      if (motion === 'no-preference' && label.endsWith('settled') && states.at(-1).leaves.some(leaf => Number(leaf.progress) >= .999)) throw new Error(`A completed leaf did not lie flat at ${name}/${label}`);
    }
    await page.locator('.book[data-artifact-id="cirrus-icons"]').dblclick();
    await reader.waitFor();
    await capture('00-opening');
    await page.waitForTimeout(1100);
    await capture('01-open');
    async function button(direction, label) {
      await reader.locator(`:is(.portfolio-reader__turn--${direction}, .nse-page-controller__leaf--${direction}) .nse-page__dogear`).click();
      await page.waitForTimeout(220);
      await capture(`${label}-moving`);
      await page.waitForTimeout(1000);
      await capture(`${label}-settled`);
    }
    await button('forward', '02-button-forward');
    await button('backward', '03-button-backward');
    async function drag(direction, corner, fraction, label) {
      const target = baseline.find(state => state.label === `${label}-held`)?.page;
      for (let attempts = 0; target && await reader.getAttribute('data-current-page') !== target && attempts < 4; attempts++) {
        const step = Number(await reader.getAttribute('data-current-page')) < Number(target) ? 'forward' : 'backward';
        await reader.locator(`.nse-page-controller__leaf--${step} > .nse-page__dogear`).click();
        await page.waitForTimeout(1100);
      }
      const leaf = reader.locator(`:is(.portfolio-reader__turn--${direction}, .nse-page-controller__leaf--${direction})`);
      const box = await leaf.boundingBox();
      const x = direction === 'forward' ? box.x + box.width - 3 : box.x + 3;
      const y = corner === 'top' ? box.y + 12 : corner === 'bottom' ? box.y + box.height - 12 : box.y + box.height * .52;
      const dx = box.width * fraction * (direction === 'forward' ? -1 : 1);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + (corner === 'top' ? 35 : corner === 'bottom' ? -35 : 0), { steps: 24 });
      await page.waitForTimeout(240);
      await capture(`${label}-held`);
      await page.mouse.up();
      await page.waitForTimeout(180);
      await capture(`${label}-released`);
      await page.waitForTimeout(1100);
      await capture(`${label}-settled`);
    }
    await drag('forward', 'edge', 1.4, '04-edge-forward');
    await drag('backward', 'edge', 1.4, '05-edge-backward');
    await drag('forward', 'top', .5, '06-corner-half');
    // Return to the first spread/page using the visible backward control.
    if (Number(await reader.getAttribute('data-current-page')) > 1) await button('backward', '07-return');
    await drag('forward', 'bottom', .08, '08-corner-below');
    await drag('forward', 'bottom', 1.65, '09-corner-above');
    await drag('backward', 'top', .08, '10-back-corner-below');
    await drag('backward', 'top', 1.65, '11-back-corner-above');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1100);
    const record = { name, capturedAt: new Date().toISOString(), devHotReload: phase !== 'after', viewport: phone ? '390x844' : '1440x900', dpr: 1, frameworkCommit: receipt.commit, archiveSha256: receipt.archiveSha256, errors, consoleErrors, failedRequests, navigations, states, closed: await reader.count() === 0 };
    if (!record.closed) {
      record.closeDiagnostics = { url: page.url(), focus: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 400)), body: (await page.locator('body').innerText()).slice(-1200) };
      await reader.focus();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1100);
      record.closedAfterRefocus = await reader.count() === 0;
    }
    results.push(record);
    fs.writeFileSync(path.join(folder, 'states.json'), JSON.stringify(record, null, 2));
    if (!record.closed) throw new Error(`Escape lost the reader's modal focus in ${name}; see states.json`);
    console.log(name, 'captured', states.length, 'frames;', errors.length, 'errors');
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
