import { chromium } from "../../../../node_modules/playwright/index.mjs";
import { freezeHMR } from "./freeze-hmr.mjs";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await freezeHMR(page);
  await page.goto("http://127.0.0.1:5199/__dev/login?to=%2Fjournal", { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  console.log(JSON.stringify(await page.evaluate(() => ({
    controls: [...document.querySelectorAll('button,a,[role="button"]')].map(e => ({ tag: e.tagName, text: e.textContent?.slice(0,90), aria: e.getAttribute("aria-label"), className: e.className })),
    targets: [...document.querySelectorAll("strong")].filter(e => e.textContent === "Webspring 4.0 enters first implementation").map(e => { const r = e.getBoundingClientRect(); return { parent: e.parentElement.outerHTML.slice(0,600), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, stack: document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).slice(0,6).map(e=>[e.tagName,e.className,e.textContent?.slice(0,50)]) }; }),
    panes: [...document.querySelectorAll(".journal-folder-slot,.journal-note-slot,.journal-pad")].map(e=>({ c:e.className, style:e.getAttribute("style"), inert:e.inert, parent:e.parentElement.outerHTML.slice(0,130) })),
  })), null, 2));
} finally { await browser.close(); }
