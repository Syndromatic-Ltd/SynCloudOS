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
  1  | import { expect, test } from "playwright/test";
  2  | import type { ThemeBaselineSurface } from "./fixtures/theme-baseline/catalogue";
  3  | test.describe.configure({ mode: "parallel" });
  4  | 
  5  | // Browser metadata avoids importing UI/CSS in Node. Each case has its own image.
  6  | for (const scheme of ["light", "dark"] as const) for (let partition = 0; partition < 20; partition++) {
  7  |   test(`${scheme} catalogue partition ${partition + 1}`, async ({ page }, testInfo) => {
  8  |     test.setTimeout(300_000);
  9  |     const errors: string[] = [];
  10 |     page.on("pageerror", error => errors.push(error.message));
  11 |     await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  12 |     await page.setViewportSize({ width: 1000, height: 800 });
  13 |     await page.clock.setFixedTime(new Date("2026-11-09T13:30:00.000Z"));
  14 |     await page.goto(`/tests/e2e/fixtures/theme-baseline/index.html?scheme=${scheme}`);
  15 |     await expect(page.locator("#theme-baseline-surface")).toBeVisible();
  16 |     const catalogue = await page.evaluate(() => (window as unknown as { themeBaselineCatalogue: Omit<ThemeBaselineSurface, "render">[] }).themeBaselineCatalogue);
  17 |     expect(catalogue.length).toBeGreaterThan(400);
  18 |     const selected = process.env.THEME_BASELINE_SURFACE ? catalogue.filter(entry => new RegExp(process.env.THEME_BASELINE_SURFACE!).test(entry.id)) : catalogue;
  19 |     for (const surface of selected.filter((_, index) => index % 20 === partition)) await test.step(surface.id, async () => {
  20 |       await page.setViewportSize(surface.viewport ?? { width: 1000, height: 800 });
  21 |       await page.mouse.move(0, 0);
  22 |       await page.evaluate(id => (window as unknown as { renderThemeBaselineSurface(id: string): void }).renderThemeBaselineSurface(id), surface.id);
  23 |       const frame = page.locator("#theme-baseline-surface");
  24 |       await expect(frame).toHaveAttribute("data-baseline-surface", surface.id);
  25 |       if (surface.ready) await expect(page.locator(surface.ready).first()).toBeVisible();
  26 |       if (surface.chooseTab) await page.getByRole("tab", { name: surface.chooseTab, exact: true }).click();
  27 |       await page.evaluate(async () => {
  28 |         await document.fonts.ready;
  29 |         await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
  30 |         await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  31 |       });
  32 |       const target = frame.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]), [role="slider"][tabindex="0"]').first();
  33 |       const hoverTarget = frame.locator('button:not([disabled]), label, [role="slider"]').first();
  34 |       if (surface.interaction === "hover") await hoverTarget.hover();
  35 |       if (surface.interaction === "focus") { await page.keyboard.press("Tab"); await target.focus(); }
  36 |       if (surface.interaction === "press") { await hoverTarget.hover(); await page.mouse.down(); }
  37 |       if (surface.interaction === "open") { await target.click(); await expect(page.getByRole("listbox").or(page.getByRole("menu"))).toBeVisible(); }
  38 |       if (surface.interaction === "folder") {
  39 |         // The split freezes a DOM copy. Wait for the source's measured artwork,
  40 |         // not just its images, before asking it to make that copy.
  41 |         await page.evaluate(async () => {
  42 |           let previous = "", stable = 0;
  43 |           while (stable < 3) {
  44 |             await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  45 |             const tiles = Array.from(document.querySelectorAll<HTMLElement>(".webspring-folder-tile"));
  46 |             const sizes = tiles.map(tile => {
  47 |               const paint = tile.querySelector<SVGSVGElement>("svg");
  48 |               return { width: tile.offsetWidth, height: tile.offsetHeight, paintWidth: paint?.width.baseVal.value, paintHeight: paint?.height.baseVal.value, clip: tile.style.getPropertyValue("--webspring-folder-tile-clip") };
  49 |             });
  50 |             const next = JSON.stringify(sizes);
  51 |             const ready = sizes.length > 0 && sizes.every(size => size.width > 0 && size.width === size.paintWidth && size.height === size.paintHeight && size.clip);
  52 |             stable = ready && next === previous ? stable + 1 : 0;
  53 |             previous = next;
  54 |           }
  55 |         });
  56 |         const geometry = () => page.locator(".webspring-folder-tile").evaluateAll(tiles => tiles.map(tile => ({
  57 |           clone: Boolean(tile.closest(".webspring-folder-split-clone")),
  58 |           bounds: tile.getBoundingClientRect().toJSON(),
  59 |           clip: (tile as HTMLElement).style.getPropertyValue("--webspring-folder-tile-clip"),
  60 |           svg: Array.from(tile.querySelectorAll("svg"), svg => ({ width: svg.getAttribute("width"), height: svg.getAttribute("height") })),
  61 |         })));
  62 |         const before = await geometry();
  63 |         await page.getByRole("button", { name: "Open folder Tools" }).click();
  64 |         await expect(page.locator('.webspring-folder-split[data-phase="open"]')).toBeVisible();
  65 |         await testInfo.attach("folder-geometry", { body: JSON.stringify({ dpr: await page.evaluate(() => devicePixelRatio), before, after: await geometry() }, null, 2), contentType: "application/json" });
  66 |       }
> 67 |       await expect(surface.fullPage ? page.locator("body") : frame).toHaveScreenshot(`${scheme}-${surface.id}.png`, { maxDiffPixels: 0, animations: "disabled", caret: "hide" });
     |                                                                     ^ Error: expect(locator).toHaveScreenshot(expected) failed
  68 |       if (surface.interaction === "press") await page.mouse.up();
  69 |       expect(errors).toEqual([]);
  70 |     }, { timeout: 30_000 });
  71 |   });
  72 | }
  73 | 
```