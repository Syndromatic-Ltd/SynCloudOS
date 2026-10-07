/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { expect, test, type Page } from "playwright/test";
import type {} from "./fixtures/custom-text-surface";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/e2e/fixtures/custom-text-surface.html");
  await expect(page.locator("#fixture-error")).toBeEmpty();
  await page.waitForFunction(() => {
    const state = window.customTextSurface?.getSnapshot();
    return state?.geometryReady && state.inputClients.length === 3 || !!document.getElementById("fixture-error")?.textContent;
  });
  await expect(page.locator("#fixture-error")).toBeEmpty();
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
  browserErrors.delete(page);
  await expect(page.locator("[data-input-error]")).toHaveCount(0);
});

async function expectSharedText(page: Page, bodyText: string, captionText: string) {
  await expect.poll(() => page.evaluate(() => window.customTextSurface!.getSnapshot())).toMatchObject({ bodyText, captionText });
  await expect(page.getByRole("textbox", { name: "Body", exact: true })).toHaveValue(bodyText);
  await expect(page.getByRole("textbox", { name: "Body mirror", exact: true })).toHaveValue(bodyText);
  await expect(page.getByRole("textbox", { name: "Caption", exact: true })).toHaveValue(captionText);
  return page.evaluate(() => window.customTextSurface!.getSnapshot());
}

test("custom views share canonical text and document undo while selections and caption stay independent", async ({ page }) => {
  const initial = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  const initialModel = await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model);
  expect(initial.history).toEqual({ canUndo: false, canRedo: false });
  await page.evaluate(() => {
    window.customTextSurface!.select("bodyMirror", 8, 8);
    window.customTextSurface!.select("body", 0, 5);
  });
  const body = page.getByRole("textbox", { name: "Body", exact: true });
  await body.focus();
  await body.pressSequentially("Hello");
  const edited = await expectSharedText(page, `Hello${initial.bodyText.slice(5)}`, initial.captionText);
  const editedModel = await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model);
  expect(edited.selections.body).toEqual({ location: 5, length: 0 });
  expect(edited.selections.bodyMirror).toEqual({ location: 8, length: 0 });
  expect(edited.selections.caption).toEqual(initial.selections.caption);
  expect(edited.history).toEqual({ canUndo: true, canRedo: false });
  // Replacing the selection with H is one action; contiguous ello insertions coalesce into another.
  const replacementText = `H${initial.bodyText.slice(5)}`;
  await page.getByTestId("undo").click();
  const replacement = await expectSharedText(page, replacementText, initial.captionText);
  expect(replacement.history).toEqual({ canUndo: true, canRedo: true });
  expect(replacement.selections.bodyMirror).toEqual({ location: 4, length: 0 });
  expect(replacement.selections.caption).toEqual(initial.selections.caption);
  await page.getByTestId("undo").click();
  const restored = await expectSharedText(page, initial.bodyText, initial.captionText);
  expect(restored.history).toEqual({ canUndo: false, canRedo: true });
  expect(restored.selections.bodyMirror).toEqual({ location: 8, length: 0 });
  expect(restored.selections.caption).toEqual(initial.selections.caption);
  expect(await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model)).toEqual(initialModel);
  await expect(page.getByTestId("undo")).toBeDisabled();
  await page.getByTestId("redo").click();
  const replayedReplacement = await expectSharedText(page, replacementText, initial.captionText);
  expect(replayedReplacement.history).toEqual({ canUndo: true, canRedo: true });
  expect(replayedReplacement.selections.bodyMirror).toEqual(replacement.selections.bodyMirror);
  expect(replayedReplacement.selections.caption).toEqual(initial.selections.caption);
  await page.getByTestId("redo").click();
  const replayed = await expectSharedText(page, edited.bodyText, initial.captionText);
  expect(replayed.history).toEqual(edited.history);
  expect(replayed.selections.bodyMirror).toEqual(edited.selections.bodyMirror);
  expect(replayed.selections.caption).toEqual(initial.selections.caption);
  expect(await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model)).toEqual(editedModel);
  await expect(page.getByTestId("redo")).toBeDisabled();
});

test("contiguous native typing in the mirror is one document undo action with mapped independent selections", async ({ page }) => {
  const initial = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  const initialModel = await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model);
  expect(initial.history).toEqual({ canUndo: false, canRedo: false });
  await page.evaluate(() => {
    window.customTextSurface!.select("body", 8);
    window.customTextSurface!.select("bodyMirror", 5);
  });
  const mirror = page.getByRole("textbox", { name: "Body mirror", exact: true });
  await mirror.focus();
  await mirror.pressSequentially(" beta");
  const edited = await expectSharedText(page, `${initial.bodyText.slice(0, 5)} beta${initial.bodyText.slice(5)}`, initial.captionText);
  const editedModel = await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model);
  expect(edited.history).toEqual({ canUndo: true, canRedo: false });
  expect(edited.selections.body).toEqual({ location: 13, length: 0 });
  expect(edited.selections.bodyMirror).toEqual({ location: 10, length: 0 });
  expect(edited.selections.caption).toEqual(initial.selections.caption);
  await page.getByTestId("undo").click();
  const restored = await expectSharedText(page, initial.bodyText, initial.captionText);
  expect(restored.history).toEqual({ canUndo: false, canRedo: true });
  expect(restored.selections.body).toEqual({ location: 8, length: 0 });
  expect(restored.selections.caption).toEqual(initial.selections.caption);
  expect(await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model)).toEqual(initialModel);
  await expect(page.getByTestId("undo")).toBeDisabled();
  await page.getByTestId("redo").click();
  const replayed = await expectSharedText(page, edited.bodyText, initial.captionText);
  expect(replayed.history).toEqual(edited.history);
  expect(replayed.selections.body).toEqual(edited.selections.body);
  expect(replayed.selections.caption).toEqual(initial.selections.caption);
  expect(await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!.model)).toEqual(editedModel);
  await expect(page.getByTestId("redo")).toBeDisabled();
});

test("a mixed inspector retains its body target across focus movement", async ({ page }) => {
  await page.evaluate(() => window.customTextSurface!.select("body", 0, 20));
  await expect(page.getByTestId("font-size-state")).toHaveText("mixed");
  await page.getByTestId("font-size-input").fill("21");
  const before = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  await page.evaluate(() => window.customTextSurface!.activate("caption"));
  await page.getByTestId("font-size-apply").click();
  await page.evaluate(() => window.customTextSurface!.activate("body"));
  await expect(page.getByTestId("font-size-state")).toHaveText("21px");
  await expect.poll(() => page.evaluate(() => window.customTextSurface!.getSnapshot().geometryReady)).toBe(true);
  const after = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  expect(after.captionText).toBe(before.captionText);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.fontGeneration).toBeGreaterThan(before.fontGeneration);
});

test("the same shaped caret maps through zoom and scroll without semantic mutation", async ({ page }) => {
  await page.getByRole("textbox", { name: "Body", exact: true }).focus();
  await page.evaluate(() => window.customTextSurface!.select("body", 0));
  const surface = page.getByTestId("body-surface").locator("svg").first();
  await surface.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  const first = await page.evaluate(() => window.customTextSurface!.firstRect("body", { location: 0, length: 0 }));
  expect(first?.status).toBe("ready");
  if (first?.status !== "ready") throw new Error(JSON.stringify(first));
  await page.evaluate(() => window.customTextSurface!.setZoom(1.5));
  const second = await page.evaluate(() => window.customTextSurface!.firstRect("body", { location: 0, length: 0 }));
  expect(second?.status).toBe("ready");
  if (second?.status !== "ready") throw new Error(JSON.stringify(second));
  expect(second.rect.rect.height / first.rect.rect.height).toBeCloseTo(1.5, 5);
  expect(second.rect.transformRevision).toBeGreaterThan(first.rect.transformRevision);
  const top = await surface.boundingBox();
  expect(top).not.toBeNull();
  await page.mouse.click(top!.x + 20 * 1.5, top!.y + 26 * 1.5);
  await expect(page.getByRole("textbox", { name: "Body", exact: true })).toBeFocused();
  await page.evaluate(() => { const boxes = document.querySelector('[data-testid="body-surface"] .shaped-boxes')!; boxes.scrollTop = 70; });
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-testid="body-surface"] .shaped-boxes')!.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const rect = window.customTextSurface!.firstRect("body", { location: 0, length: 0 });
    return rect?.status === "ready" ? rect.rect.transformRevision : -1;
  })).toBeGreaterThan(second.rect.transformRevision);
  await page.evaluate(() => window.customTextSurface!.select("body", 0));
  const scrolled = await page.evaluate(() => window.customTextSurface!.firstRect("body", { location: 0, length: 0 }));
  expect(scrolled?.status).toBe("ready");
  if (scrolled?.status !== "ready") throw new Error(JSON.stringify(scrolled));
  expect(scrolled.rect.rect.y).toBeLessThan(second.rect.rect.y);
  const after = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  expect(after.revision).toBe(before.revision);
  expect(after.bodyText).toBe(before.bodyText);
  expect(after.captionText).toBe(before.captionText);
});

test("one stable native reading source owns marked text and commits once", async ({ page }) => {
  const host = page.getByRole("textbox", { name: "Body", exact: true });
  await host.focus();
  await page.evaluate(() => window.customTextSurface!.select("body", 0, 5));
  const before = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  await host.evaluate(element => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    element.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "café" }));
  });
  const draft = await page.evaluate(() => window.customTextSurface!.inputSnapshot("body"));
  expect(draft?.composing).toBe(true);
  expect(draft?.projection.text).toContain("café engines");
  expect((await page.evaluate(() => window.customTextSurface!.getSnapshot())).revision).toBe(before.revision);
  await host.evaluate(element => {
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "café" }));
    element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromComposition", data: "café" }));
  });
  const after = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  expect(after.revision).toBe(before.revision + 1);
  expect(after.bodyText).toContain("café engines");
  expect(after.bodyText).not.toContain("cafécafé");
  expect(after.captionText).toBe(before.captionText);
  await expect(page.getByRole("textbox")).toHaveCount(3);
  await expect(page.getByTestId("body-surface").locator("svg").first()).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("body-surface")).not.toHaveAttribute("data-input-error", /.+/);
});

test("snapshot PDF export preserves revision/history and disposal revokes geometry", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const before = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  const pdf = await page.evaluate(() => window.customTextSurface!.exportPDF());
  expect(pdf.revision).toBe(before.revision); expect(pdf.byteLength).toBeGreaterThan(1000);
  const after = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  expect(after.revision).toBe(before.revision); expect(after.history).toEqual(before.history);
  await page.evaluate(() => window.customTextSurface!.dispose());
  expect(await page.evaluate(() => window.customTextSurface!.getSnapshot())).toMatchObject({ disposed: true, geometryReady: false });
  expect(errors).toEqual([]);
});

test("object pointer preview cancels without history, commits once, and refuses stale targets/output", async ({ page }) => {
  const before = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  const object = page.getByTestId("body-object");
  await object.scrollIntoViewIfNeeded();
  const box = await object.boundingBox(); expect(box).not.toBeNull();
  const drag = async () => { await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 24, box!.y + box!.height / 2, { steps: 3 }); };
  await drag();
  const preview = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  expect(preview.objectPreview?.x).toBeCloseTo(before.object.x + 24);
  expect(preview.revision).toBe(before.revision); expect(preview.object).toEqual(before.object); expect(preview.history).toEqual(before.history);
  const outputRefusal = await page.evaluate(async () => {
    try { await window.customTextSurface!.exportPDF(); return null; } catch (error) { return String(error); }
  });
  expect(outputRefusal).toMatch(/Output refused: Commit or cancel the object preview/);
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await page.evaluate(() => window.customTextSurface!.getSnapshot())).objectPreview).toBeNull();
  expect((await page.evaluate(() => window.customTextSurface!.getSnapshot())).revision).toBe(before.revision);
  await drag(); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.customTextSurface!.getSnapshot().geometryReady)).toBe(true);
  const moved = await page.evaluate(() => window.customTextSurface!.getSnapshot());
  expect(moved.revision).toBe(before.revision + 1); expect(moved.object.x).toBeCloseTo(before.object.x + 24);
  expect(moved.bodyText).toBe(before.bodyText); expect(moved.captionText).toBe(before.captionText);
  await page.getByTestId("undo").click(); expect((await page.evaluate(() => window.customTextSurface!.getSnapshot())).object).toEqual(before.object);
  await page.getByTestId("redo").click(); expect((await page.evaluate(() => window.customTextSurface!.getSnapshot())).object).toEqual(moved.object);
  const stale = await page.evaluate(() => {
    const api = window.customTextSurface!, target = api.beginObjectMove(); api.previewObjectMove(target, { x: 100, y: 100 });
    api.select("caption", 0, 1); api.insertText("caption", "Z");
    try { api.commitObjectMove(target); return "incorrect success"; } catch (error) { return String(error); }
  });
  expect(stale).toMatch(/stale/i); expect((await page.evaluate(() => window.customTextSurface!.getSnapshot())).object).toEqual(moved.object);
  await page.getByTestId("undo").click();
});

test("public host saves memory native data and reacquires durable scoped image bytes in a fresh runtime", async ({ page }) => {
  await page.evaluate(() => window.customTextSurface!.startFreshHost());
  await expect.poll(() => page.evaluate(() => window.customTextSurface!.getSnapshot().geometryReady)).toBe(true);
  await page.evaluate(() => window.customTextSurface!.insertImage());
  const firstAsset = await page.evaluate(() => window.customTextSurface!.assetReceipt()); expect(firstAsset).not.toBeNull();
  const assetReferences = (await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!)).model.assets;
  expect(firstAsset).toMatchObject({ active: true, assetDurability: "durable", width: 2, height: 2 });
  await expect.poll(() => page.getByTestId("undo").boundingBox().then(rect => rect?.width ?? 0)).toBeGreaterThanOrEqual(40);
  expect(await page.locator(".webspring-apps-container").evaluate(element => getComputedStyle(element).position)).toBe("fixed");
  expect(await page.locator(".webspring-app-view-frame").evaluate(element => getComputedStyle(element).position)).toBe("absolute");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  // Fresh real-host controls must remain reachable, including native asset history.
  await page.getByTestId("undo").click();
  expect((await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!)).model.assets).toEqual([]);
  await page.getByTestId("redo").click();
  expect((await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!)).model.assets).toEqual(assetReferences);
  await page.getByTestId("object-preview").click();
  const refusals = await page.evaluate(async () => {
    const api = window.customTextSurface!;
    const save = await api.saveNative().then(() => null, error => String(error));
    const pdf = await api.exportPDF().then(() => null, error => String(error));
    return { save, pdf };
  });
  expect(refusals.save).toMatch(/object|editing|settle|preview/i);
  expect(refusals.pdf).toMatch(/Output refused: Commit or cancel the object preview/);
  await page.getByTestId("object-cancel").click();
  await page.getByTestId("object-preview").click(); await page.getByTestId("object-commit").click();
  const saved = await page.evaluate(() => window.customTextSurface!.saveNative()); expect(saved.state).toBe("clean");
  const record = await page.evaluate(() => window.customNativeRecord!);
  expect(record.content).toEqual(saved.model); expect(record.version).toEqual(saved.currentVersion);
  const manifest = JSON.parse(record.metadata["syncloudos.document.assets.v1"]); expect(manifest.assets).toEqual(saved.model.assets);
  await page.evaluate(() => window.customTextSurface!.startFreshHost(true));
  await expect.poll(() => page.evaluate(() => window.customTextSurface!.getSnapshot().geometryReady)).toBe(true);
  const reopened = await page.evaluate(() => window.customTextSurface!.nativeSnapshot()!);
  const freshAsset = await page.evaluate(() => window.customTextSurface!.assetReceipt()!);
  expect(reopened.id).not.toBe(saved.id); expect(reopened.model).toEqual(saved.model); expect(reopened.currentVersion).toEqual(saved.currentVersion);
  expect(freshAsset.bytes).toEqual(firstAsset!.bytes); expect(freshAsset.descriptor.leaseId).not.toBe(firstAsset!.descriptor.leaseId);
  expect(await page.evaluate(lease => window.customTextSurface!.isAssetLeaseActive(lease), firstAsset!.descriptor)).toBe(false);
  expect(await page.evaluate(() => window.customTextSurface!.exportPDF())).toMatchObject({ revision: reopened.dirtyRevision });
  const host = await page.evaluate(() => window.customHostReceipt!);
  expect(host).toMatchObject({ nativeDurability: "memory", assetDurability: "durable", crossStoreAtomicity: false, fullPageReload: false, hostsMounted: 2, storesCreated: 2, storesDisposed: 1 });
  expect(new Set(host.runtimeIds).size).toBe(2);
  expect(host.previousLease).toEqual({ leaseId: firstAsset!.descriptor.leaseId, wasActive: true, revoked: true, rejectedByFreshHost: true });
  await page.evaluate(() => window.customTextSurface!.dispose());
  expect((await page.evaluate(() => window.customHostReceipt!)).storesDisposed).toBe(2);
});
