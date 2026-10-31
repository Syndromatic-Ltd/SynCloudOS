import { expect, test } from "playwright/test";

const fixture = "/__framework-tests/windows/management?scenario=geometry";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`open popover and unsaved content survive repeated geometry changes (${reducedMotion})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1200, height: 800 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(fixture);
    const parent = page.getByRole("dialog", { name: "Diagnostics", exact: true });
    await expect(parent).toBeVisible();
    const draft = parent.getByRole("textbox", { name: "Continuity draft" });
    await draft.fill("Retain this unsaved document");
    const draftIdentity = await draft.elementHandle();
    const originalBounds = await parent.getByTestId("geometry-normal-bounds").textContent();
    const trigger = parent.getByRole("button", { name: "Geometry popover", exact: true });
    await trigger.click();
    const popover = page.getByRole("dialog", { name: "Geometry continuity popover", exact: true });
    await expect(popover).toBeVisible();
    const popoverId = await popover.getAttribute("data-window-id");
    const popoverDraft = popover.getByRole("textbox", { name: "Popover draft" });
    await popoverDraft.fill("Retain this popover");
    const popoverIdentity = await popoverDraft.elementHandle();
    const authority = page.getByTestId("geometry-authority");
    await expect(authority).toHaveText(JSON.stringify({ state: "current", safeArea: "unavailable" }));
    const beforeInvalid = await popover.boundingBox();
    const restore = await page.evaluateHandle(() => {
      const previous = Object.getOwnPropertyDescriptor(window, "innerHeight");
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 0 });
      window.dispatchEvent(new Event("resize"));
      return () => {
        if (previous) Object.defineProperty(window, "innerHeight", previous);
        else Reflect.deleteProperty(window, "innerHeight");
        window.dispatchEvent(new Event("resize"));
      };
    });
    try {
      await expect(authority).toHaveText(JSON.stringify({ state: "retained", safeArea: "unavailable" }));
      expect(await popover.boundingBox()).toEqual(beforeInvalid);
      expect(await popoverDraft.evaluate((element, original) => element === original, popoverIdentity)).toBe(true);
    } finally {
      await restore.evaluate(restoreGeometry => restoreGeometry());
      await restore.dispose();
    }
    await expect(authority).toHaveText(JSON.stringify({ state: "current", safeArea: "unavailable" }));

    for (const viewport of [
      { width: 951, height: 585 }, { width: 669, height: 867 },
      { width: 382, height: 580 }, { width: 800, height: 280 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(popover).toHaveAttribute("data-window-id", popoverId!);
      await expect(draft).toHaveValue("Retain this unsaved document");
      await expect(popoverDraft).toHaveValue("Retain this popover");
      expect(await draft.evaluate((element, original) => element === original, draftIdentity)).toBe(true);
      expect(await popoverDraft.evaluate((element, original) => element === original, popoverIdentity)).toBe(true);
      await expect(parent.getByTestId("geometry-normal-bounds")).toHaveText(originalBounds!);
      if (viewport.width >= 768 && viewport.height < 520) {
        const frame = await parent.boundingBox();
        expect(frame!.y).toBeGreaterThanOrEqual(0);
        expect(frame!.y + frame!.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      await expect.poll(async () => {
        const bounds = await popover.boundingBox();
        return Boolean(bounds && bounds.x >= -1 && bounds.y >= -1 &&
          bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
      }).toBe(true);
      if (viewport.width === 382) await page.screenshot({ path: testInfo.outputPath("compact-continuity.png") });
    }
    const before = await popover.boundingBox();
    await parent.getByTestId("geometry-anchor-scroll").evaluate(element => { element.scrollTop = 40; });
    await expect.poll(async () => (await popover.boundingBox())?.y).toBeCloseTo(before!.y - 40, 0);
    await page.screenshot({ path: testInfo.outputPath("wide-continuity.png") });
    await popover.getByRole("button", { name: "Close geometry popover", exact: true }).click();
    await page.setViewportSize({ width: 1100, height: 650 });
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(draft).toHaveValue("Retain this unsaved document");
    expect(errors).toEqual([]);
  });
}

test("regular shallow window keeps end controls reachable and restores its normal frame", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(fixture);
  const parent = page.getByRole("dialog", { name: "Diagnostics", exact: true });
  const original = await parent.boundingBox();
  const draft = parent.getByRole("textbox", { name: "Continuity draft" });
  await draft.fill("Keep this document through shallow presentation");
  const identity = await draft.elementHandle();
  await page.setViewportSize({ width: 1000, height: 180 });
  await expect.poll(async () => (await parent.boundingBox())?.height).toBeLessThanOrEqual(180);
  const end = parent.getByRole("button", { name: "Document end action", exact: true });
  await end.scrollIntoViewIfNeeded();
  await end.evaluate(element => element.addEventListener("click", () => element.setAttribute("data-test-activated", "true"), { once: true }));
  await end.click();
  await expect(end).toHaveAttribute("data-test-activated", "true");
  // Pointer activation does not focus native buttons in every browser. Test
  // reachability and explicit focus without changing the platform's policy.
  await end.focus();
  await expect(end).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("shallow-regular.png") });
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect.poll(async () => await parent.boundingBox()).toEqual(original);
  await expect(draft).toHaveValue("Keep this document through shallow presentation");
  expect(await draft.evaluate((element, original) => element === original, identity)).toBe(true);
});

test("initial unavailable geometry waits for measurement without losing the opened window", async ({ page }) => {
  await page.addInitScript(() => {
    const previous = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 0 });
    Reflect.set(window, "restoreTestGeometry", () => {
      if (previous) Object.defineProperty(window, "innerHeight", previous);
      else Reflect.deleteProperty(window, "innerHeight");
      window.dispatchEvent(new Event("resize"));
      Reflect.deleteProperty(window, "restoreTestGeometry");
    });
  });
  await page.goto(fixture);
  await expect(page.getByTestId("geometry-authority")).toHaveText(JSON.stringify({ state: "unavailable", safeArea: "unavailable" }));
  const parent = page.getByRole("dialog", { name: "Diagnostics", exact: true });
  await expect(parent).toHaveCount(0);
  await page.evaluate(() => Reflect.get(window, "restoreTestGeometry")());
  await expect(parent).toBeVisible();
  await expect(parent.getByRole("textbox", { name: "Continuity draft" })).toHaveValue("Unsaved draft");
});
