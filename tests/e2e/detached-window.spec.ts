import { expect, test, type Page } from "playwright/test";

const fixture = "/tests/e2e/fixtures/detached-window.html";

async function detach(page: Page) {
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Detach Window", exact: true }).click();
  return popup;
}

test("moves the mounted Webspring window through a browser popup and returns on OS close", async ({ page }) => {
  await page.goto(fixture);
  const draft = page.getByRole("textbox", { name: "Draft" });
  await draft.fill("an unsaved draft");
  await draft.evaluate(node => { (node as HTMLElement).dataset.retainedEditor = "yes"; });
  const id = await page.getByLabel("Window identity").innerText();

  await page.getByRole("button", { name: "Exit Full Screen" }).click();
  await expect(page.locator("[data-window-id]").getByRole("textbox", { name: "Draft" })).toHaveValue("an unsaved draft");
  const child = await detach(page);
  const childEditor = child.getByRole("textbox", { name: "Draft" });
  await expect(childEditor).toHaveValue("an unsaved draft");
  await expect(childEditor).toHaveAttribute("data-retained-editor", "yes");
  await expect(child.getByLabel("Window identity")).toHaveText(id);
  await expect(child.getByLabel("Window loads")).toHaveText("1");
  await expect(draft).toHaveCount(0);
  await expect(childEditor).toBeFocused();
  expect(await child.locator("[data-window-id]").count()).toBe(1);
  expect(await child.locator("head style, head link[rel~='stylesheet']").count()).toBeGreaterThan(0);
  await child.setViewportSize({ width: 420, height: 600 });
  await expect(child.locator("[data-local-window-width]")).toHaveAttribute("data-local-window-width", "420");
  expect(await page.evaluate(() => innerWidth)).toBeGreaterThan(420);

  await child.getByRole("button", { name: "Open sheet" }).click();
  const sheet = child.getByRole("alertdialog", { name: "Keep draft?" });
  await expect(sheet).toBeVisible();
  await child.keyboard.press("Tab");
  expect(await sheet.evaluate(el => el.contains(el.ownerDocument.activeElement))).toBe(true);
  await child.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(child.getByRole("button", { name: "Open sheet" })).toBeFocused();

  await child.getByRole("button", { name: "Close Transfer editor" }).click();
  await expect.poll(() => page.evaluate(() => (document as Document & { transferProbe: { closeAttempts(): number } }).transferProbe.closeAttempts())).toBe(1);
  expect(child.isClosed()).toBe(false);
  await expect(childEditor).toHaveValue("an unsaved draft");

  await childEditor.fill("edited in popup");
  await child.getByRole("button", { name: "Reattach to Webspring" }).click();
  await expect(draft).toHaveValue("edited in popup");
  await expect(draft).toHaveAttribute("data-retained-editor", "yes");
  await expect(draft).toBeFocused();
  await expect.poll(() => child.isClosed()).toBe(true);

  const second = await detach(page);
  await expect(second.getByRole("textbox", { name: "Draft" })).toHaveValue("edited in popup");
  await second.close();
  await expect(draft).toHaveValue("edited in popup");
  await expect(page.getByLabel("Window loads")).toHaveText("1");
  await page.getByRole("button", { name: "Enter Full Screen Transfer editor" }).click();
  await expect(page.locator(".webspring-app-view-fullbleed-content").getByRole("textbox", { name: "Draft" })).toHaveValue("edited in popup");
});

test("presents the populated floating window before the stage exit hides its editor", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(fixture);
  const draft = page.getByRole("textbox", { name: "Draft" });
  await draft.fill("An unsaved draft");
  const exit = page.getByRole("button", { name: "Exit Full Screen" });
  await page.evaluate(() => {
    const sampleExit = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest('[data-window-control="fullScreen"]');
      if (!button) return;
      document.removeEventListener("click", sampleExit, true);
      const captured: boolean[] = [];
      const sample = () => {
        const editor = document.querySelector<HTMLInputElement>('input[aria-label="Draft"]');
        captured.push(Boolean(editor?.closest("[data-window-id]") && editor.getBoundingClientRect().width > 0));
        if (captured.length === 4) document.documentElement.dataset.transferFrames = captured.join(",");
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    document.addEventListener("click", sampleExit, true);
  });
  await exit.click();
  await expect(page.locator("html")).toHaveAttribute("data-transfer-frames", "true,true,true,true");
  await expect(draft).toHaveValue("An unsaved draft");
});
