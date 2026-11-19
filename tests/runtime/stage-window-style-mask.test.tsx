// @vitest-environment jsdom
import * as React from "react";
import { act, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSETitlebarAccessoryViewController } from "../../src/NSE/Application/NSETitlebarAccessoryViewController";
import { NSEWindowController, type NSEWindowStyle } from "../../src/NSE/Application/NSEWindowController";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";

const hosts: SynWareTestHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

class Accessory extends NSETitlebarAccessoryViewController {
  constructor(owner: NSEWindowController) { super({ owner }); this.layoutAttribute = "leading"; }
  static override view = function AccessoryView() { return <button type="button">File</button>; };
}

async function mountOnStage(declared?: readonly NSEWindowStyle[]) {
  let seen: readonly NSEWindowStyle[] = [];
  class MainWindow extends NSEWindowController {
    static override styleMask = declared;
    static override view = () => <p>Body</p>;
    override windowDidLoad() {
      seen = this.window.styleMask;
      // AppKit's idiom: add a bit to the window's own mask.
      this.window.styleMask = [...this.window.styleMask, "texturedBackground"];
      this.window.addTitlebarAccessoryViewController(new Accessory(this));
    }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createSynWareTestHost({ application: Application, document,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.stage-style-mask", displayName: "Stage", version: "1.0.0" } });
  hosts.push(host);
  await act(async () => { await host.render(); });
  return { host, seen: () => seen, window: () => host.application!.windows[0]!.window };
}

it("gives a stage window the application's declared window style when it declares no mask of its own", async () => {
  const { seen, window } = await mountOnStage();
  expect(seen()).toEqual(["titled", "closable", "miniaturizable", "resizable"]);
  expect(window().styleMask).toEqual(["titled", "closable", "miniaturizable", "resizable", "texturedBackground"]);
  await waitFor(() => expect([...document.querySelectorAll("[data-window-titlebar] [data-layout-attribute=\"leading\"] button")].map((button) => button.textContent)).toEqual(["File"]));
});

it("keeps a stage window untitled when it declares a mask without a title bar", async () => {
  const { seen } = await mountOnStage(["closable"]);
  expect(seen()).toEqual(["closable"]);
  await act(async () => {});
  expect(document.querySelector("[data-window-titlebar]")).toBeNull();
});
