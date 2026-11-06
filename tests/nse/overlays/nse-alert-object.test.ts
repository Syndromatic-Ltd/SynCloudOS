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
import { describe, expect, it } from "vitest";
import { NSEAlert, NSEModalResponse, NSEViewController, NSEWindowController } from "../../../src/NSE/Application";
import { nseWindowInternals, type NSEWindowAlertRequest, type NSEWindowMount } from "../../../src/NSE/Application/NSEWindowController";

function mountedWindow(choose: (request: NSEWindowAlertRequest, signal: AbortSignal) => Promise<string>) {
  const controller = new NSEWindowController();
  const requests: NSEWindowAlertRequest[] = [];
  const mount: NSEWindowMount = {
    windowId: "window-1",
    getSnapshot: () => null,
    subscribe: () => () => {},
    focus() {}, minimise() {}, zoom() {}, setTitle() {},
    close: async () => "closed" as never,
    registerCloseGuard: () => () => {},
    presentAlert: (request, signal) => { requests.push(request); return choose(request, signal); },
  };
  controller[nseWindowInternals].attach(mount);
  return { controller, requests };
}

describe("NSEAlert", () => {
  it("presents as a sheet on a window and answers with the chosen button's modal response", async () => {
    const { controller, requests } = mountedWindow(async () => "1");
    const alert = new NSEAlert();
    alert.messageText = "Delete “Hello”?";
    alert.informativeText = "You cannot undo this action.";
    alert.alertStyle = "critical";
    alert.addButton("Delete").hasDestructiveAction = true;
    const cancel = alert.addButton("Cancel");
    expect(cancel.keyEquivalent).toBe("\u001b");
    expect(alert.buttons.map(button => button.title)).toEqual(["Delete", "Cancel"]);
    await expect(alert.beginSheetModal(controller.window)).resolves.toBe(NSEModalResponse.alertSecondButtonReturn);
    expect(requests[0]).toEqual({
      title: "Delete “Hello”?", message: "You cannot undo this action.", style: "critical",
      buttons: [{ id: "0", label: "Delete", role: "destructive" }, { id: "1", label: "Cancel", role: "cancel" }],
    });
    controller.dispose();
  });

  it("shows one OK button when none were added, and makes the first button the default", async () => {
    const { controller, requests } = mountedWindow(async () => "0");
    const alert = new NSEAlert();
    alert.messageText = "Saved";
    await expect(alert.beginSheetModal(controller.window)).resolves.toBe(NSEModalResponse.alertFirstButtonReturn);
    expect(requests[0]!.buttons).toEqual([{ id: "0", label: "OK", role: "default" }]);
    const two = new NSEAlert();
    two.messageText = "Replace?"; two.addButton("Replace"); two.addButton("Keep Both");
    await two.beginSheetModal(controller.window);
    expect(requests[1]!.buttons).toEqual([{ id: "0", label: "Replace", role: "default" }, { id: "1", label: "Keep Both" }]);
    controller.dispose();
  });

  it("ends the sheet when its window controller goes away", async () => {
    const { controller } = mountedWindow((_request, signal) => new Promise(resolve => signal.addEventListener("abort", () => resolve("1"))));
    const alert = new NSEAlert();
    alert.messageText = "Quit?"; alert.addButton("Quit"); alert.addButton("Cancel");
    const response = alert.beginSheetModal(controller.window);
    controller.dispose();
    await expect(response).resolves.toBe(NSEModalResponse.alertSecondButtonReturn);
  });

  it("ends with NSEWindow.endSheet, with the given return code or as Escape would", async () => {
    const { controller } = mountedWindow((_request, signal) => new Promise(resolve => signal.addEventListener("abort", () => resolve("1"))));
    const alert = new NSEAlert();
    alert.messageText = "Working"; alert.addButton("Stop"); alert.addButton("Cancel");
    const first = alert.beginSheetModal(controller.window);
    controller.window.endSheet(alert, NSEModalResponse.stop);
    await expect(first).resolves.toBe(NSEModalResponse.stop);
    const second = alert.beginSheetModal(controller.window);
    controller.window.endSheet(alert);
    await expect(second).resolves.toBe(NSEModalResponse.alertSecondButtonReturn);
    controller.window.endSheet(alert);
    expect(() => controller.window.endSheet(alert, 1.5)).toThrow(TypeError);
    controller.dispose();
  });

  it("reaches the window from a view controller's view, as NSView.window does", async () => {
    const { controller, requests } = mountedWindow(async () => "0");
    class Child extends NSEViewController {}
    class Root extends NSEViewController { readonly child = this.addChild(Child); }
    const root = new Root();
    expect(root.view.window).toBeNull();
    controller.contentViewController = root;
    expect(root.view.window).toBe(controller.window);
    expect(root.child.view.window).toBe(controller.window);
    const alert = new NSEAlert();
    alert.messageText = "From a child";
    await alert.beginSheetModal(root.child.view.window!);
    expect(requests).toHaveLength(1);
    controller.dispose();
  });

  it("refuses an alert without a title, a blank button, or a window that no controller manages", async () => {
    const alert = new NSEAlert();
    expect(() => alert.addButton("  ")).toThrow(TypeError);
    expect(() => { alert.alertStyle = "loud" as never; }).toThrow(TypeError);
    const { controller } = mountedWindow(async () => "0");
    await expect(alert.beginSheetModal(controller.window)).rejects.toThrow("messageText");
    alert.messageText = "Hello";
    await expect(alert.beginSheetModal({ ...controller.window })).rejects.toThrow("window controller's window");
    controller.dispose();
  });

  it("presents view controllers as sheets that reach the window, and disposes them when dismissed", () => {
    const { controller } = mountedWindow(async () => "0");
    class Sheet extends NSEViewController {}
    class Root extends NSEViewController {}
    const root = new Root();
    controller.contentViewController = root;
    const sheet = new Sheet({ title: "Link" });
    sheet.preferredContentSize = { width: 480, height: 0 };
    root.presentAsSheet(sheet);
    root.presentAsSheet(sheet);
    expect(root.presentedViewControllers).toEqual([sheet]);
    expect(sheet.presentingViewController).toBe(root);
    expect(sheet.view.window).toBe(controller.window);
    expect(() => new Root().presentAsSheet(sheet)).toThrow(TypeError);
    sheet.dismiss();
    expect(sheet.isDisposed).toBe(true);
    expect(root.presentedViewControllers).toEqual([]);
    const second = root.presentAsSheet(Sheet);
    expect(root.presentedViewControllers).toEqual([second]);
    controller.dispose();
    expect(second.isDisposed).toBe(true);
    expect(() => { second.preferredContentSize = { width: -1, height: 0 }; }).toThrow(TypeError);
  });
});
