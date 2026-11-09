import { expect, test } from "playwright/test";
import type { ThemeBaselineSurface } from "./fixtures/theme-baseline/catalogue";
test.describe.configure({ mode: "parallel" });

// Browser metadata avoids importing UI/CSS in Node. Each case has its own image.
for (const scheme of ["light", "dark"] as const) for (let partition = 0; partition < 20; partition++) {
  test(`${scheme} catalogue partition ${partition + 1}`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.clock.setFixedTime(new Date("2026-11-09T13:30:00.000Z"));
    await page.goto(`/tests/e2e/fixtures/theme-baseline/index.html?scheme=${scheme}`);
    await expect(page.locator("#theme-baseline-surface")).toBeVisible();
    const catalogue = await page.evaluate(() => (window as unknown as { themeBaselineCatalogue: Omit<ThemeBaselineSurface, "render">[] }).themeBaselineCatalogue);
    expect(catalogue.length).toBeGreaterThan(400);
    const selected = process.env.THEME_BASELINE_SURFACE ? catalogue.filter(entry => new RegExp(process.env.THEME_BASELINE_SURFACE!).test(entry.id)) : catalogue;
    for (const surface of selected.filter((_, index) => index % 20 === partition)) await test.step(surface.id, async () => {
      await page.setViewportSize(surface.viewport ?? { width: 1000, height: 800 });
      await page.mouse.move(0, 0);
      // The folder freezes the stage's DOM, including measured artwork. Give
      // it a fresh document so previous catalogue surfaces cannot leave work
      // queued against the document being copied.
      if (surface.interaction === "folder") {
        await page.evaluate(async () => {
          const resources = new Set<string>();
          for (const element of document.querySelectorAll(".webspring-board, .webspring-board *")) {
            for (const pseudo of [null, "::before", "::after"]) {
              const style = getComputedStyle(element, pseudo);
              for (const property of ["background-image", "mask-image", "border-image-source"]) {
                for (const match of style.getPropertyValue(property).matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)) resources.add(match[1] ?? match[2] ?? match[3]);
              }
            }
          }
          await Promise.all(Array.from(resources, async source => { const image = new Image(); image.src = source; await image.decode(); }));
          const running = () => document.getAnimations().filter(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity);
          while (running().length) await Promise.all(running().map(animation => animation.finished.catch(() => undefined)));
        });
        await page.goto(`/tests/e2e/fixtures/theme-baseline/index.html?surface=${surface.id}&scheme=${scheme}`);
        await page.waitForFunction(() => typeof (window as unknown as { renderThemeBaselineSurface?: unknown }).renderThemeBaselineSurface === "function", null, { timeout: 30_000 });
      }
      else await page.evaluate(id => (window as unknown as { renderThemeBaselineSurface(id: string): void }).renderThemeBaselineSurface(id), surface.id);
      const frame = page.locator("#theme-baseline-surface");
      await expect(frame).toHaveAttribute("data-baseline-surface", surface.id);
      if (surface.ready) await expect(page.locator(surface.ready).first()).toBeVisible();
      if (surface.chooseTab) await page.getByRole("tab", { name: surface.chooseTab, exact: true }).click();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const target = frame.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]), [role="slider"][tabindex="0"]').first();
      const hoverTarget = frame.locator('button:not([disabled]), label, [role="slider"]').first();
      if (surface.interaction === "hover") await hoverTarget.hover();
      if (surface.interaction === "focus") { await page.keyboard.press("Tab"); await target.focus(); }
      if (surface.interaction === "press") { await hoverTarget.hover(); await page.mouse.down(); }
      if (surface.interaction === "open") { await target.click(); await expect(page.getByRole("listbox").or(page.getByRole("menu"))).toBeVisible(); }
      if (surface.interaction === "folder") {
        // The split freezes a DOM copy. Wait for the source's measured artwork,
        // not just its images, before asking it to make that copy.
        await page.evaluate(async () => {
          let previous = "", stable = 0;
          while (stable < 3) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const tiles = Array.from(document.querySelectorAll<HTMLElement>(".webspring-folder-tile"));
            const sizes = tiles.map(tile => {
              const paint = tile.querySelector<SVGSVGElement>("svg");
              return { width: tile.offsetWidth, height: tile.offsetHeight, bounds: tile.getBoundingClientRect().toJSON(), paintWidth: paint?.width.baseVal.value, paintHeight: paint?.height.baseVal.value, clip: tile.style.getPropertyValue("--webspring-folder-tile-clip") };
            });
            const next = JSON.stringify(sizes);
            const ready = sizes.length > 0 && sizes.every(size => size.width > 0 && size.width === size.paintWidth && size.height === size.paintHeight && size.clip);
            stable = ready && next === previous ? stable + 1 : 0;
            previous = next;
          }
        });
        const geometry = () => page.locator(".webspring-folder-tile").evaluateAll(tiles => tiles.map(tile => ({
          clone: Boolean(tile.closest(".webspring-folder-split-clone")),
          bounds: tile.getBoundingClientRect().toJSON(),
          clip: (tile as HTMLElement).style.getPropertyValue("--webspring-folder-tile-clip"),
          svg: Array.from(tile.querySelectorAll("svg"), svg => ({ width: svg.getAttribute("width"), height: svg.getAttribute("height") })),
        })));
        const before = await geometry();
        await page.getByRole("button", { name: "Open folder Tools" }).click();
        await expect(page.locator('.webspring-folder-split[data-phase="open"]')).toBeVisible();
        await testInfo.attach("folder-geometry", { body: JSON.stringify({ dpr: await page.evaluate(() => devicePixelRatio), before, after: await geometry() }, null, 2), contentType: "application/json" });
      }
      if (surface.id === "folder-presentation") await expect(page.locator('[data-nse-control="folder-presentation"]')).toBeVisible();
      await expect(surface.fullPage ? page.locator("body") : frame).toHaveScreenshot(`${scheme}-${surface.id}.png`, { maxDiffPixels: 0, animations: "disabled", caret: "hide" });
      if (surface.interaction === "press") await page.mouse.up();
      expect(errors).toEqual([]);
    }, { timeout: 60_000 });
  });
}

// A non-image acceptance check: the frozen corpus above is unchanged.
test("stepper hit targets preserve the painted bezel", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/theme-baseline/index.html?scheme=light&surface=stepper-normal");
  const control = page.locator('[data-nse-control="stepper"]');
  const bezel = control.locator(':scope > [data-nse-part="bezel"]');
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox(), paint = await bezel.boundingBox();
  expect(bounds).not.toBeNull(); expect(paint).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(24);
  expect(bounds!.height).toBeGreaterThanOrEqual(48);
  expect(paint!.width).toBe(22); expect(paint!.height).toBe(34);
  for (const [part, y] of [["increment", bounds!.y + 1], ["decrement", bounds!.y + bounds!.height - 1]] as const) {
    await page.mouse.move(bounds!.x + bounds!.width - 0.5, y);
    await page.mouse.down();
    await expect(control.locator(`[data-nse-part="${part}"]`)).toHaveAttribute("data-nse-highlighted", "");
    await page.mouse.up();
    await expect(control.locator(`[data-nse-part="${part}"]`)).not.toHaveAttribute("data-nse-highlighted");
  }
});
