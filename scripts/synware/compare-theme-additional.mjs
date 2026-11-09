// Additional parity evidence compares immutable source, never stored suite references.
import { createServer } from "vite";
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const reference = resolve(process.argv[2] ?? ".artifacts/theme-contract-reference-a1c3617");
const evidence = resolve("docs/superpowers/evidence/2026-11-09-theme-contract/additional-parity");
const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
};
const sha = value => createHash("sha256").update(value).digest("hex");
const referenceCommit = git(reference, ["rev-parse", "HEAD"]);
if (referenceCommit !== "a1c3617015906b4c802bd7ef7f2183062581f3b8") throw new Error("The reference must be unchanged a1c3617.");
git(reference, ["diff", "--exit-code", "HEAD", "--", "src", "scripts"]);
await mkdir(evidence, { recursive: true });
const referenceFixture = join(reference, "tests/e2e/fixtures/theme-additional");
await mkdir(referenceFixture, { recursive: true });
for (const file of ["index.html", "catalogue.tsx", "host.tsx", "host.css"]) {
  const preserved = await readFile(join(evidence, "reference-fixture", file));
  const destination = join(referenceFixture, file);
  const existing = await readFile(destination).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (existing && !existing.equals(preserved)) throw new Error(`${file}: the preserved reference fixture differs; it was not overwritten.`);
  if (!existing) await writeFile(destination, preserved);
}
let servers = [], browser;
const results = [];
try {
  servers = await Promise.all([reference, root].map(async (directory, index) => {
    const server = await createServer({ configFile: join(directory, "tests/e2e/vite.config.ts"), root: directory,
      cacheDir: join(directory, ".artifacts/theme-additional-vite-cache"),
      server: { port: 5378 + index, host: "127.0.0.1", strictPort: true, watch: { ignored: ["**/.artifacts/**", "**/docs/superpowers/evidence/**"] } } });
    await server.listen();
    return server;
  }));
  browser = await chromium.launch();
  const probe = await browser.newPage();
  await probe.goto("http://127.0.0.1:5379/tests/e2e/fixtures/theme-additional/index.html");
  await probe.waitForFunction(() => Boolean(window.additionalThemeCatalogue));
  const surfaces = await probe.evaluate(() => window.additionalThemeCatalogue);
  await probe.close();
  for (const dpr of [1, 2]) for (const scheme of ["light", "dark"]) for (const surface of surfaces) {
    const captures = [];
    for (const [index, side] of ["reference", "current"].entries()) {
      const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr, colorScheme: scheme, reducedMotion: "reduce", locale: "en-GB" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-11-09T13:30:00.000Z"));
      await page.goto(`http://127.0.0.1:${5378 + index}/tests/e2e/fixtures/theme-additional/index.html?scheme=${scheme}&surface=${surface.id}`);
      await page.locator("#theme-additional-surface").waitFor();
      if (surface.action === "select-next") await page.getByRole("dialog", { name: "QuickSwitch" }).press("ArrowRight");
      if (surface.action === "disclose") await page.getByRole("button", { name: /Technical details/ }).click();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        await frame(); await frame();
        await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => undefined)));
        let previous = "", stable = 0;
        for (let count = 0; count < 120; count++) {
          await frame();
          const geometry = JSON.stringify([...document.querySelectorAll("#theme-additional-surface,#theme-additional-surface *")].map(element => {
            const r = element.getBoundingClientRect(), style = getComputedStyle(element);
            return [r.x, r.y, r.width, r.height, style.transform, style.opacity];
          }));
          stable = geometry === previous ? stable + 1 : 0;
          if (stable === 3) return;
          previous = geometry;
        }
        throw new Error("Additional parity geometry did not settle.");
      });
      if (errors.length) throw new Error(`${surface.id} (${side}): ${errors.join("; ")}`);
      const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
      const repeat = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
      if (!screenshot.equals(repeat)) throw new Error(`${surface.id} (${side}) capture was not deterministic.`);
      const name = `${scheme}-dpr${dpr}-${surface.id}-${side}.png`;
      const destination = join(evidence, name);
      const existing = await readFile(destination).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (side === "reference" && existing && !existing.equals(screenshot)) throw new Error(`${name}: immutable-source capture changed; retained reference was not overwritten.`);
      if (side === "current" && existing && !existing.equals(screenshot)) await writeFile(join(evidence, name.replace("-current.png", "-previous.png")), existing);
      if (!existing || !existing.equals(screenshot)) await writeFile(destination, screenshot);
      captures.push({ name, sha256: sha(screenshot), bytes: screenshot });
      await context.close();
    }
    const identical = captures[0].bytes.equals(captures[1].bytes);
    results.push({ surface: surface.id, scheme, dpr, identical, captures: captures.map(({ bytes: _bytes, ...capture }) => capture) });
    console.log(`${identical ? "PASS" : "DIFFERENCE"} ${scheme} DPR ${dpr} ${surface.id}`);
  }
  git(reference, ["diff", "--exit-code", "HEAD", "--", "src", "scripts"]);
  const fixtureFiles = ["index.html", "catalogue.tsx", "host.tsx", "host.css"];
  const fixtures = {};
  for (const file of fixtureFiles) fixtures[file] = {
    reference: sha(await readFile(join(reference, "tests/e2e/fixtures/theme-additional", file))),
    current: sha(await readFile(join(root, "tests/e2e/fixtures/theme-additional", file))),
  };
  await writeFile(join(evidence, "results.json"), JSON.stringify({ referenceCommit, currentHead: git(root, ["rev-parse", "HEAD"]), sourcePatchSha256: sha(git(root, ["diff", "HEAD", "--", "src"])), referenceSourceUnchanged: true, fixtures, results }, null, 2) + "\n");
  if (results.some(result => !result.identical)) process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => server.close()));
}
