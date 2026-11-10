# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: theme-baseline.spec.ts >> dark catalogue partition 17
- Location: tests\e2e\theme-baseline.spec.ts:7:3

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('body')
  45 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: dark-folder-presentation.png

Call log:
  - Expect "toHaveScreenshot(dark-folder-presentation.png)" with timeout 10000ms
    - verifying given screenshot expectation
  - waiting for locator('body')
    - locator resolved to <body>…</body>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 45 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('body')
    - locator resolved to <body>…</body>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 45 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- main [ref=e6]:
  - generic [ref=e8]:
    - main [ref=e12]:
      - region "Webspring" [ref=e13]:
        - generic [ref=e15]: SynCloudOS
        - button "Reorder applications" [ref=e17] [cursor=pointer]:
          - generic [ref=e18]: Reorder applications
        - paragraph [ref=e19]: Hold an application to reorder. Rest it on another application or a folder to group them. Use arrow keys to move it. Press Escape when finished.
        - region "Applications" [ref=e20]:
          - generic [ref=e21]:
            - button "Open Documents" [ref=e23] [cursor=pointer]:
              - generic [ref=e24]:
                - img [ref=e26]
                - generic [ref=e27]: Documents
            - button "Open folder Tools" [expanded] [ref=e29] [cursor=pointer]:
              - generic [ref=e30]:
                - generic [ref=e32]:
                  - generic:
                    - img
                    - generic:
                      - img
                      - img
                  - generic:
                    - img
                    - img
                - generic [ref=e35]: Tools
      - generic [ref=e36]:
        - dialog "Tools" [ref=e38]:
          - generic [ref=e39]:
            - heading "Tools" [level=2] [ref=e40]
            - generic [ref=e41]:
              - button "Open Pictures" [active] [ref=e44] [cursor=pointer]:
                - generic [ref=e45]:
                  - img [ref=e47]
                  - generic [ref=e48]: Pictures
              - button "Open Music" [ref=e51] [cursor=pointer]:
                - generic [ref=e52]:
                  - img [ref=e54]
                  - generic [ref=e55]: Music
        - generic [ref=e57] [cursor=pointer]:
          - main:
            - region:
              - generic:
                - generic: SynCloudOS
              - generic:
                - button:
                  - generic: Reorder applications
              - paragraph: Hold an application to reorder. Rest it on another application or a folder to group them. Use arrow keys to move it. Press Escape when finished.
              - region:
                - generic:
                  - generic:
                    - button:
                      - generic:
                        - generic:
                          - img
                        - generic: Documents
                  - generic:
                    - button [expanded]:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - img
                              - generic:
                                - img
                                - img
                            - generic:
                              - img
                              - img
                        - generic: Tools
        - generic [ref=e58] [cursor=pointer]:
          - generic [ref=e59]:
            - main:
              - region:
                - generic:
                  - generic: SynCloudOS
                - generic:
                  - button:
                    - generic: Reorder applications
                - paragraph: Hold an application to reorder. Rest it on another application or a folder to group them. Use arrow keys to move it. Press Escape when finished.
                - region:
                  - generic:
                    - generic:
                      - button:
                        - generic:
                          - generic:
                            - img
                          - generic: Documents
                    - generic:
                      - button [expanded]:
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - img
                                - generic:
                                  - img
                                  - img
                              - generic:
                                - img
                                - img
                          - generic: Tools
          - generic:
            - generic:
              - generic:
                - main:
                  - region:
                    - generic:
                      - generic: SynCloudOS
                    - generic:
                      - button:
                        - generic: Reorder applications
                    - paragraph: Hold an application to reorder. Rest it on another application or a folder to group them. Use arrow keys to move it. Press Escape when finished.
                    - region:
                      - generic:
                        - generic:
                          - button:
                            - generic:
                              - generic:
                                - img
                              - generic: Documents
                        - generic:
                          - button [expanded]:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - img
                                    - generic:
                                      - img
                                      - img
                                  - generic:
                                    - img
                                    - img
                              - generic: Tools
    - complementary "SynCloudOS Notification Centre":
      - status
```

# Test source

```ts
  1   | import { expect, test } from "playwright/test";
  2   | import type { ThemeBaselineSurface } from "./fixtures/theme-baseline/catalogue";
  3   | test.describe.configure({ mode: "parallel" });
  4   |
  5   | // Browser metadata avoids importing UI/CSS in Node. Each case has its own image.
  6   | for (const scheme of ["light", "dark"] as const) for (let partition = 0; partition < 20; partition++) {
  7   |   test(`${scheme} catalogue partition ${partition + 1}`, async ({ page }, testInfo) => {
  8   |     test.setTimeout(300_000);
  9   |     const errors: string[] = [];
  10  |     page.on("pageerror", error => errors.push(error.message));
  11  |     await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  12  |     await page.setViewportSize({ width: 1000, height: 800 });
  13  |     await page.clock.setFixedTime(new Date("2026-11-09T13:30:00.000Z"));
  14  |     await page.goto(`/tests/e2e/fixtures/theme-baseline/index.html?scheme=${scheme}`);
  15  |     await expect(page.locator("#theme-baseline-surface")).toBeVisible();
  16  |     const catalogue = await page.evaluate(() => (window as unknown as { themeBaselineCatalogue: Omit<ThemeBaselineSurface, "render">[] }).themeBaselineCatalogue);
  17  |     expect(catalogue.length).toBeGreaterThan(400);
  18  |     const selected = process.env.THEME_BASELINE_SURFACE ? catalogue.filter(entry => new RegExp(process.env.THEME_BASELINE_SURFACE!).test(entry.id)) : catalogue;
  19  |     for (const surface of selected.filter((_, index) => index % 20 === partition)) await test.step(surface.id, async () => {
  20  |       await page.setViewportSize(surface.viewport ?? { width: 1000, height: 800 });
  21  |       await page.mouse.move(0, 0);
  22  |       // The folder freezes the stage's DOM, including measured artwork. Give
  23  |       // it a fresh document so previous catalogue surfaces cannot leave work
  24  |       // queued against the document being copied.
  25  |       if (surface.interaction === "folder") {
  26  |         await page.evaluate(async () => {
  27  |           const resources = new Set<string>();
  28  |           for (const element of document.querySelectorAll(".webspring-board, .webspring-board *")) {
  29  |             for (const pseudo of [null, "::before", "::after"]) {
  30  |               const style = getComputedStyle(element, pseudo);
  31  |               for (const property of ["background-image", "mask-image", "border-image-source"]) {
  32  |                 for (const match of style.getPropertyValue(property).matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)) resources.add(match[1] ?? match[2] ?? match[3]);
  33  |               }
  34  |             }
  35  |           }
  36  |           await Promise.all(Array.from(resources, async source => { const image = new Image(); image.src = source; await image.decode(); }));
  37  |           const running = () => document.getAnimations().filter(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity);
  38  |           while (running().length) await Promise.all(running().map(animation => animation.finished.catch(() => undefined)));
  39  |         });
  40  |         await page.goto(`/tests/e2e/fixtures/theme-baseline/index.html?surface=${surface.id}&scheme=${scheme}`);
  41  |         await page.waitForFunction(() => typeof (window as unknown as { renderThemeBaselineSurface?: unknown }).renderThemeBaselineSurface === "function", null, { timeout: 30_000 });
  42  |       }
  43  |       else await page.evaluate(id => (window as unknown as { renderThemeBaselineSurface(id: string): void }).renderThemeBaselineSurface(id), surface.id);
  44  |       const frame = page.locator("#theme-baseline-surface");
  45  |       await expect(frame).toHaveAttribute("data-baseline-surface", surface.id);
  46  |       if (surface.ready) await expect(page.locator(surface.ready).first()).toBeVisible();
  47  |       if (surface.chooseTab) await page.getByRole("tab", { name: surface.chooseTab, exact: true }).click();
  48  |       await page.evaluate(async () => {
  49  |         await document.fonts.ready;
  50  |         await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
  51  |         await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  52  |       });
  53  |       const target = frame.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]), [role="slider"][tabindex="0"]').first();
  54  |       const hoverTarget = frame.locator('button:not([disabled]), label, [role="slider"]').first();
  55  |       if (surface.interaction === "hover") await hoverTarget.hover();
  56  |       if (surface.interaction === "focus") { await page.keyboard.press("Tab"); await target.focus(); }
  57  |       if (surface.interaction === "press") { await hoverTarget.hover(); await page.mouse.down(); }
  58  |       if (surface.interaction === "open") { await target.click(); await expect(page.getByRole("listbox").or(page.getByRole("menu"))).toBeVisible(); }
  59  |       if (surface.interaction === "folder") {
  60  |         // The split freezes a DOM copy. Wait for the source's measured artwork,
  61  |         // not just its images, before asking it to make that copy.
  62  |         await page.evaluate(async () => {
  63  |           let previous = "", stable = 0;
  64  |           while (stable < 3) {
  65  |             await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  66  |             const tiles = Array.from(document.querySelectorAll<HTMLElement>(".webspring-folder-tile"));
  67  |             const sizes = tiles.map(tile => {
  68  |               const paint = tile.querySelector<SVGSVGElement>("svg");
  69  |               return { width: tile.offsetWidth, height: tile.offsetHeight, bounds: tile.getBoundingClientRect().toJSON(), paintWidth: paint?.width.baseVal.value, paintHeight: paint?.height.baseVal.value, clip: tile.style.getPropertyValue("--webspring-folder-tile-clip") };
  70  |             });
  71  |             const next = JSON.stringify(sizes);
  72  |             const ready = sizes.length > 0 && sizes.every(size => size.width > 0 && size.width === size.paintWidth && size.height === size.paintHeight && size.clip);
  73  |             stable = ready && next === previous ? stable + 1 : 0;
  74  |             previous = next;
  75  |           }
  76  |         });
  77  |         const geometry = () => page.locator(".webspring-folder-tile").evaluateAll(tiles => tiles.map(tile => ({
  78  |           clone: Boolean(tile.closest(".webspring-folder-split-clone")),
  79  |           bounds: tile.getBoundingClientRect().toJSON(),
  80  |           clip: (tile as HTMLElement).style.getPropertyValue("--webspring-folder-tile-clip"),
  81  |           svg: Array.from(tile.querySelectorAll("svg"), svg => ({ width: svg.getAttribute("width"), height: svg.getAttribute("height") })),
  82  |         })));
  83  |         const before = await geometry();
  84  |         await page.getByRole("button", { name: "Open folder Tools" }).click();
  85  |         await expect(page.locator('.webspring-folder-split[data-phase="open"]')).toBeVisible();
  86  |         await testInfo.attach("folder-geometry", { body: JSON.stringify({ dpr: await page.evaluate(() => devicePixelRatio), before, after: await geometry() }, null, 2), contentType: "application/json" });
  87  |       }
  88  |       if (surface.id === "folder-presentation") await expect(page.locator('[data-nse-control="folder-presentation"]')).toBeVisible();
> 89  |       await expect(surface.fullPage ? page.locator("body") : frame).toHaveScreenshot(`${scheme}-${surface.id}.png`, { maxDiffPixels: 0, animations: "disabled", caret: "hide" });
      |                                                                     ^ Error: expect(locator).toHaveScreenshot(expected) failed
  90  |       if (surface.interaction === "press") await page.mouse.up();
  91  |       expect(errors).toEqual([]);
  92  |     }, { timeout: 60_000 });
  93  |   });
  94  | }
  95  |
  96  | // A non-image acceptance check: the frozen corpus above is unchanged.
  97  | test("stepper hit targets preserve the painted bezel", async ({ page }) => {
  98  |   await page.goto("/tests/e2e/fixtures/theme-baseline/index.html?scheme=light&surface=stepper-normal");
  99  |   const control = page.locator('[data-nse-control="stepper"]');
  100 |   const bezel = control.locator(':scope > [data-nse-part="bezel"]');
  101 |   await expect(control).toBeVisible();
  102 |   const bounds = await control.boundingBox(), paint = await bezel.boundingBox();
  103 |   expect(bounds).not.toBeNull(); expect(paint).not.toBeNull();
  104 |   expect(bounds!.width).toBeGreaterThanOrEqual(24);
  105 |   expect(bounds!.height).toBeGreaterThanOrEqual(48);
  106 |   expect(paint!.width).toBe(22); expect(paint!.height).toBe(34);
  107 |   for (const [part, y] of [["increment", bounds!.y + 1], ["decrement", bounds!.y + bounds!.height - 1]] as const) {
  108 |     await page.mouse.move(bounds!.x + bounds!.width - 0.5, y);
  109 |     await page.mouse.down();
  110 |     await expect(control.locator(`[data-nse-part="${part}"]`)).toHaveAttribute("data-nse-highlighted", "");
  111 |     await page.mouse.up();
  112 |     await expect(control.locator(`[data-nse-part="${part}"]`)).not.toHaveAttribute("data-nse-highlighted");
  113 |   }
  114 | });
  115 |
```
