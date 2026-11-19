// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { WebspringController } from "../../src/Webspring/WebspringController";
import { WSWidget, captureWSWidgetClass } from "../../src/Webspring/WSWidget";
import { withDiscoveredWebspringItems } from "../../src/Webspring/WSApplication";
import { WSBoardViewController } from "../../src/Webspring/Contents/Views/WSBoardViewController/WSBoardViewController";
import { createTestLauncher, createTestWebspring } from "./webspringTestShell";
import { NSEPreferencePane, capturePreferencePaneClass } from "../../src/SynCloudOS/Preferences";
import type { SynCloudOSProjectComposition } from "../../src/SynCloudOSReact/projectComposition";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });
vi.mock("../../src/Webspring/WebspringController", { spy: true });
const mounted: { host: MountedSynCloudOSHost; element: HTMLElement }[] = [];
afterEach(async () => {
  for (const { host, element } of mounted.splice(0)) { await act(async () => { await host.dispose(); }); element.remove(); }
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});

async function mount(composition?: SynCloudOSProjectComposition) {
  const element = document.createElement("div"); document.body.append(element);
  let host!: MountedSynCloudOSHost;
  try { await act(async () => { host = await mountSynCloudOS({ element, ...(composition ? { composition } : {}) }); }); }
  catch (error) { element.remove(); throw error; }
  mounted.push({ host, element });
  return { element, runtime: vi.mocked(createSynCloudOS).mock.results.at(-1)!.value,
    shell: vi.mocked(WebspringController).mock.calls.at(-1)![1] };
}

const widget = (id: string, order = 0) => captureWSWidgetClass(class extends WSWidget<string> {
  static override id = id;
  static override title = id;
  static override order = order;
  static override whenEmpty = "hide" as const;
  override load() { return id; }
  override renderView() { return <p>{this.data}</p>; }
});

it("mounts the real neutral Board without a declared shell or composition and omits an empty shelf", async () => {
  const { element, runtime, shell } = await mount();
  expect(runtime.store.getSnapshot().booted).toBe(true);
  expect(element.querySelector(".webspring-board")).not.toBeNull();
  expect(element.querySelector(".webspring-widget-shelf")).toBeNull();
  expect(element.querySelector(".webspring-board-logo")).toBeNull();
  expect(shell.info.branding.name.fallback).toBe("SynCloudOS");
  expect(shell.viewControllers).toEqual({ desktop: WSBoardViewController, tablet: WSBoardViewController, mobile: WSBoardViewController });
  expect(shell.modes).toEqual({ desktop: "launcher", tablet: "launcher", mobile: "launcher" });
  expect(shell.background.launcher.texture).toMatchObject({ size: "256px" });
});

it("gives the default launcher discovered panes and widget order from an explicit composition", async () => {
  class BillingPane extends NSEPreferencePane {
    static override id = "billing";
    static override title = "Billing";
    static override order = 600;
    override renderView() { return null; }
  }
  const pane = capturePreferencePaneClass(BillingPane);
  const { element, shell } = await mount({ bundles: [], preferences: [pane], widgets: [widget("late", 20), widget("zeta", 0), widget("alpha", 0), widget("early", -10)], contributions: [], shell: null, shellResources: {} });
  expect(shell.preferences.panes).toContain(pane);
  expect(shell.widgets.map(item => item.id)).toEqual(["early", "alpha", "zeta", "late"]);
  await waitFor(() => expect(element.querySelectorAll('[data-widget-state="ready"]')).toHaveLength(4));
  expect(Array.from(element.querySelectorAll("[data-widget-id]"), node => node.getAttribute("data-widget-id"))).toEqual(["early", "alpha", "zeta", "late"]);
});

it("lists a discovered application and launches it through the default Board", async () => {
  const app = createSynWare({ manifest: {
    bundleIdentifier: "com.example.neutral-notes", schemaVersion: 1, displayName: "Neutral Notes", version: "1.0.0",
    routes: [{ path: "/neutral-notes", primary: true }], webspring: { visible: true, order: 1 }, runtime: { policy: { public: true } },
  }, root: () => <p data-testid="neutral-notes">A running discovered application</p> });
  const { element } = await mount({ bundles: [{ manifest: app.manifest, modulePath: "src/SynWare/Notes.app/Contents/index.tsx", loadModule: async () => ({ default: app }) }], preferences: [], widgets: [], contributions: [], shell: null, shellResources: {} });
  const launch = await within(element).findByRole("button", { name: "Open Neutral Notes" });
  await act(async () => { fireEvent.click(launch); });
  await waitFor(() => expect(element.querySelector('[data-testid="neutral-notes"]')?.textContent).toBe("A running discovered application"));
  expect(window.location.pathname).toBe("/neutral-notes");
});

it("keeps explicit widget order, adds discoveries by order, and permits explicit ordering of the same discovered definitions", () => {
  const first = widget("first", 50), second = widget("second", -50), alpha = widget("alpha"), zeta = widget("zeta");
  const shell = createTestWebspring({
    info: { bundleIdentifier: "com.example.ordered-shell", displayName: "Ordered", branding: { name: { key: "name", fallback: "Ordered" } } },
    launcher: createTestLauncher(),
    widgets: [first, second] as never,
  });
  const merged = withDiscoveredWebspringItems(shell, { preferences: [], widgets: [zeta, first, alpha, second] });
  expect(merged.widgets).toEqual([first, second, alpha, zeta]);
  expect(shell.widgets).toEqual([first, second]);
  expect(() => withDiscoveredWebspringItems(shell, { preferences: [], widgets: [widget("first")] })).toThrow(/duplicate|both/i);
});
