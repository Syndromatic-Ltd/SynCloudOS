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

// @vitest-environment jsdom

import { cleanup } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSynWare,
  useSynWareWindowChrome,
  type AppWindowChromeProps,
} from "../../src/SynCloudOS/AppSDK";
import * as AppSDKBarrel from "../../src/SynCloudOS/AppSDK";
import * as WindowLayerBarrel from "../../src/Webspring/WindowLayer";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing";
import {
  NSEHUDWindowView,
  NSEModalWindowView,
  NSEPanelView,
  NSEPopoverWindowView,
  NSESheetView,
} from "../../src/NSE/Windows";
import { render } from "@testing-library/react";
import type { WindowPresentation, WindowRecord } from "../../src/SynCloudOS/Windows";
import { createWindowPointerGesture } from "../../src/SynCloudOS/Windows/windowGesture";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import { projectChromeCloseError, projectChromeCloseResult } from "../../src/Webspring/WindowLayer/windowChromeResults";
import type { CommandDispatchResult, WindowCloseResult } from "../../src/SynCloudOS/SynCloudOS";

const windowCSS = readFileSync("src/NSE/Windows/nse-windows.css", "utf8");

afterEach(cleanup);

const hookLog: Array<AppWindowChromeProps | null> = [];

const HookChromeApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.hook-chrome",
    version: "1.0.0",
    title: "Hook Chrome",
    routes: [{ path: "/hook-chrome", primary: true }],
    windowDefaults: { title: "Hook Chrome", chrome: "custom", smoothSurface: "off" },
  },
  root() {
    return <div data-testid="hook-app-content">hook application content</div>;
  },
  windowChrome(props: AppWindowChromeProps) {
    return <HookChromeProbe props={props} />;
  },
});

function HookChromeProbe({ props }: { props: AppWindowChromeProps }) {
  hookLog.push(useSynWareWindowChrome());
  return (
    <div data-testid="hook-chrome">
      <h2 id={props.titleId}>{props.title}</h2>
    </div>
  );
}

const CustomWithoutRendererApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.chrome-missing",
    version: "1.0.0",
    title: "Chrome Missing",
    routes: [{ path: "/chrome-missing", primary: true }],
    windowDefaults: { title: "Chrome Missing", chrome: "custom", smoothSurface: "off" },
  },
  root() {
    return <div data-testid="missing-app-content">missing renderer content</div>;
  },
});

const CrashingChromeApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.chrome-crash",
    version: "1.0.0",
    title: "Chrome Crash",
    routes: [{ path: "/chrome-crash", primary: true }],
    windowDefaults: { title: "Chrome Crash", chrome: "custom", smoothSurface: "off" },
  },
  root: () => <div data-testid="crash-app-content">still healthy</div>,
  windowChrome(): React.ReactElement { throw new Error("chrome renderer exploded"); },
});

function roleRecord(role: WindowRecord["role"]): { record: WindowRecord; presentation: WindowPresentation } {
  const request = standardWindow(`role-${role}`, { title: `${role} specimen`, role });
  const record = {
    ...request,
    id: `role-${role}`,
    runtimeId: "runtime:role-smoke" as WindowRecord["runtimeId"],
    state: "open",
    isKey: true,
    isMain: true,
    zIndex: 4,
    // Panels must float above normal windows; popovers require anchor
    // provenance for their arrow.
    ...((role === "panel" || role === "hud") ? { level: "floating" as const } : {}),
    ...(role === "popover"
      ? { anchor: { id: "role-popover-anchor", rect: { x: 0, y: 0, width: 8, height: 8 }, edge: "block-end" as const, alignment: "center" as const, offset: 0 } }
      : {}),
  } as WindowRecord;
  const presentation: WindowPresentation = {
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: true,
    titleBarVisible: true,
  };
  return { record, presentation };
}
async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}


describe("custom chrome host integration", () => {
  it("provides the live chrome capability through the real portal path with a single app mount", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app: HookChromeApp, document, container, surface: "window" });
    try {
      await host.render();
      await flushAsync();
      expect(hookLog.length).toBeGreaterThan(0);
      const hookProps = hookLog[hookLog.length - 1]!;
      // The hook resolves inside the chrome component through the real
      // WindowHost → SynWareRuntimeMount → portal path — never null.
      expect(hookProps).not.toBeNull();
      expect(hookProps.title).toBe("Hook Chrome");
      expect(hookProps.titleId).toMatch(/-title$/u);
      // One mount only: a single content root for the single window.
      expect(document.querySelectorAll('[data-testid="hook-app-content"]')).toHaveLength(1);
      expect(document.querySelectorAll('[data-testid="hook-chrome"]')).toHaveLength(1);
      expect(document.querySelector(".nse-window-view")?.getAttribute("data-window-custom-chrome-active")).toBe("true");
    } finally {
      await host.dispose();
    }
  });

  it("falls back to the theme's system titlebar when no custom renderer exists", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app: CustomWithoutRendererApp, document, container, surface: "window" });
    try {
      await host.render();
      await flushAsync();
      const view = document.querySelector(".nse-window-view");
      expect(view?.getAttribute("data-window-chrome-mode")).toBe("custom");
      // Declared-custom without a renderer never blanks the bar: the host
      // stays on the effective system fallback from the first frame. The
      // slot node exists (the bridge needs a portal target to attempt its
      // handshake) but stays empty and collapsed until chrome reports ready.
      expect(view?.getAttribute("data-window-custom-chrome-active")).toBe("false");
      expect(document.querySelector(".nse-window__titlebar")).not.toBeNull();
      expect(document.querySelector(".nse-window__custom-titlebar")?.childNodes).toHaveLength(0);
      expect(document.querySelector(".nse-window__shadow-layer")).not.toBeNull();
      expect(view?.hasAttribute("data-window-chrome-appearance")).toBe(false);
      expect(document.querySelector('[data-testid="missing-app-content"]')).not.toBeNull();
    } finally {
      await host.dispose();
    }
  });

  it("restores the complete system titlebar when custom chrome crashes without taking content down", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app: CrashingChromeApp, document, container, surface: "window" });
    try {
      await host.render();
      await flushAsync();
      expect(document.querySelector('[data-testid="crash-app-content"]')).not.toBeNull();
      expect(document.querySelector(".nse-window__titlebar")).not.toBeNull();
      expect(document.querySelector(".nse-window__custom-titlebar")).toBeNull();
      expect(document.querySelector(".nse-window__shadow-layer")).not.toBeNull();
      expect(document.querySelector(".nse-window-view")?.hasAttribute("data-window-chrome-appearance")).toBe(false);
    } finally {
      await host.dispose();
    }
  });

  it("keeps host slot internals out of the public barrels", () => {
    for (const name of [
      "WindowChromeSlotContext",
      "WindowChromeSlot",
      "AppWindowChromePropsContext",
      "AppWindowChromePropsProvider",
      "WindowChromeBridge",
      "SynWareWindowChromeBridge",
    ]) {
      expect(name in AppSDKBarrel, `AppSDK must not export ${name}`).toBe(false);
      expect(name in WindowLayerBarrel, `WindowLayer must not export ${name}`).toBe(false);
    }
    // The supported app-facing surface stays intact: the hook (runtime) and
    // the windowChrome definition seam (compile-time, exercised by the
    // fixture apps above, which type their chrome against
    // AppWindowChromeProps). Type-only exports leave no runtime trace, so
    // their presence is proven by this file compiling.
    expect(typeof AppSDKBarrel.useSynWareWindowChrome).toBe("function");
    expect(typeof AppSDKBarrel.createSynWare).toBe("function");
  });
  it("binds chrome actions to the mounting window with no target parameter", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app: HookChromeApp, document, container, surface: "window" });
    try {
      await host.render();
      await flushAsync();
      const hookProps = hookLog[hookLog.length - 1]!;
      // Zero-arity closures: the application cannot supply a target id.
      expect(hookProps.close.length).toBe(0);
      expect(hookProps.minimise.length).toBe(0);
      expect(hookProps.zoom.length).toBe(0);
      expect(Object.keys(hookProps)).not.toContain("windowControllerId");
    } finally {
      await host.dispose();
    }
  });

  it("refuses pointer-down on an immovable window while the live gate stays open", async () => {
    const harness = createWindowTestDependencies({ id: "runtime:chrome-gesture", namespace: "tests.chrome-gesture" });
    try {
      const controller = harness.manager.create(standardWindow("gesture-window"));
      await harness.manager.open(controller.id);
      const bounds = harness.manager.select("gesture-window").record.bounds;
      const target = document.createElement("div");
      document.body.append(target);
      const event = {
        button: 0,
        isPrimary: true,
        pointerId: 7,
        clientX: 100,
        clientY: 100,
        target,
        currentTarget: target,
      };
      const held = createWindowPointerGesture({
        manager: harness.manager,
        windowControllerId: "gesture-window",
        gesture: { kind: "move" },
        isDisabled: () => true,
      });
      held.onPointerDown(event);
      held.dispose();
      // Immovable: no bounds change is scheduled and the drag never starts.
      expect(harness.manager.select("gesture-window").record.bounds).toEqual(bounds);
      target.remove();
    } finally {
      await harness.cleanup();
    }
  });
  it("never stacks the custom drop-shadow with the system titlebar shadow", async () => {
    // jsdom does not apply stylesheet rules to computed style, so the live
    // drop-shadow values are covered by Playwright; here the effective
    // attribute (which alone gates the shadow rules) plus the shadow layer
    // prove the two systems never co-paint.
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app: HookChromeApp, document, container, surface: "window" });
    try {
      await host.render();
      await flushAsync();
      // Valid custom chrome: effective-active set, no nine-slice shadow layer.
      expect(document.querySelector(".nse-window-view")?.getAttribute("data-window-custom-chrome-active")).toBe("true");
      expect(document.querySelector(".nse-window__shadow-layer")).toBeNull();
    } finally {
      await host.dispose();
    }

    const fallbackContainer = document.createElement("div");
    document.body.append(fallbackContainer);
    const fallback = createSynWareTestHost({ app: CustomWithoutRendererApp, document, container: fallbackContainer, surface: "window" });
    try {
      await fallback.render();
      await flushAsync();
      // System titlebar: effective-active clear, nine-slice shadow present.
      expect(fallbackContainer.querySelector(".nse-window-view")?.getAttribute("data-window-custom-chrome-active")).toBe("false");
      expect(fallbackContainer.querySelector(".nse-window__shadow-layer")).not.toBeNull();
    } finally {
      await fallback.dispose();
    }

    // The stylesheet gates every custom drop-shadow on the effective
    // attribute and never on the declared chrome mode.
    expect(windowCSS).toContain('[data-window-custom-chrome-active="true"]');
    expect(windowCSS).toMatch(/\[data-window-custom-chrome-active="true"\][\s\S]*?drop-shadow/u);
    expect(windowCSS).not.toMatch(/\[data-window-chrome-mode="custom"\][\s\S]{0,120}?box-shadow/u);
  });
  it("honours smoothSurface off with no corner treatment on the surface", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app: HookChromeApp, document, container, surface: "window" });
    try {
      await host.render();
      await flushAsync();
      const surface = document.querySelector(".nse-window__surface") as HTMLElement | null;
      // Split the comment-free stylesheet into rule blocks and inspect only
      // rules whose selector positively (not :not-excluded) targets live
      // custom chrome.
      const positiveCustomBlocks = windowCSS
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .split("}")
        .map((chunk) => chunk.split("{"))
        .filter((parts): parts is [string, string] => parts.length === 2)
        .filter(([selector]) => selector.includes('[data-window-custom-chrome-active="true"]') && !selector.includes(":not("));
      expect(positiveCustomBlocks.length).toBeGreaterThan(0);
      for (const [, body] of positiveCustomBlocks) expect(body).not.toMatch(/border-radius/u);
    } finally {
      await host.dispose();
    }
  });
});

describe("custom chrome result projection", () => {
  const windowId = "window-under-test";
  const executed = (value: WindowCloseResult | null): CommandDispatchResult<WindowCloseResult | null> => ({
    status: "executed", commandId: "window.close", responderId: "runtime", operationId: "op-1", correlationId: "corr-1", value,
  });

  it.each([
    [executed({ outcome: "closed", windowControllerId: windowId }), { outcome: "closed", windowId }],
    [executed(null), { outcome: "closed", windowId }],
    [executed({ outcome: "cancelled", windowControllerId: windowId }), { outcome: "cancelled", windowId }],
    [executed({ outcome: "refused", windowControllerId: windowId, reason: "not-closable" }), { outcome: "refused", windowId, reason: "not-closable" }],
    [{ status: "cancelled", commandId: "window.close", operationId: "op-2", reason: "review-pending" }, { outcome: "cancelled", windowId }],
    [{ status: "unhandled", commandId: "window.close" }, { outcome: "refused", windowId, reason: "blocked" }],
    [{ status: "disabled", commandId: "window.close", responderId: "runtime", reason: "not closable" }, { outcome: "refused", windowId, reason: "blocked" }],
    [{ status: "denied", commandId: "window.close", responderId: "runtime", reason: "not closable" }, { outcome: "refused", windowId, reason: "blocked" }],
  ] as const)("maps command result %# truthfully", (dispatch, expected) => {
    expect(projectChromeCloseResult(dispatch as CommandDispatchResult<WindowCloseResult | null>, windowId)).toEqual(expected);
  });

  it.each([
    { status: "failed", commandId: "window.close", operationId: "op-3", error: { code: "boom", name: "Error", message: "storage exploded" } },
    { status: "unknown", commandId: "window.close", operationId: "op-4", reason: "coordinator lost" },
    { status: "invalid-payload", commandId: "window.close", issues: ["bad identity"] },
  ] as const)("rejects non-authoritative result $status", (dispatch) => {
    expect(() => projectChromeCloseResult(dispatch as CommandDispatchResult<WindowCloseResult | null>, windowId)).toThrow();
  });

  it("reports thrown close as closed only for an absent or authoritatively closed window", () => {
    const error = new Error("close failed");
    expect(projectChromeCloseError(error, windowId, null)).toEqual({ outcome: "closed", windowId });
    expect(projectChromeCloseError(error, windowId, "closed")).toEqual({ outcome: "closed", windowId });
    for (const state of ["opening", "open", "minimised", "closing"]) {
      expect(() => projectChromeCloseError(error, windowId, state)).toThrow(error);
    }
  });
});

describe("non-standard window role paint", () => {
  it("keeps panel, HUD, sheet, popover and modal visibly painted by the active theme", () => {
    const dispatchCommand = () => Promise.resolve({ handled: true });
    const cases = [
      { role: "panel" as const, view: NSEPanelView, bar: ".nse-window__titlebar" },
      { role: "hud" as const, view: NSEHUDWindowView, bar: ".nse-window__hud-titlebar" },
      { role: "sheet" as const, view: NSESheetView, bar: ".nse-window__titlebar" },
      { role: "popover" as const, view: NSEPopoverWindowView, bar: null },
      { role: "modal" as const, view: NSEModalWindowView, bar: ".nse-window__titlebar" },
    ] as const;
    for (const { role, view: View, bar } of cases) {
      const { record, presentation } = roleRecord(role);
      const { unmount } = render(
        <View record={record} presentation={presentation} blocked={false} dirty={false} dispatchCommand={dispatchCommand}>
          <p>{role} content</p>
        </View>,
      );
      try {
        const root = document.querySelector(`[data-window-id="role-${role}"]`);
        expect(root, `${role} renders its window root`).not.toBeNull();
        // Concrete theme identity belongs to the surrounding appearance
        // provider; window roles expose only semantic chrome state.
        expect(root?.hasAttribute("data-window-chrome-appearance"), `${role} has no second appearance identity`).toBe(false);
        expect(root?.getAttribute("data-window-custom-chrome-active"), `${role} is not custom-active`).toBe("false");
        if (bar) expect(root?.querySelector(bar), `${role} renders its titlebar`).not.toBeNull();
        expect(root?.textContent).toContain(`${role} content`);
      } finally {
        unmount();
      }
    }
    // Theme-neutral fallback paint remains on semantic window hooks.
    for (const selector of [
      ".nse-window-view:not([data-window-custom-chrome-active=",
      ".nse-window__titlebar {",
      ".nse-window-view--hud {",
      ".nse-window__hud-titlebar {",
      ".nse-window-view--sheet {",
      ".nse-window-view--popover {",
    ]) {
      expect(windowCSS.includes(selector), `stylesheet keeps ${selector}`).toBe(true);
    }
  });
});
