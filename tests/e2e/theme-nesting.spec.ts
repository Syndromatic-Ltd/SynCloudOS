import { expect, test } from 'playwright/test';
import { resolve } from 'node:path';
const fixture='/tests/e2e/fixtures/theme-nesting/index.html';
test('nested themes isolate paint and colours; omitted highlighted paint falls back to Atmo', async ({page})=>{
  await page.goto(fixture);
  const colour=(id:string)=>page.locator(id).evaluate(el=>getComputedStyle(el).getPropertyValue('--nse-colour-label').trim());
  await expect(page.locator('#inner-button')).toBeVisible();
  expect(await colour('#outer-button')).toBe('#112233'); expect(await colour('#inner-button')).toBe('#334455');
  const paint=(id:string)=>page.locator(`${id} > [data-nse-part="bezel"]`).evaluate(el=>({background:getComputedStyle(el).backgroundImage,colour:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderImageSource}));
  expect((await paint('#outer-button')).colour).toBe('rgb(192, 32, 48)'); expect((await paint('#inner-button')).colour).toBe('rgb(32, 160, 96)');
  const image=page.locator('#inner-button [data-nse-image-template]'); expect(await image.evaluate(el=>getComputedStyle(el).maskImage)).toContain('image-set(');
  const highlighted=async(id:string)=>{await page.locator(id).hover();await page.mouse.down(); const result=await paint(id);await page.mouse.up();return result;};
  expect(await highlighted('#partial-button')).toEqual(await highlighted('#atmo-button'));
});
for(const width of ['compact','regular']) for(const placement of width==='compact'?['block-start','block-end']:['source-list','block-start']) for(const flow of ['in-flow','overlay']) for(const dir of ['ltr','rtl']) test(`${width} ${placement} ${flow} ${dir} keeps content clear`,async({page})=>{
  await page.setViewportSize({width:width==='compact'?390:1000,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`${fixture}?width=${width}&placement=${placement}&flow=${flow}&dir=${dir}`);
  const root=page.locator('[data-nse-control="tab-view"][data-nse-navigation-placement]');await expect(root).toHaveAttribute('data-nse-navigation-placement',placement);await expect(root).toHaveAttribute('data-nse-navigation-flow',flow);
  const scroll=page.locator('.nse-scroll-view').first();await expect(scroll).toBeVisible();
  const chrome=placement==='source-list'?page.locator('.nse-adaptive-tab-sidebar'):page.locator('.nse-adaptive-tab-chrome');
  await expect.poll(async()=> {const rect=await chrome.boundingBox(); return rect && rect.height>0;}).toBe(true);
  await expect.poll(async()=>scroll.locator('> [data-nse-part="content"]').evaluate((el,{placement,flow,dir})=>{
    const cs=getComputedStyle(el);const inset=parseFloat(placement==='block-start'?cs.paddingTop:placement==='block-end'?cs.paddingBottom:dir==='rtl'?cs.paddingRight:cs.paddingLeft);return flow==='overlay'?inset>0:inset===0;
  },{placement,flow,dir})).toBe(true);
  await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);
  const last=await page.locator('[data-last-row]').first().boundingBox(),bar=await chrome.boundingBox();
  if(placement==='block-end') expect(last!.y+last!.height).toBeLessThanOrEqual(bar!.y+1);
});
test('plain login keeps the existing window without ornaments for owner review',async({page},info)=>{
  await page.setViewportSize({width:1000,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(fixture+'?login=plain');
  await expect(page.getByRole('dialog')).toHaveAttribute('data-nse-login-presentation','plain');await expect(page.locator('[data-nse-part="suspension"]')).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);
  const path=resolve('docs/superpowers/evidence/2026-11-09-theme-contract',`plain-login-${info.project.name}.png`);await page.screenshot({path,animations:'disabled'});await info.attach('plain login owner review',{path,contentType:'image/png'});
});
