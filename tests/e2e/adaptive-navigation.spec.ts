import { expect, test } from 'playwright/test';

for (const reducedMotion of ['no-preference','reduce'] as const) {
  test(`adaptive peer chrome preserves editing, direct tabs and focus (${reducedMotion})`,async({page},testInfo)=>{
    await page.emulateMedia({reducedMotion});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1200,height:800});
    await page.goto('/__framework-tests/navigation/adaptive');
    const state=page.getByTestId('navigation-state');
    await expect(state).toHaveText('source-list-content:Editor');
    const draft=page.getByRole('textbox',{name:'Draft Editor'});
    await draft.fill('Keep this unsaved editor');
    const node=await draft.elementHandle();
    await draft.focus();
    for(const [width,height,renderer] of [[382,580,'tabs'],[594,368,'rail'],[669,867,'tabs'],[1000,280,'rail'],[951,585,'source-list-content']] as const){
      await page.setViewportSize({width,height});
      await expect(state).toHaveText(`${renderer}:Editor`);
      await expect(draft).toHaveValue('Keep this unsaved editor');
      expect(await draft.evaluate((element,original)=>element===original,node)).toBe(true);
      await expect(draft).toBeFocused();
      if(renderer==='rail'){
        await expect(page.getByRole('tablist',{name:'Workspace'})).toHaveAttribute('aria-orientation','vertical');
        const pane=await page.getByTestId('navigation-window').boundingBox();
        const content=await page.getByTestId('scroll-Editor').boundingBox();
        expect(content!.width).toBeCloseTo(pane!.width-104,0);
        const targets=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>{const r=tab.getBoundingClientRect();return {w:r.width,h:r.height};}));
        expect(targets.every(target=>target.w>=64 && target.h>=72)).toBe(true);
      }
      await page.screenshot({path:testInfo.outputPath(`${renderer}-${width}.png`)});
    }
    // A small app rectangle on a wide host uses its own geometry.
    await page.setViewportSize({width:1200,height:400});
    await page.getByRole('textbox',{name:'Content width'}).fill('430');
    await expect(state).toHaveText('tabs:Editor');
    await page.getByRole('textbox',{name:'Content width'}).fill('594');
    await expect(state).toHaveText('rail:Editor');
    const first=page.getByRole('tab',{name:'Editor',exact:true});
    await first.focus();
    await first.press('ArrowDown');
    await expect(state).toHaveText('rail:Library');
    await expect(page.getByRole('tab',{name:'Library',exact:true})).toBeFocused();
    // AppKit's shouldSelect delegate refuses Search; the next key can continue to Settings.
    await page.getByRole('tab',{name:'Library',exact:true}).press('ArrowDown');
    await expect(state).toHaveText('rail:Library');
    await page.getByRole('tab',{name:'Search',exact:true}).press('ArrowDown');
    await expect(state).toHaveText('rail:Settings');
    await page.getByRole('tab',{name:'History',exact:true}).click();
    await expect(state).toHaveText('rail:History');
    await page.setViewportSize({width:594,height:650});
    await expect(state).toHaveText('tabs:History');
    await page.setViewportSize({width:594,height:368});
    await expect(state).toHaveText('rail:History');
    await first.click();
    await expect(draft).toHaveValue('Keep this unsaved editor');
    await page.getByRole('button',{name:'Open draft options'}).click();
    const options=page.getByRole('dialog',{name:'Draft options',exact:true});
    await expect(options).toBeVisible();
    await options.getByRole('textbox',{name:'Option draft'}).fill('Keep open options');
    for(const [width,height] of [[382,580],[800,280],[1200,800],[594,368]]){
      await page.setViewportSize({width,height});
      await expect(options).toBeVisible();
      await expect(options.getByRole('textbox',{name:'Option draft'})).toHaveValue('Keep open options');
    }
    await page.keyboard.press('Escape');
    await expect(options).toBeHidden();
    await expect(page.getByRole('button',{name:'Open draft options'})).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('RTL tab keys and shallow rail scrolling retain full targets',async({page})=>{
  await page.setViewportSize({width:594,height:260});
  await page.goto('/__framework-tests/navigation/adaptive');
  await expect(page.getByTestId('navigation-state')).toHaveText('rail:Editor');
  await page.getByRole('checkbox',{name:'RTL'}).check();
  const viewport=page.locator('[data-nse-tab-scroll-viewport]');
  const first=page.getByRole('tab',{name:'Editor',exact:true});
  await first.focus();await first.press('End');
  await expect(page.getByRole('tab',{name:'History',exact:true})).toBeFocused();
  await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await first.click();
  await first.focus();await first.press('Home');
  await page.setViewportSize({width:382,height:650});
  await expect(page.getByRole('tablist')).toHaveAttribute('aria-orientation','horizontal');
  await first.focus();await first.press('ArrowLeft');
  await expect(page.getByTestId('navigation-state')).toHaveText('tabs:Library');
});

test('sidebar focus follows the selected peer into the visible shallow rail',async({page})=>{
  await page.setViewportSize({width:1200,height:800});await page.goto('/__framework-tests/navigation/adaptive');
  await expect(page.getByTestId('navigation-state')).toHaveText('source-list-content:Editor');
  const sharing=page.getByRole('treeitem',{name:'Sharing',exact:true});await sharing.click();
  const draft=page.getByRole('textbox',{name:'Draft Sharing'});await draft.fill('Retain selected peer');
  await page.getByRole('tree',{name:'Workspace'}).focus();await page.setViewportSize({width:594,height:260});
  const selected=page.getByRole('tab',{name:'Sharing',exact:true});await expect(selected).toBeFocused();
  const viewport=page.locator('[data-nse-tab-scroll-viewport]');
  await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  const target=await selected.boundingBox(),rail=await viewport.boundingBox();
  expect(target!.y).toBeGreaterThanOrEqual(rail!.y-1);
  expect(target!.y+target!.height).toBeLessThanOrEqual(rail!.y+rail!.height+1);
  await expect(draft).toHaveValue('Retain selected peer');
});
