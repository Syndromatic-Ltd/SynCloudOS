import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
await page.goto('http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery');
await page.waitForTimeout(1200);
const signIn = page.getByRole('button',{name:'Sign in locally as Generated acceptance'});
if(await signIn.isVisible()) { await signIn.click(); await page.waitForTimeout(1200); }
await page.goto('http://127.0.0.1:5199/__syncloudos/nse-gallery');
await page.locator('.nse-gallery').waitFor({timeout:45000});
if(await page.locator('.nse-window-titlebar-heading').textContent() !== 'Buttons') await page.getByRole('treeitem',{name:/^Buttons(?:$|\s)/}).first().click();
await page.waitForFunction(()=>document.querySelector('.nse-window-titlebar-heading')?.getBoundingClientRect().height===37);
const measure = () => page.evaluate(()=>({
  ancestors: (()=>{const a=[];for(let e=document.querySelector('.gallery-main');e;e=e.parentElement){const s=getComputedStyle(e);a.push({attrs:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value])),class:e.className,height:e.getBoundingClientRect().height,display:s.display,cssHeight:s.height,flex:s.flex,overflow:s.overflow,style:e.getAttribute("style"),blockSize:s.blockSize});}return a;})(),
  tabs:[...document.querySelectorAll('[role=tablist]')].filter(e=>e.getClientRects().length).map(e=>({rect:e.getBoundingClientRect().toJSON(),text:e.textContent})),
}));
const before=await measure();
await page.addStyleTag({content:'.nse-appearance-provider:has(> .gallery-appearance-host > .nse-gallery[data-gallery-layout="phone"]) { height: 100%; min-height: 0; } .nse-gallery[data-gallery-layout="phone"] > .nse-split-view-controller-view { height: 100%; } .nse-gallery[data-gallery-layout="phone"] > .nse-split-view-controller-view > [data-nse-part="split-pane"] > [data-nse-part="split-pane-slot"] > .nse-split-view-pane-host > [data-nse-view-controller] { height: 100%; flex: 1 1 0%; min-height: 0; }'});
await page.waitForTimeout(300);
const after=await measure();
await writeFile(new URL('layout-probe.json',import.meta.url),JSON.stringify({before,after},null,2));
console.log(JSON.stringify({before:before.tabs,after:after.tabs}));
await browser.close();
