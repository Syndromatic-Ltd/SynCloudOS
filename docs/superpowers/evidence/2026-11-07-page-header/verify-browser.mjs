import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const receiptPath = new URL('../../../../../site/vendor/framework-receipt.json', import.meta.url);
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const siteRoot = new URL('../../../../../site/', import.meta.url);
const siteCommit = execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(siteRoot)}).toString().trim();
const sourceFiles = ['src/SynWare/NSEControlGallery.app/Contents/GalleryViews.tsx','src/SynWare/NSEControlGallery.app/Contents/Resources/styles.css'];
async function sourceHashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path,createHash('sha256').update((await readFile(new URL(path,siteRoot),'utf8')).replaceAll('\r\n','\n')).digest('hex')])));
}
const gallerySourceSha256 = await sourceHashes();
const browser = await chromium.launch({ headless: true });
const results = [];
const diagnostics = [];
const target = process.argv[2];
const dpr = Number(process.argv[3] || 1);
const scenarios = [
  ['desktop-light',1440,900,'light'], ['desktop-dark',1440,900,'dark'],
  ['phone-light',390,844,'light'], ['phone-dark',390,844,'dark'],
];
const output = name => fileURLToPath(new URL(name, import.meta.url));
async function recordResult(result) {
  assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).archiveSha256, receipt.archiveSha256, 'SDK adoption changed during the browser check');
  assert.deepEqual(await sourceHashes(), gallerySourceSha256, 'Gallery source changed during the browser check');
  const captures = [`gallery-buttons-${result.name}.png`, `gallery-scrolled-${result.name}.png`, `preferences-appearance-${result.name}.png`];
  if (dpr === 1) {
    captures.push(`preferences-root-${result.name}.png`);
    if (result.name === 'desktop-light' || result.name === 'phone-dark') captures.push(`preferences-transition-${result.name}.png`);
    if (result.width === 390) captures.push(`gallery-more-${result.name}.png`, `software-more-${result.name}.png`);
  }
  result.capturedAt = new Date().toISOString();
  result.receiptStable = true;
  result.siteCommit = siteCommit;
  result.gallerySourceSha256 = gallerySourceSha256;
  result.captureSha256 = Object.fromEntries(await Promise.all(captures.map(async name => [name,createHash('sha256').update(await readFile(output(name))).digest('hex')])));
  results.push(result);
  await writeFile(output(`browser-results-${result.name}.json`),JSON.stringify([result],null,2));
}
async function login(page, route) {
  await page.goto(`http://127.0.0.1:5199/__dev/login?to=${encodeURIComponent(route)}`, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1200);
  const signIn = page.getByRole('button', {name:'Sign in locally as Generated acceptance'});
  if (await signIn.isVisible()) { await signIn.click(); await page.waitForTimeout(1200); }
  await page.goto(`http://127.0.0.1:5199${route}`, {waitUntil:'domcontentloaded'});
}
async function titleMetrics(page) {
  return page.locator('.nse-window-titlebar-content[data-toolbar-style="expanded"]').evaluate(element => {
    const heading = element.querySelector('[data-window-title]');
    const css = getComputedStyle(heading);
    return { text: heading.textContent, bounds: element.getBoundingClientRect().toJSON(), title: heading.getBoundingClientRect().toJSON(), font: css.font, colour: css.color };
  });
}
async function selectSection(page, name) {
  const browse = page.getByRole('button', { name:/Browse .* sections/ });
  if (await browse.isVisible()) await browse.click();
  await page.getByRole('treeitem', {name: new RegExp(`^${name}(?:$|\\s)`) }).first().click();
}
try {
  for (const [scenario,width,height,colourScheme] of scenarios) {
    if (target && target !== scenario) continue;
    const name = scenario + (dpr === 1 ? "" : `-dpr${dpr}`);
    const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,colorScheme:colourScheme});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error=>{ errors.push(error.message); diagnostics.push({type:'pageerror',message:error.message}); });
    page.on('console', message => { if (message.type()==='error') diagnostics.push({type:'console',message:message.text()}); });
    page.on('requestfailed',request=>diagnostics.push({type:'request',url:request.url(),message:request.failure()?.errorText}));
    await login(page, '/__syncloudos/nse-gallery');
    await page.locator('.nse-gallery').waitFor({timeout:45000});
    if ((await titleMetrics(page)).text !== 'Buttons') await selectSection(page,'Buttons');
    await page.waitForFunction(height => { const e = document.querySelector('.nse-window-titlebar-content[data-toolbar-style=expanded] [data-window-title]'); return e && Math.abs(e.getBoundingClientRect().height - height) < 0.05; }, width===390 ? 37 : 40, {timeout:45000});
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.nse-control-page-header').count(),0);
    const gallery = await titleMetrics(page);
    assert.equal(gallery.text,'Buttons');
    assert.equal(gallery.title.height,width===390 ? 37 : 40);
    await page.screenshot({path:output(`gallery-buttons-${name}.png`)});
    const scroller = page.locator('.gallery-category:visible').first();
    const scrollBefore = await scroller.evaluate(element => ({top:element.scrollTop,range:element.scrollHeight-element.clientHeight}));
    assert.ok(scrollBefore.range > 0, 'gallery content must have a real scroll range beneath the fixed title');
    if (width === 390) {
      const tab = await page.getByRole('tab',{name:/More/}).boundingBox();
      assert.ok(tab && tab.y >= 0 && tab.y + tab.height <= height, 'compact tab bar must stay inside the viewport');
    }
    await page.mouse.move(width===390 ? 240 : 900,400);
    await page.mouse.wheel(0,450);
    await page.waitForFunction(() => [...document.querySelectorAll('.gallery-category')].some(element => element.getClientRects().length && element.scrollTop > 0));
    const scrollAfter = await scroller.evaluate(element => ({top:element.scrollTop,range:element.scrollHeight-element.clientHeight}));
    assert.ok(scrollAfter.top > scrollBefore.top);
    assert.equal((await titleMetrics(page)).bounds.y,gallery.bounds.y,'expanded title must remain fixed while content scrolls');
    await page.screenshot({path:output(`gallery-scrolled-${name}.png`)});
    await page.mouse.wheel(0,-900);
    await page.waitForFunction(() => [...document.querySelectorAll('.gallery-category')].some(element => element.getClientRects().length && element.scrollTop === 0));
    await selectSection(page,'Text Fields');
    await page.waitForTimeout(300);
    assert.equal((await titleMetrics(page)).text,'Text Fields');
    await selectSection(page,'Buttons');
    await page.waitForTimeout(300);
    assert.equal((await titleMetrics(page)).text,'Buttons');
    await page.getByRole('button',{name:'User Info',exact:true}).click();
    await page.getByRole('menuitem',{name:/System Preferences/}).click();
    const dialog = page.getByRole('dialog',{name:'System Preferences',exact:true});
    await dialog.getByRole('button',{name:'Appearance',exact:true}).click();
    await page.waitForTimeout(650);
    const preferences = page.getByRole('dialog',{name:'Appearance',exact:true});
    assert.equal(await preferences.locator('[data-toolbar-style="preference"] [data-window-title]').textContent(),'Appearance');
    const back = preferences.getByRole('button',{name:'Back',exact:true});
    assert.equal(await back.locator('xpath=ancestor::*[@data-layout-attribute="leading"]').count(),1);
    const prefsMetrics = await preferences.locator('.nse-prefs-header').evaluate(element=>({bounds:element.getBoundingClientRect().toJSON(),title:element.querySelector('.nse-prefs-title').getBoundingClientRect().toJSON(),font:getComputedStyle(element.querySelector('.nse-prefs-title')).font}));
    assert.equal(prefsMetrics.bounds.height,66);
    await page.screenshot({path:output(`preferences-appearance-${name}.png`)});
    if (dpr !== 1) {
      assert.equal(errors.length,0,errors.join('\n'));
      await recordResult({name,width,height,dpr,frameworkCommit:receipt.commit,archiveSha256:receipt.archiveSha256,colourScheme,gallery,scrollBefore,scrollAfter,prefsMetrics,errors,scope:'rendering spot check'});
      console.log(`${name}: passed rendering spot check`);
      await context.close();
      continue;
    }
    await back.click();
    if (name === 'desktop-light' || name === 'phone-dark') {
      await page.waitForTimeout(40);
      assert.ok((await page.locator('.nse-prefs-header [data-window-title]').textContent()).trim().length);
      await page.screenshot({path:output(`preferences-transition-${name}.png`)});
    }
    await page.waitForTimeout(350);
    await page.waitForFunction(() => document.querySelector('.nse-prefs-header [data-window-title]')?.textContent === 'System Preferences');
    assert.equal(await dialog.locator('[data-window-title]').textContent(),'System Preferences');
    await page.screenshot({path:output(`preferences-root-${name}.png`)});
    await dialog.getByRole('button',{name:'Language',exact:true}).click();
    await page.waitForTimeout(350);
    assert.equal(await page.getByRole('dialog').locator('[data-window-title]').textContent(),'Language');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await page.waitForFunction(() => document.querySelector('.nse-prefs-header [data-window-title]')?.textContent === 'System Preferences');
    assert.equal(await dialog.locator('[data-window-title]').textContent(),'System Preferences');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    await page.locator('.nse-prefs-toast').waitFor({state:'detached',timeout:10000});
    assert.equal(await page.locator('.nse-prefs-toast').count(),0);
    let more = null;
    if (width===390) {
      await page.getByRole('tab',{name:/More/}).click();
      await page.waitForTimeout(350);
      assert.equal((await titleMetrics(page)).text,'More');
      await page.screenshot({path:output(`gallery-more-${name}.png`)});
      await page.getByRole('tab',{name:'Controls',exact:true}).click();
      await page.waitForTimeout(350);
      assert.notEqual((await titleMetrics(page)).text,'More');
      await page.goto('http://127.0.0.1:5199/software',{waitUntil:'domcontentloaded'});
      const title = page.getByRole('button',{name:'Open QuickSwitch',exact:true});
      await title.waitFor({timeout:45000});
      const previousTitle = await title.textContent();
      await page.getByRole('tab',{name:/More/}).click();
      await page.waitForTimeout(350);
      assert.equal((await title.textContent()).trim(),'More');
      await page.screenshot({path:output(`software-more-${name}.png`)});
      await page.getByRole('tab',{name:'Overview',exact:true}).click();
      await page.waitForTimeout(350);
      assert.equal(await title.textContent(),previousTitle);
      // Overflow detail must restore the app-owned title as soon as the list leaves.
      await page.getByRole('tab',{name:/More/}).click();
      const destination = page.locator('.nse-tab-bar-overflow-option:visible').first();
      const destinationName = await destination.getAttribute('aria-label');
      await destination.click();
      await page.waitForTimeout(450);
      assert.notEqual((await title.textContent()).trim(),'More');
      more = {previousTitle,destinationName,detailTitle:await title.textContent()};
    }
    assert.equal(errors.length,0,errors.join('\n'));
    await recordResult({name,width,height,dpr,frameworkCommit:receipt.commit,archiveSha256:receipt.archiveSha256,colourScheme,gallery,scrollBefore,scrollAfter,prefsMetrics,more,errors});
    console.log(`${name}: passed`);
    await context.close();
  }
  assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).archiveSha256, receipt.archiveSha256, 'SDK adoption changed during the browser check');
} catch (error) {
  console.error('BROWSER_FAILURE_DIAGNOSTIC', JSON.stringify(diagnostics));
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({path:output('browser-failed.png')}).catch(()=>{});
    await writeFile(output('browser-failed.txt'),await page.locator('body').innerText()).catch(()=>{});
  }
  throw error;
} finally {
  await writeFile(output(`browser-results${(target ? '-'+target : '') + (dpr===1 ? '' : '-dpr'+dpr)}.json`),JSON.stringify(results,null,2));
  await browser.close();
}
