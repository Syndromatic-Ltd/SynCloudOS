/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { expect, test, type Locator, type Page, type TestInfo } from "playwright/test";
import sharp from "sharp";
import { d50ReferenceWhite, linearSRGBToD50XYZ } from "../../src/FX/GraphicsFX/GFXColourProfile";

const root = "/tests/e2e/fixtures/theme-paint-replacement/index.html";
const part = (name: string) => '[data-nse-part="' + name + '"]';
const control = (name: string) => '[data-nse-control="' + name + '"]';
const selected = "[data-nse-selected]";
const magenta = "rgb(255, 0, 255)";
const capture = { animations: "disabled", caret: "hide", scale: "css" } as const;

test.use({ colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1010, height: 750 } });

async function openSpecimen(page: Page, specimen: string, theme = "magenta", options: Record<string, string> = {}) {
  await page.goto(root + "?" + new URLSearchParams({ specimen, theme, ...options }));
  await expect(page.locator("#" + specimen)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (specimen === "menu") {
    await page.getByRole("button", { name: "Actions", exact: true }).press("ArrowDown");
    await expect(page.locator(control("menu-item") + "[data-nse-highlighted]")).toHaveCount(1);
  }
}

function lab(r: number, g: number, b: number) {
  const linear = (code: number) => {
    const channel = code / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const { x, y, z } = linearSRGBToD50XYZ({ r: linear(r), g: linear(g), b: linear(b) });
  const curve = (ratio: number) => ratio > 216 / 24389 ? Math.cbrt(ratio) : (24389 / 27 * ratio + 16) / 116;
  const fx = curve(x / d50ReferenceWhite.x), fy = curve(y / d50ReferenceWhite.y), fz = curve(z / d50ReferenceWhite.z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const;
}

const [magentaL, magentaA, magentaB] = lab(255, 0, 255);

async function expectMagenta(drawing: Locator, info: TestInfo, style?: string) {
  await expect(drawing).toHaveCSS("background-color", magenta);
  const screenshot = await drawing.screenshot({ ...capture, style });
  const { data, info: image } = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const matches = new Map<number, boolean>();
  let matchingPixels = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]!, g = data[index + 1]!, b = data[index + 2]!;
    const key = (r << 16) | (g << 8) | b;
    let matchesMagenta = matches.get(key);
    if (matchesMagenta === undefined) {
      const [lightness, a, blueYellow] = lab(r, g, b);
      matchesMagenta = Math.hypot(lightness - magentaL, a - magentaA, blueYellow - magentaB) <= 3;
      matches.set(key, matchesMagenta);
    }
    if (matchesMagenta && data[index + 3] === 255) matchingPixels++;
  }
  const fraction = matchingPixels / (image.width * image.height);
  if (fraction < 0.99) await info.attach("part pixels", { body: screenshot, contentType: "image/png" });
  expect(fraction, "Fraction of pixels within ΔE 3 of magenta").toBeGreaterThanOrEqual(0.99);
}

const cases: readonly { specimen: string; name: string; selector: string; captureStyle?: string }[] = [
  { specimen: "window-standard", name: "standard window bezel", selector: "#window-standard " + control("window") + " > " + part("bezel") },
  { specimen: "window-metal", name: "Metal window bezel", selector: "#window-metal " + control("window") + " > " + part("bezel") },
  { specimen: "app-view-chrome", name: "app view", selector: "#app-view-chrome " + control("app-view-chrome") + part("background") },
  { specimen: "toolbar", name: "toolbar background", selector: "#toolbar " + control("toolbar") + part("background") },
  { specimen: "toolbar-item", name: "toolbar item", selector: "#toolbar-item " + control("toolbar-item") + part("item") },
  { specimen: "tabs", name: "selected phone tab endcaps", selector: "#tabs " + part("cell") + selected },
  { specimen: "segments", name: "selected segment", selector: "#segments " + part("bezel") + selected },
  { specimen: "split-view", name: "split divider", selector: "#split-view " + part("divider") },
  {
    specimen: "menu",
    name: "open menu background",
    selector: control("menu") + part("background") + '[data-nse-role="command-menu"]',
    captureStyle: control("menu-item") + " { opacity: 0 !important; }",
  },
  { specimen: "menu", name: "highlighted menu item", selector: control("menu-item") + part("cell") + "[data-nse-highlighted]" },
  { specimen: "popover", name: "popover surface", selector: control("popover") + part("surface") },
  { specimen: "button", name: "rounded button bezel", selector: "#button " + part("bezel") },
  {
    specimen: "pop-up-button",
    name: "pop-up bezel",
    selector: "#pop-up-button " + part("bezel"),
    captureStyle: "#pop-up-button " + control("button") + " > " + part("title") + " { opacity: 0 !important; }",
  },
  { specimen: "box", name: "titled box bezel", selector: "#box " + control("box") + part("bezel") },
  { specimen: "box", name: "box legend", selector: "#box " + control("box") + " > " + part("title") },
];

for (const { specimen, name, selector, captureStyle } of cases) {
  test("drawn parts show no base paint — " + name, async ({ page }, info) => {
    await openSpecimen(page, specimen);
    await expectMagenta(page.locator(selector), info, captureStyle);
  });
}

test("undrawn states keep base paint", async ({ page }) => {
  for (const [specimen, name] of [["tabs", "cell"], ["segments", "bezel"]]) {
    const selector = "#" + specimen + " " + part(name) + ":not(" + selected + ")";
    const captureUndrawn = async () => {
      const drawings = page.locator(selector);
      await expect(drawings).toHaveCount(2);
      return [await drawings.nth(0).screenshot(capture), await drawings.nth(1).screenshot(capture)];
    };
    await openSpecimen(page, specimen, "none");
    const baseline = await captureUndrawn();
    await openSpecimen(page, specimen);
    for (const [index, image] of (await captureUndrawn()).entries()) {
      const themed = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const base = await sharp(baseline[index]!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([themed.info.width, themed.info.height]).toEqual([base.info.width, base.info.height]);
      expect(themed.data.equals(base.data), specimen + " undrawn part " + index + " pixel equality").toBe(true);
    }
  }
});

test("repainting the pop-up bezel keeps the arrow and value visible", async ({ page }) => {
  await openSpecimen(page, "pop-up-button");
  const popup = page.locator("#pop-up-button");
  const arrow = popup.locator(part("arrow"));
  await expect(arrow).toBeVisible();
  await expect(arrow).toHaveCSS("opacity", "1");
  await expect(popup.locator(part("content") + " > " + part("title"))).toBeVisible();
  await expect(popup.locator(control("button") + " > " + part("title"))).toHaveCSS("opacity", "1");
});

test("forced colours beat a theme's drawing", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  for (const [specimen, name] of [["search-field", "field"], ["pop-up-button-native", "bezel"]]) {
    await openSpecimen(page, specimen, "magenta", { colour: "1" });
    const system = await page.evaluate(() => {
      const swatch = document.createElement("span");
      swatch.style.cssText = "forced-color-adjust: none; background-color: Canvas; color: CanvasText";
      document.body.append(swatch);
      const colour = getComputedStyle(swatch);
      const paint = { background: colour.backgroundColor, border: colour.color };
      swatch.remove();
      return paint;
    });
    const drawing = page.locator("#" + specimen + " " + part(name));
    await expect(drawing).toHaveCSS("forced-color-adjust", "none");
    await expect(drawing).toHaveCSS("border-top-color", system.border);
    await expect(drawing).toHaveCSS("background-color", system.background);
    await expect(drawing).toHaveCSS("border-top-width", "1px");
  }
});

function hsl(r: number, g: number, b: number) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  const chroma = max - min, lightness = (max + min) / 2;
  if (!chroma) return { hue: 0, lightness, saturation: 0 };
  const sector = max === red ? (green - blue) / chroma : max === green ? 2 + (blue - red) / chroma : 4 + (red - green) / chroma;
  return { hue: (sector * 60 + 360) % 360, lightness, saturation: chroma / (1 - Math.abs(2 * lightness - 1)) };
}

async function dominantPaint(drawing: Locator) {
  const labels = [part("title"), part("image"), part("segment-image")].join(", ");
  const png = await drawing.screenshot({ ...capture, style: labels + " { opacity: 0 !important; }" });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colours = new Map<number, number>();
  for (let y = Math.ceil(info.height * 0.2); y < info.height * 0.8; y++) {
    for (let x = Math.ceil(info.width * 0.2); x < info.width * 0.8; x++) {
      const offset = (y * info.width + x) * info.channels;
      const rgb = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!;
      colours.set(rgb, (colours.get(rgb) ?? 0) + 1);
    }
  }
  const rgb = [...colours.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (rgb === undefined) throw new Error("Missing pixels inside the drawing");
  return hsl(rgb >> 16, (rgb >> 8) & 255, rgb & 255);
}

for (const specimen of ["button", "pop-up-button", "toolbar-item"]) {
  const property = specimen === "toolbar-item" ? "backgroundTintColour" : "bezelColour";
  test(property + " paints the bezel in every state — " + specimen, async ({ page }) => {
    const selector = specimen === "toolbar-item" ? control("toolbar-item") + part("item") : part("bezel");
    const bezel = page.locator("#" + specimen + " " + selector);
    await openSpecimen(page, specimen, "magenta", { colour: "1" });
    const button = page.locator("#" + specimen).getByRole("button").first();
    await expect(button).toBeEnabled();
    const resting = await dominantPaint(bezel);
    const { hue } = hsl(0xc8, 0x10, 0x2e);
    const hueDistance = Math.abs(resting.hue - hue);
    expect(Math.min(hueDistance, 360 - hueDistance)).toBeLessThanOrEqual(10);
    expect(resting.saturation).toBeGreaterThan(0.3);

    await button.hover();
    await page.mouse.down();
    await expect(button).toHaveAttribute("data-nse-highlighted", "");
    expect((await dominantPaint(bezel)).lightness).toBeLessThan(resting.lightness);
    await page.mouse.up();

    await openSpecimen(page, specimen, "magenta", { colour: "1", disabled: "1" });
    await expect(button).toHaveAttribute("data-nse-enabled", "false");
    expect((await dominantPaint(bezel)).saturation).toBeLessThan(resting.saturation);
  });
}

test("contentTintColour colours the title and template image", async ({ page }) => {
  await openSpecimen(page, "button", "magenta", { colour: "1", template: "1" });
  const root = page.locator("#button");
  await expect(root.locator(part("title"))).toHaveCSS("color", "rgb(200, 16, 46)");
  await expect(root.locator("[data-nse-image-template]")).toHaveCSS("background-color", "rgb(200, 16, 46)");
  await openSpecimen(page, "pop-up-button", "magenta", { colour: "1", template: "1" });
  await expect(page.locator("#pop-up-button " + part("content") + " > " + part("title"))).toHaveCSS("color", "rgb(200, 16, 46)");
});

async function interiorPixels(drawing: Locator) {
  const bounds = await drawing.boundingBox();
  if (!bounds) throw new Error("Missing part bounds");
  // A fractional edge can include a pixel from the neighbouring segment.
  const x = Math.ceil(bounds.x), y = Math.ceil(bounds.y);
  const clip = { x, y, width: Math.floor(bounds.x + bounds.width) - x, height: Math.floor(bounds.y + bounds.height) - y };
  return sharp(await drawing.page().screenshot({ ...capture, clip })).ensureAlpha().raw().toBuffer();
}

const segmentCases: readonly { name: string; options: Record<string, string>; drawingPart: string }[] = [
  { name: "rounded", options: {}, drawingPart: "bezel" },
  { name: "textured text", options: { textured: "1" }, drawingPart: "cell" },
  { name: "textured image", options: { textured: "1", segmentImage: "1" }, drawingPart: "bezel" },
];
for (const { name, options, drawingPart } of segmentCases) {
  test("selectedSegmentBezelColour paints only the selected segment — " + name, async ({ page }) => {
    await openSpecimen(page, "segments", "none", options);
    const bezels = page.locator("#segments " + part(drawingPart));
    const restBefore = await interiorPixels(bezels.nth(1));
    await openSpecimen(page, "segments", "none", { ...options, colour: "1" });
    expect((await interiorPixels(bezels.nth(1))).equals(restBefore)).toBe(true);
    const chosen = await dominantPaint(bezels.first());
    expect(chosen.hue).toBeGreaterThan(335);
    expect(chosen.saturation).toBeGreaterThan(0.3);
  });
}

test("box fillColour covers the bezel and legend", async ({ page }, info) => {
  await openSpecimen(page, "box", "none", { colour: "1" });
  const drawing = "#box " + control("box");
  const hide = drawing + " > " + part("title") + " { color: transparent !important; text-shadow: none !important; }";
  await expectMagenta(page.locator(drawing + part("bezel")), info, hide + drawing + " > " + part("content") + " { opacity: 0 !important; }");
  await expectMagenta(page.locator(drawing + " > " + part("title")), info, hide);
});

test("box borderColour replaces the bezel border artwork", async ({ page }) => {
  await openSpecimen(page, "box", "magenta", { border: "1" });
  const box = page.locator("#box " + control("box") + part("bezel"));
  await expect(box).toHaveCSS("border-image-source", "none");
  await expect(box).toHaveCSS("box-shadow", "rgb(200, 16, 46) 0px 0px 0px 1px inset");
});

test("backgroundTintColour is ignored on a borderless toolbar item", async ({ page }) => {
  const item = page.locator("#toolbar-item " + control("toolbar-item") + part("item"));
  const state = { borderless: "1" };
  await openSpecimen(page, "toolbar-item", "none", state);
  await expect(item).toBeEnabled();
  const before = await item.screenshot(capture);
  await openSpecimen(page, "toolbar-item", "none", { ...state, colour: "1" });
  await expect(item).toBeEnabled();
  expect((await item.screenshot(capture)).equals(before)).toBe(true);
});
