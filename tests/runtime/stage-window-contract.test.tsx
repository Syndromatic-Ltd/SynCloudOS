// @vitest-environment jsdom
import * as React from "react";
import { act } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import contract from "../../tooling/nse-theme-contract.json";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController, type NSEWindowStyle } from "../../src/NSE/Application/NSEWindowController";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";

const hosts: SynWareTestHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});

it("draws the stage frame as a window, with no app-view-chrome control", () => {
  expect(contract.controls).not.toHaveProperty("app-view-chrome");
  expect(contract.appThemeControls).not.toContain("app-view-chrome");
  expect(contract.renamedFrom["app-view-chrome"]).toBe("window[presentation=stage]");
  const window = contract.controls.window.variants as Record<string, readonly string[]>;
  expect(window.presentation).toContain("stage");
  expect(window.transition).toEqual(["incoming", "outgoing"]);
  expect(window.titlebar).toEqual(["hidden"]);
});

async function presentOnStage(styleMask?: readonly NSEWindowStyle[]) {
  class MainWindow extends NSEWindowController {
    static override styleMask = styleMask;
    static override view = () => <p>Body</p>;
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createSynWareTestHost({ application: Application, document,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.stage-window", displayName: "Stage", version: "1.0.0" } });
  hosts.push(host);
  await act(async () => { await host.render(); });
}

it("presents a stage application in a standard stage window", async () => {
  await presentOnStage();
  expect(document.querySelector('[data-nse-control="window"][data-nse-part="background"][data-nse-presentation="stage"][data-nse-role="standard"]')).not.toBeNull();
  expect(document.querySelector('[data-nse-control="app-view-chrome"]')).toBeNull();
  expect(document.querySelector('[data-nse-presentation="stage"] > [data-nse-part="content"]')?.hasAttribute("data-nse-titlebar")).toBe(false);
});

it("marks the content of a stage window that draws no top bar", async () => {
  await presentOnStage(["closable"]);
  expect(document.querySelector('[data-nse-presentation="stage"] > [data-nse-part="content"][data-nse-titlebar="hidden"]')).not.toBeNull();
});
