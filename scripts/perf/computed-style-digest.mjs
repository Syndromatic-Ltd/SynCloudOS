/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Records a hash of every computed style in the NSE gallery, so two builds can be proved to draw alike.
 *
 *   node scripts/perf/computed-style-digest.mjs --base http://127.0.0.1:5387 --out digest.json
 *   node scripts/perf/computed-style-digest.mjs --compare before.json after.json
 *
 * Keys are hashes of each element path, which keeps the file small; pass --paths to record readable paths
 * when a comparison needs explaining.
 *
 * Entries are keyed by the element's path through stable hooks, not by position, so an element the
 * gallery adds or removes shows up as one missing key and does not shift the rest.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };

if (args.includes("--compare")) {
  const at = args.indexOf("--compare");
  const before = JSON.parse(readFileSync(args[at + 1], "utf8")), after = JSON.parse(readFileSync(args[at + 2], "utf8"));
  let differences = 0, compared = 0;
  for (const view of Object.keys(before.views)) {
    const a = before.views[view], b = after.views[view] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      compared++;
      if (a[key] === b[key]) continue;
      differences++;
      if (differences <= 40) console.log(`${view}: ${key}: ${a[key] ?? "absent"} -> ${b[key] ?? "absent"}`);
    }
  }
  console.log(`${differences} differences in ${compared} styles`);
  process.exit(differences ? 1 : 0);
}

const base = option("base", "http://127.0.0.1:5387");
const out = option("out", "computed-style-digest.json");
const sections = ["Tables & Trees", "Buttons", "Menus & Popups"];
const readablePaths = args.includes("--paths");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(`${base}/`, { waitUntil: "load" });
await page.getByRole("button", { name: /Sign in locally/u }).click();
await page.getByRole("button", { name: "Open About" }).first().waitFor({ timeout: 30_000 });
await page.goto(`${base}/__syncloudos/nse-gallery`, { waitUntil: "load" });
await page.waitForTimeout(9000);

/** FNV-1a over every computed property; hashing in the page keeps megabytes of text off the wire. */
const digest = () => page.evaluate(async (readablePaths) => {
  await document.fonts.ready;
  while (document.getAnimations().some(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity)) await new Promise(resolve => setTimeout(resolve, 50));
  // Mirror classes are private and differ between builds by design; identity uses the public hooks.
  const name = element => {
    const hook = element.getAttribute("data-nse-control") ? `control=${element.getAttribute("data-nse-control")}` : element.getAttribute("data-nse-part") ? `part=${element.getAttribute("data-nse-part")}` : "";
    const index = element.parentElement ? [...element.parentElement.children].indexOf(element) : 0;
    return `${element.localName}${hook ? `[${hook}]` : ""}:${index}`;
  };
  const fnv = text => { let hash = 2166136261; for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619); return hash >>> 0; };
  const path = element => { const parts = []; for (let node = element; node && node !== document.documentElement; node = node.parentElement) parts.unshift(name(node)); const text = parts.join(">"); return readablePaths ? text : fnv(text).toString(36); };
  const entries = {};
  let slice = performance.now();
  for (const element of document.querySelectorAll("body *")) {
    // Yield every 30 ms: a long block trips the host's responsiveness watchdog, whose alert would be measured.
    if (performance.now() - slice > 30) { await new Promise(resolve => setTimeout(resolve, 0)); slice = performance.now(); }
    if (!element.isConnected) continue;
    const key = path(element);
    for (const pseudo of [null, "::before", "::after"]) {
      const style = getComputedStyle(element, pseudo);
      let hash = 2166136261;
      for (let index = 0; index < style.length; index++) {
        // Custom properties carry per-run values (identifiers, clocks); what they draw shows in the standard ones.
        if (style[index].startsWith("--")) continue;
        const text = `${style[index]}:${style.getPropertyValue(style[index])}`;
        for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
      }
      entries[`${key}${pseudo ?? ""}`] = hash >>> 0;
    }
  }
  return entries;
}, readablePaths);

const views = { initial: await digest() };
for (const section of sections) {
  await page.getByText(section, { exact: true }).first().click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(2500);
  views[section] = await digest();
}
await browser.close();
writeFileSync(out, `${JSON.stringify({ base, recordedAt: new Date().toISOString(), views })}\n`);
console.log(Object.entries(views).map(([view, entries]) => `${view}: ${Object.keys(entries).length} styles`).join("\n"));
