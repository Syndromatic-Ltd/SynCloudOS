const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../../..");
const site = path.resolve(root, "../site");
const output = path.join(root, ".artifacts/animation-objects");
fs.mkdirSync(output, { recursive: true });
const base = "http://127.0.0.1:5199";

async function prepare(page, route, options) {
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(15000);
  await page.setViewportSize(options.device === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: options.scheme, reducedMotion: options.motion });
  await page.goto(`${base}/__dev/login?to=${encodeURIComponent(route)}`, { waitUntil: "domcontentloaded" });
}
function prefix(flow, options) { return path.join(output, `${flow}-${options.stage}-${options.device}-${options.scheme}-${options.motion}`); }
async function shot(page, file, state) { await page.screenshot({ path: `${file}-${state}.png` }); }
async function stable(page, selector) {
  await page.locator(selector).first().waitFor({ timeout: 12000 });
  await page.waitForTimeout(1800);
  const bounds = await page.locator(selector).first().boundingBox();
  if (!bounds || bounds.width < 250 || bounds.height < 150) throw new Error(`The app has not reached its settled frame: ${selector} ${JSON.stringify(bounds)}`);
  return bounds;
}
async function sample(page, selector, duration = 1200) {
  await page.evaluate(({ selector, duration }) => {
    window.__animationEvidence = [];
    const start = performance.now();
    function opacity(element) {
      let result = 1;
      for (let node = element; node instanceof HTMLElement; node = node.parentElement) result *= Number(getComputedStyle(node).opacity || 1);
      return result;
    }
    const frame = () => {
      const targets = [...document.querySelectorAll(selector)].map(element => ({
        opacity: opacity(element), transform: getComputedStyle(element).transform,
        rect: element.getBoundingClientRect().toJSON(),
      }));
      window.__animationEvidence.push({ t: performance.now() - start, targets,
        memoListMounted: !!document.querySelector(".memo-journal-grid-view") });
      if (performance.now() - start < duration) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, { selector, duration });
}
async function saveFrames(page, file) {
  fs.writeFileSync(`${file}-frames.json`, JSON.stringify(await page.evaluate(() => window.__animationEvidence ?? []), null, 2));
}

async function memo(page, options) {
  await prepare(page, "/memo-journal", options);
  await page.locator(".memo-journal-app").first().waitFor({ timeout: 12000 });
  const file = prefix("memo", options);
  await sample(page, ".memo-journal-memo-preview, .memo-journal-new-memo", 1600);
  await shot(page, file, "entrance-1"); await shot(page, file, "entrance-2");
  const bounds = await stable(page, ".memo-journal-app");
  await saveFrames(page, `${file}-entrance`);
  await shot(page, file, "list");
  await sample(page, ".memo-journal-edit-view");
  await page.getByRole("button", { name: /AppView becomes/ }).click();
  await shot(page, file, "open-1"); await shot(page, file, "open-2");
  await page.waitForTimeout(300); await shot(page, file, "editor");
  if (await page.locator(".memo-journal-grid-view").count() !== 1) throw new Error("The memo list was not retained exactly once.");
  await page.getByRole("button", { name: "All Memos", exact: true }).click();
  await shot(page, file, "close-1");
  await page.locator(".memo-journal-edit-view").waitFor({ state: "detached", timeout: 5000 });
  await shot(page, file, "closed"); await saveFrames(page, file);
  return { bounds, listRetained: true };
}
async function dial(page, options) {
  await prepare(page, "/", options);
  await page.getByRole("button", { name: "Open About", exact: true }).waitFor({ timeout: 12000 });
  await page.waitForTimeout(1800);
  const file = prefix("dial", options);
  await shot(page, file, "idle");
  await page.getByRole("button", { name: "Open About", exact: true }).hover();
  await page.waitForTimeout(300); await shot(page, file, "netburst");
  const effects = await page.locator('[data-effect="netburst"]').evaluateAll(elements => elements.map(element => ({
    renderer: element.dataset.renderer, active: element.dataset.active, error: element.dataset.rendererError,
    width: element.querySelector("canvas")?.width, height: element.querySelector("canvas")?.height,
  })));
  if (effects.filter(effect => effect.active === "true").some(effect => effect.renderer !== "fx")) throw new Error(`An active Netburst renderer failed: ${JSON.stringify(effects)}`);
  await sample(page, ".webspring-icon-motion, .webspring-orb-stack", 2400);
  await page.getByRole("button", { name: "Open About", exact: true }).click();
  await shot(page, file, "launch-1"); await shot(page, file, "launch-2");
  await stable(page, ".about-app"); await shot(page, file, "app");
  const back = page.getByRole("button", { name: "Return to Webspring", exact: true });
  if (await back.count() === 1 && await back.isVisible()) await back.click(); else await page.goBack();
  await shot(page, file, "return-1"); await shot(page, file, "return-2");
  await page.waitForTimeout(1500); await shot(page, file, "returned");
  await saveFrames(page, file);
  fs.writeFileSync(`${file}-effects.json`, JSON.stringify(effects, null, 2));
  return { effects, route: new URL(page.url()).pathname };
}
async function about(page, options) {
  await prepare(page, "/about", options);
  await stable(page, ".about-app");
  const file = prefix("about", options);
  const company = page.getByRole("tab", { name: "Company", exact: true });
  if (await company.count()) await company.click();
  await page.waitForTimeout(1500); await shot(page, file, "company");
  await sample(page, ".about-pane", 1800);
  await page.getByRole("tab", { name: "Framework", exact: true }).click();
  await shot(page, file, "swap-1"); await shot(page, file, "swap-2");
  await page.waitForTimeout(1500); await shot(page, file, "framework");
  const sections = await page.locator(".about-pane").getAttribute("data-section");
  if (sections !== "framework") throw new Error(`About did not settle on Framework: ${sections}`);
  await saveFrames(page, file);
  const frames = await page.evaluate(() => window.__animationEvidence ?? []);
  if (frames.length < 5) throw new Error("The About frame sampler was interrupted by a reload; rerun this case.");
  const minimumVisibleOpacity = Math.min(...frames.map(frame => Math.max(0, ...frame.targets.map(target => target.opacity))));
  if (minimumVisibleOpacity < 0.48) throw new Error(`About lost its visible pane during the transition: ${minimumVisibleOpacity}`);
  return { section: sections, minimumVisibleOpacity };
}
async function journal(page, options, old = false) {
  const route = old ? "/journal-old" : "/journal";
  await prepare(page, route, options);
  const bounds = await stable(page, '[data-testid="journal-shell"]');
  const file = prefix(old ? "journal-old" : "journal", options);
  await shot(page, file, "list"); await sample(page, ".journal-folder-slot, .journal-note-slot, .journal-pad");
  const notes = page.getByRole("option", { name: /Webspring 4.0 enters first implementation/ });
  let clicked = false;
  for (let index = 0; index < await notes.count(); index++) {
    const candidate = notes.nth(index);
    if (await candidate.isVisible() && await candidate.evaluate(element => !element.closest('[inert], [aria-hidden="true"]'))) { await candidate.click(); clicked = true; break; }
  }
  if (!clicked) {
    const allNotes = page.getByRole("treeitem", { name: "All Notes", exact: true });
    if (await allNotes.count() && await allNotes.first().isVisible()) {
      await allNotes.first().click();
      await shot(page, file, "folder-swap-1"); await shot(page, file, "folder-swap-2");
      await page.waitForTimeout(300);
    }
    for (let index = 0; index < await notes.count(); index++) if (await notes.nth(index).isVisible() && await notes.nth(index).evaluate(element => !element.closest('[inert], [aria-hidden="true"]'))) { await notes.nth(index).click(); clicked = true; break; }
  }
  await shot(page, file, "swap-1"); await shot(page, file, "swap-2");
  await page.waitForTimeout(500); await shot(page, file, "note"); await saveFrames(page, file);
  if (!clicked && old && await page.getByText("Journal content is unavailable.", { exact: false }).count()) return { bounds, clicked,
    limitation: "The existing Journal integration accepts the current Journal and Publisher bundle IDs only. JournalOld cannot acquire content; folder navigation was exercised, but opening a note is blocked." };
  if (!clicked) throw new Error("No actionable Journal note was visible; the navigation flow was not exercised.");
  return { bounds, clicked };
}
async function portfolio(page, options) {
  await prepare(page, "/portfolio", options);
  const button = page.getByRole("button", { name: "Collections", exact: true });
  await button.waitFor({ timeout: 15000 }); await page.waitForTimeout(1800);
  const file = prefix("portfolio", options);
  await shot(page, file, "closed"); await sample(page, ".collections-popover");
  await button.click();
  await shot(page, file, "open-1"); await shot(page, file, "open-2");
  await page.waitForTimeout(700); await shot(page, file, "open");
  const bounds = await page.locator(".collections-popover").boundingBox();
  if (!bounds || bounds.width < 100) throw new Error("The collections paper did not open.");
  await saveFrames(page, file);
  await page.keyboard.press("Escape"); await shot(page, file, "dismissed");
  return { bounds };
}
async function reorder(page, options) {
  await prepare(page, "/", options);
  const icon = page.getByRole("button", { name: "Open About", exact: true });
  await icon.waitFor({ timeout: 15000 }); await page.waitForTimeout(1800);
  const file = prefix("reorder", options);
  if (options.device === "phone") {
    await shot(page, file, "board");
    return { skipped: "The native 390px shell is Board; Dial is declared for desktop/tablet only." };
  }
  await shot(page, file, "idle");
  const bounds = await icon.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
  await page.locator(".webspring-button.is-editing").first().waitFor();
  await shot(page, file, "editing"); await icon.focus();
  const before = await icon.boundingBox();
  await sample(page, ".webspring-icon-motion");
  await page.keyboard.press("ArrowRight");
  await shot(page, file, "move-1"); await shot(page, file, "move-2");
  await page.waitForTimeout(800); await shot(page, file, "moved");
  const after = await icon.boundingBox(); await saveFrames(page, file);
  if (Math.hypot(after.x - before.x, after.y - before.y) < 5) throw new Error("Keyboard reorder did not move the selected icon.");
  await page.keyboard.press("Escape");
  await page.locator(".webspring-button.is-editing").first().waitFor({ state: "detached" });
  await shot(page, file, "finished");
  return { before, after };
}
async function gallery(page, options) {
  await prepare(page, `/__syncloudos/nse-gallery?conformanceHarness=1&conformanceFamily=CPAnimation&conformanceState=interactive&conformanceAppearance=atmo&conformanceColourScheme=${options.scheme}`, options);
  const target = page.getByRole("button", { name: "Run mapped animation", exact: true });
  await target.waitFor({ timeout: 15000 }); await page.waitForTimeout(1500);
  const file = prefix("gallery", options);
  await target.scrollIntoViewIfNeeded(); await shot(page, file, "idle");
  const setting = await page.locator(".nse-conformance-motion-evidence").innerText();
  if (options.stage === "after" && !setting.includes(options.motion === "reduce" ? "System reduced motion: on" : "System reduced motion: off")) throw new Error(`The specimen did not report the system motion setting: ${setting}`);
  await sample(page, '[aria-label="Animation target"]');
  await target.click(); await shot(page, file, "run-1"); await shot(page, file, "run-2");
  await page.waitForTimeout(600); await shot(page, file, "settled"); await saveFrames(page, file);
  const outcome = await page.getByLabel("Animation lifecycle outcome").innerText();
  if (!["settled", "finished", "completed"].includes(outcome)) throw new Error(`The animation did not settle: ${outcome}`);
  return { setting, outcome, media: await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) };
}
const flows = { memo, dial, about, journal, portfolio, reorder, gallery, "journal-old": (page, options) => journal(page, options, true) };
module.exports = { flows, prepare, stable, shot, prefix, sample, saveFrames };

if (require.main === module) (async () => {
  const [flow = "memo", stage = "after", device = "desktop", scheme = "light", motion = "no-preference"] = process.argv.slice(2);
  if (!flows[flow]) throw new Error(`Unknown flow: ${flow}`);
  const options = { stage, device, scheme, motion };
  const receipt = JSON.parse(fs.readFileSync(path.join(site, "vendor/framework-receipt.json"), "utf8"));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  let result, error;
  try {
    result = await flows[flow](page, options);
    const currentReceipt = JSON.parse(fs.readFileSync(path.join(site, "vendor/framework-receipt.json"), "utf8"));
    if (currentReceipt.archiveSha256 !== receipt.archiveSha256) throw new Error("The installed archive changed during capture; rerun this case.");
  }
  catch (failure) { error = failure.stack; await shot(page, prefix(flow, options), "failure"); process.exitCode = 1; }
  finally { await browser.close(); }
  const evidence = { ...options, flow, result, error, errors, archive: receipt.archiveSha256, framework: receipt.commit,
    site: execFileSync("git", ["-C", site, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceOverlay: fs.existsSync(path.join(root, ".artifacts/animation-baseline-state.json")) ? JSON.parse(fs.readFileSync(path.join(root, ".artifacts/animation-baseline-state.json"), "utf8")) : null };
  fs.writeFileSync(`${prefix(flow, options)}-result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ flow, stage, device, scheme, motion, status: error ? "failed" : result?.limitation ? "limited" : "passed", errors: errors.length, ...(error ? { error: error.split("\n")[0] } : {}) }));
})().catch(error => { console.error(error); process.exitCode = 1; });
