import { test, expect } from "playwright/test";
const gallery = "/tests/e2e/fixtures/theme-gallery.html";
for (const theme of ["metro", "atmo"]) for (const appearance of ["light", "dark"]) {
  test(`${theme} ${appearance}: standard controls and retained destinations`, async ({ page }) => {
    const errors: string[]=[]; page.on("pageerror", error=>errors.push(error.message));
    await page.goto(gallery);
    await page.getByLabel("Theme", {exact:true}).selectOption(theme);
    await page.getByLabel("Appearance", {exact:true}).selectOption(appearance);
    await page.getByLabel("Phone width",{exact:true}).check();
    await page.getByRole("button", {name:"Create",exact:true}).click();
    await expect(page.getByText("1 created",{exact:true})).toBeVisible();
    await page.getByRole("tab", {name:"notes",exact:true}).click();
    const note=page.getByRole("textbox",{name:"Retained note"}); await note.fill("Keep my state");
    await page.getByRole("tab", {name:"collection",exact:true}).click();
    await page.getByRole("tab", {name:"notes",exact:true}).click();
    await expect(note).toHaveValue("Keep my state");
    await page.getByLabel("Theme",{exact:true}).selectOption(theme==="metro"?"atmo":"metro");
    await expect(note).toHaveValue("Keep my state");
    await page.getByLabel("Appearance",{exact:true}).selectOption(appearance==="dark"?"light":"dark");
    await expect(note).toHaveValue("Keep my state");
    await expect(page.locator("[data-nse-theme]").first()).toHaveAttribute("data-nse-appearance",appearance==="dark"?"light":"dark");
    expect(errors).toEqual([]);
  });
}
test("Metro repeated navigation, reduced motion, RTL and compact layout",async({page})=>{
  await page.goto(gallery); await page.getByLabel("Reduced motion",{exact:true}).check();
  await page.getByLabel("Phone width",{exact:true}).check(); await page.getByLabel("RTL",{exact:true}).check();
  for(const name of ["notes","about","collection","notes"]) await page.getByRole("tab",{name,exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Retained note"})).toBeVisible();
  await expect(page.locator(".lab-device")).toHaveAttribute("data-phone","true");
  expect(await page.locator(".gallery-surface").evaluate(node=>getComputedStyle(node).direction)).toBe("rtl");
});
