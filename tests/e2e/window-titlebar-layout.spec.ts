import { expect, test } from "playwright/test";

const fixture = "/tests/e2e/fixtures/window-titlebar-layout.html";
test("frame-view paint stays in its window and falls back after a failed load", async ({ page }) => {
  await page.goto(`${fixture}?frame`);
  const title = page.locator("[data-window-title]").filter({ hasText: "A long document title" });
  const sibling = page.locator("[data-window-title]").filter({ hasText: "Another window" });
  await expect(title).toHaveCSS("color", "rgb(21, 101, 183)");
  await expect(sibling).not.toHaveCSS("color", "rgb(21, 101, 183)");
  await page.getByRole("button", { name: "Fail stylesheet" }).click();
  await expect(title).not.toHaveCSS("color", "rgb(21, 101, 183)");
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
});

test("sidebar tracking separator follows the split edge and hides on collapse", async ({ page }) => {
  await page.goto(`${fixture}?tracking`);
  const header = page.locator("[data-window-titlebar]");
  const separator = header.locator("[data-window-sidebar-tracking-separator]");
  await expect(separator).toBeVisible();
  const edge = async () => (await separator.boundingBox())!.x - (await header.boundingBox())!.x;
  expect(await edge()).toBeCloseTo(200, 0);
  await page.getByRole("button", { name: "Resize sidebar" }).click();
  await expect.poll(edge).toBeCloseTo(260, 0);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(separator).toBeHidden();
});
test("floating sidebar tracking stays aligned to the window edge", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${fixture}?tracking&floating&cumulus&width=1400`);
  const frame = page.locator("[data-layout-fixture]");
  const separator = page.locator("[data-window-sidebar-tracking-separator]");
  await expect(separator).toBeVisible();
  expect((await separator.boundingBox())!.x - (await frame.boundingBox())!.x).toBeCloseTo(200, 0);
});

for (const menu of [false, true]) test(`Cumulus glass follows the title row with menu ${menu}`, async ({ page }) => {
  await page.goto(`${fixture}?cumulus${menu ? "&menu" : ""}`);
  await expect(page.getByRole("toolbar")).toBeVisible();
  const row = (await page.locator("[data-window-titlebar-row]").boundingBox())!;
  const glass = (await page.locator(".nse-app-topbar-base").boundingBox())!;
  expect(glass.y).toBeGreaterThanOrEqual(row.y - 1);
  expect(glass.y).toBeLessThanOrEqual(row.y);
  expect(glass.y + glass.height).toBeGreaterThanOrEqual(row.y + row.height);
  expect(glass.y + glass.height).toBeLessThanOrEqual(row.y + row.height + 1);
});
for (const style of ["automatic", "unified", "unifiedCompact", "expanded", "preference"]) test(`floating Cumulus constrains ${style} without changing toolbar ownership`, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${fixture}?style=${style}&width=1400&floating&cumulus`);
  await expect(page.getByRole("toolbar")).toBeVisible();
  const frame = (await page.locator("[data-layout-fixture]").boundingBox())!;
  const bar = (await page.locator("[data-window-titlebar]").boundingBox())!;
  expect(bar.width).toBe(1100);
  expect(Math.abs(bar.x + bar.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(1);
  await expect(page.locator('[data-nse-part="floating-titlebar"]')).toHaveCount(1);
  await expect(page.getByRole("toolbar")).toHaveCount(1);
});

test("Metal stays attached when floating is requested", async ({ page }) => {
  await page.goto(`${fixture}?width=900&floating`);
  await expect(page.getByRole("toolbar")).toBeVisible();
  const frame = (await page.locator("[data-layout-fixture]").boundingBox())!;
  const bar = (await page.locator("[data-window-titlebar]").boundingBox())!;
  expect(bar.width).toBe(frame.width);
  await expect(page.locator('[data-nse-part="floating-titlebar"]')).toHaveCount(0);
});
for (const style of ["automatic", "unified", "unifiedCompact", "expanded", "preference"]) {
  test(`${style} uses measured title and toolbar rows`, async ({ page }) => {
    await page.goto(`${fixture}?style=${style}`);
    const bar = page.locator("[data-window-titlebar]"), row = page.locator("[data-window-titlebar-row]"), toolbar = page.getByRole("toolbar");
    await expect(toolbar).toBeVisible();
    const [barBox, rowBox, toolBox, bottomBox] = await Promise.all([bar.boundingBox(), row.boundingBox(), toolbar.boundingBox(), page.getByText("Bottom accessory").boundingBox()]);
    expect(barBox).not.toBeNull(); expect(rowBox).not.toBeNull(); expect(toolBox).not.toBeNull(); expect(bottomBox).not.toBeNull();
    if (style === "expanded" || style === "preference") expect(toolBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height - 1);
    else { expect(toolBox!.y).toBeGreaterThanOrEqual(rowBox!.y); expect(toolBox!.y + toolBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height + 1); }
    expect(bottomBox!.y).toBeGreaterThanOrEqual(toolBox!.y + toolBox!.height - 1);
    expect(bottomBox!.y + bottomBox!.height).toBeLessThanOrEqual(barBox!.y + barBox!.height + 1);
    const leading = await page.getByRole("button", { name: "Leading" }).boundingBox();
    const trailing = await page.getByRole("combobox").boundingBox();
    expect(leading!.width).toBe(60); expect(trailing!.width).toBe(90);
    if (style === "preference") {
      const first = await page.getByRole("button", { name: "Action 1", exact: true }).boundingBox();
      const last = await page.getByRole("button", { name: "Action 8", exact: true }).boundingBox();
      expect(Math.abs((first!.x + last!.x + last!.width) / 2 - (toolBox!.x + toolBox!.width / 2))).toBeLessThanOrEqual(2);
    }
  });
}

test("narrow unified toolbar sends hidden commands to the actual overflow menu", async ({ page }) => {
  await page.goto(`${fixture}?width=420`);
  const toolbar = page.getByRole("toolbar");
  await expect(toolbar).toHaveAttribute("data-nse-toolbar-overflow", "true");
  await expect(toolbar).not.toHaveAttribute("data-nse-toolbar-clipped", "true");
  const bounds = await toolbar.boundingBox();
  for (const button of await toolbar.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  }
  await toolbar.getByRole("button", { name: "More toolbar items" }).click();
  await expect(page.getByRole("menuitem", { name: "Action 8", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Action 8", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { titlebarLayoutRequests: string[] }).titlebarLayoutRequests)).toContain("action-8");
});

for (const side of ["left", "right"]) test(`native ${side} controls retain their occupied rectangle`, async ({ page }) => {
  await page.goto(`${fixture}?native=${side}`);
  const bar = page.locator("[data-window-titlebar]");
  await expect(bar).toHaveCSS(side === "left" ? "padding-left" : "padding-right", "120px");
  const bounds = (await bar.boundingBox())!;
  for (const element of [page.getByRole("button", { name: "Leading" }), page.getByRole("toolbar"), page.getByRole("combobox")]) {
    const box = (await element.boundingBox())!;
    if (side === "left") expect(box.x).toBeGreaterThanOrEqual(bounds.x + 120);
    else expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width - 120);
  }
});

test("interactive titlebar items do not start dragging", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Leading" }).click();
  await page.getByRole("button", { name: "Action 1", exact: true }).click();
  await page.getByRole("combobox").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-drag-count]")).toHaveText("0");
});
