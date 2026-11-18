/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { expect, test, type Locator, type Page } from "playwright/test";

const fixture = "/tests/e2e/fixtures/theme-app-scope/index.html";
const red = "rgb(204, 34, 51)";
const darkRed = "rgb(141, 32, 50)";
const dusk = "rgb(46, 82, 103)";
const appTheme = "com.example.red-chrome";
const systemTheme = "com.example.dusk";
const tabBackground = '[data-nse-control="tab-view"][data-nse-part="background"]';
const selectedTab = (page: Page) => page.locator("#app-chrome").getByRole("tab", { selected: true });
const background = (part: Locator, colour: string) => expect(part).toHaveCSS("background-color", colour);
const boundary = (part: Locator, attribute: string) =>
  part.evaluate((element, name) => element.closest(`[${name}]`)?.getAttribute(name) ?? null, attribute);

test.use({ colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1040, height: 800 } });

test("app theme draws allowed chrome", async ({ page }) => {
  await page.goto(fixture);
  await background(selectedTab(page), red);
});

test("system theme continues inside an app theme", async ({ page }) => {
  await page.goto(fixture);
  const button = page.locator('#app-button > [data-nse-part="bezel"]');
  await background(button, dusk);
  expect(await boundary(button, "data-nse-app-theme")).toBe(appTheme);
  expect(await boundary(button, "data-nse-theme")).toBe(systemTheme);
});

test("semantic colours carry through", async ({ page }) => {
  await page.goto(fixture);
  const labelColour = (locator: Locator) =>
    locator.evaluate(element => getComputedStyle(element).getPropertyValue("--nse-colour-label").trim());
  const outside = await labelColour(page.locator("#outside-appearance"));
  expect(outside).toBe("#112233");
  expect(await labelColour(page.locator("#app-chrome"))).toBe(outside);
});

test("system surfaces stop app themes", async ({ page }) => {
  await page.goto(fixture);
  await background(page.locator("#app-chrome").locator(tabBackground), red);
  await page.getByRole("button", { name: "Show save panel" }).click();
  const savePanel = page.getByRole("dialog", { name: "Save file" });
  await expect(savePanel.getByRole("button", { name: "Choose destination" })).toBeVisible();
  await expect(savePanel).toHaveAttribute("data-nse-system-surface", "");
  await background(savePanel, dusk);
  expect(await boundary(savePanel, "data-nse-theme")).toBe(systemTheme);
  await savePanel.getByRole("button", { name: "Cancel" }).click();
  await expect(savePanel).toBeHidden();

  await page.getByRole("button", { name: "Show colour panel" }).click();
  const colourPanel = page.locator('[data-nse-control="colour-panel"][data-nse-part="background"]');
  await expect(colourPanel).toHaveAttribute("data-nse-system-surface", "");
  const pickers = colourPanel.locator(tabBackground);
  await background(pickers, dusk);
  expect(await boundary(pickers, "data-nse-theme")).toBe(systemTheme);
});

test("portal surfaces carry the app theme", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Actions", exact: true }).press("ArrowDown");
  const menu = page.locator('[data-nse-control="menu"][data-nse-part="background"][data-nse-role="command-menu"]');
  await expect(menu.getByRole("menuitem", { name: "Open document" })).toBeVisible();
  await expect(page.locator("#app-chrome").locator(menu)).toHaveCount(0);
  await background(menu, red);
  expect(await boundary(menu, "data-nse-app-theme")).toBe(appTheme);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await page.getByRole("button", { name: "Show popover" }).click();
  const popover = page.locator('#app-scope-popover[data-nse-control="popover"][data-nse-part="surface"]');
  await expect(popover.getByText("Document notes")).toBeVisible();
  await expect(page.locator("#app-chrome").locator(popover)).toHaveCount(0);
  await background(popover, red);
  expect(await boundary(popover, "data-nse-app-theme")).toBe(appTheme);
});

test("nameless appearance follows the scheme", async ({ page }) => {
  await page.goto(fixture + "?appearance=nameless");
  const tab = selectedTab(page);
  await background(tab, red);
  expect(await boundary(tab, "data-nse-colour-scheme-resolved")).toBe("light");

  await page.getByRole("button", { name: "Set dark scheme" }).click();
  await background(tab, darkRed);
  expect(await boundary(tab, "data-nse-colour-scheme-resolved")).toBe("dark");
});

const blue = "rgb(34, 85, 204)";
const windowTheme = "com.example.blue-chrome";

async function openApplicationWindows(page: Page) {
  await page.goto(fixture + "?host=application");
  const stage = page.locator('[data-nse-control="app-view-chrome"]').filter({ has: page.locator("#main-document") });
  await stage.getByRole("button", { name: "Open secondary window" }).click();
  const secondary = page.locator('[data-window-id][data-nse-control="window"]').filter({ has: page.locator("#secondary-document") });
  await expect(secondary).toBeVisible();
  return {
    stage,
    secondary,
    mainTab: stage.getByRole("tab", { selected: true }),
    secondaryTab: secondary.getByRole("tab", { selected: true }),
  };
}

test("application appearance reaches every app window", async ({ page }) => {
  const { stage, secondary, mainTab, secondaryTab } = await openApplicationWindows(page);
  await secondary.getByRole("button", { name: "Set application appearance" }).click();
  await background(mainTab, red);
  await background(secondaryTab, red);
  expect(await boundary(stage, "data-nse-app-theme")).toBe(appTheme);
  expect(await boundary(secondary, "data-nse-app-theme")).toBe(appTheme);

  await secondary.getByRole("button", { name: "Open draft sheet" }).click();
  const sheet = page.getByRole("alertdialog", { name: "Keep draft?" });
  await expect(sheet).toBeVisible();
  expect(await boundary(sheet, "data-nse-app-theme")).toBe(appTheme);
  expect(await boundary(sheet, "data-nse-system-surface")).toBeNull();
});

test("window appearance overrides the application's", async ({ page }) => {
  const { secondary, mainTab, secondaryTab } = await openApplicationWindows(page);
  await secondary.getByRole("button", { name: "Set application appearance" }).click();
  await background(secondaryTab, red);
  await secondary.getByRole("button", { name: "Open document notes" }).click();
  const notes = page.locator('#application-appearance-popover[data-nse-control="popover"][data-nse-part="surface"]');
  await background(notes, red);

  await notes.getByRole("button", { name: "Change window appearance" }).click();
  await background(secondaryTab, blue);
  await background(mainTab, red);
  await background(notes, blue);
  expect(await boundary(notes, "data-nse-app-theme")).toBe(windowTheme);
});

test("setting null restores the system look", async ({ page }) => {
  const { stage, secondary, secondaryTab } = await openApplicationWindows(page);
  await secondary.getByRole("button", { name: "Set application appearance" }).click();
  await secondary.getByRole("button", { name: "Set window appearance" }).click();
  await background(secondaryTab, blue);
  await secondary.getByRole("button", { name: "Clear window appearance" }).click();
  await background(secondaryTab, red);

  await secondary.getByRole("button", { name: "Clear application appearance" }).click();
  await background(stage.locator(tabBackground), dusk);
  await background(secondary.locator(tabBackground), dusk);
  expect(await boundary(stage, "data-nse-app-theme")).toBeNull();
  expect(await boundary(secondary, "data-nse-app-theme")).toBeNull();
});

test("System Preferences is untouched", async ({ page }) => {
  const { secondary, secondaryTab } = await openApplicationWindows(page);
  await secondary.getByRole("button", { name: "Set application appearance" }).click();
  await background(secondaryTab, red);

  await secondary.getByRole("button", { name: "Open System Preferences" }).click();
  const preferences = page.getByRole("dialog", { name: "System Preferences" });
  await expect(preferences).toBeVisible();
  expect(await boundary(preferences, "data-nse-system-surface")).toBe("");
  await expect(preferences.locator("[data-nse-app-theme]")).toHaveCount(0);
  expect(await boundary(preferences, "data-nse-app-theme")).toBeNull();
  expect(await boundary(secondary, "data-nse-app-theme")).toBe(appTheme);
});
