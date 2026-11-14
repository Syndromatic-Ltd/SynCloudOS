import { expect, test } from "playwright/test";

const fixture = "/tests/e2e/fixtures/hook-mirror/index.html";
const painted = ["background-image", "background-color", "border-radius", "border-image-source", "box-shadow", "color", "padding-left", "height"];

test("a hand-built control draws like a rendered one by the next frame", async ({ page }) => {
  await page.goto(fixture);
  await expect(page.locator("#hand-built")).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(null))));
  const styles = (id: string) => page.locator(id).evaluate((root, properties) => [root, ...root.querySelectorAll("*")].map(node => {
    const style = getComputedStyle(node);
    return [[...node.classList].filter(token => token.startsWith("nse:")).join(" "), ...properties.map(property => style.getPropertyValue(property))].join("|");
  }), painted);
  const rendered = await styles("#rendered");
  expect(rendered[0]).toContain("nse:control=button");
  expect(await styles("#hand-built")).toEqual(rendered);
});

test("setNSEHook mirrors in the same call, before any observer runs", async ({ page }) => {
  await page.goto(fixture);
  await expect(page.locator("#rendered")).toBeVisible();
  const result = await page.evaluate(() => {
    const element = document.createElement("div");
    document.body.append(element);
    (window as unknown as { setNSEHook(element: Element, name: string, value: string | null): void }).setNSEHook(element, "control", "box");
    const set = [...element.classList];
    (window as unknown as { setNSEHook(element: Element, name: string, value: string | null): void }).setNSEHook(element, "control", null);
    return { set, cleared: [...element.classList], attribute: element.hasAttribute("data-nse-control") };
  });
  expect(result).toEqual({ set: ["nse:control", "nse:control=box"], cleared: [], attribute: false });
});
