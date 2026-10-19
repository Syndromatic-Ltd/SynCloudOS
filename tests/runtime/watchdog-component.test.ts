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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSWatchdog } from "../../src/SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import { createTestRuntime } from "./helpers";
import { SynCloudOSLifecycleRecord } from "../../src/SynCloudOS/ErrorManager/lifecycleError";
import type { CapturedSynCloudOSError } from "../../src/SynCloudOS/ErrorManager/errorTypes";

const app = {
  id: "memo-journal",
  packageName: "MemoJournal.app",
  displayName: "MemoJournal"
} as never;

const appPresentation = {
  id: "window-memo-journal",
  kind: "appView",
  zIndex: 112
} as never;

function ThrowingChild({ message = "render failed" }: { message?: string }) {
  throw new Error(message);
}

function DisposedLayerChild(): never {
  const record = new SynCloudOSLifecycleRecord({ kind: "AFXLayer" });
  record.markDisposed("explicit");
  throw record.error({ code: "AFX_LAYER_DISPOSED", operation: "hidden", access: "set" });
}

function expectLifecycleIdentity(captured: CapturedSynCloudOSError | undefined, caughtBy: string) {
  expect(captured).toMatchObject({
    code: "AFX_LAYER_DISPOSED",
    exception: "SynCloudOSLifecycleError",
    message: "Cannot set AFXLayer.hidden after disposal.",
    source: caughtBy,
  });
  expect(captured?.technicalDetails).not.toMatch(/\bnone\b/);
  expect(captured?.technicalDetails).not.toContain("Cannot set AFXLayer.hidden after disposal.");
  expect(captured?.technicalDetails).toContain("React component stack:");
}

function MaybeThrow({ fail }: { fail: boolean }) {
  if (fail) throw new Error("resettable failure");
  return React.createElement("div", null, "healthy app");
}

describe("SynCloudOSWatchdog component", () => {
  let runtime: ReturnType<typeof createTestRuntime>;

  beforeEach(() => {
    runtime = createTestRuntime();
    runtime.store.mutate((draft) => {
      draft.errors = [];
      draft.webspring.lowerShelfMode = "news";
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("root watchdog captures a throwing child and supplies its typed error to the host", () => {
    render(React.createElement(
      SynCloudOSWatchdog,
      {
        runtime,
        scope: "root",
        watchdogName: "SynCloudOS root",
        fallback: (error) => React.createElement("div", null, error?.title),
      },
      React.createElement(ThrowingChild)
    ));

    expect(screen.getByText("Webspring stopped because of an error.")).toBeTruthy();
    expect(runtime.store.getSnapshot().errors.at(-1)).toMatchObject({
      code: "UNKNOWN_RUNTIME_ERROR",
      exception: "Error",
      message: "render failed",
      source: "SynCloudOS.RootWatchdog",
      context: { watchdog: "SynCloudOS root" }
    });
  });

  it("delegates root presentation to the host fallback instead of importing NSE", () => {
    render(React.createElement(
      SynCloudOSWatchdog,
      {
        runtime,
        scope: "root",
        watchdogName: "SynCloudOS root",
        fallback: () => React.createElement("div", { "data-testid": "root-watchdog-fallback" }),
      },
      React.createElement(ThrowingChild),
    ));

    expect(screen.getByTestId("root-watchdog-fallback")).toBeTruthy();
  });

  it("app watchdog catches a throwing child and renders the app fallback", () => {
    render(React.createElement(
      SynCloudOSWatchdog,
      {
        app,
        runtime,
        fallback: () => React.createElement("div", { "data-testid": "app-watchdog-fallback" }),
        resetKey: "window-memo-journal:memo-journal",
        scope: "app",
        watchdogName: "MemoJournal.app presentation",
        presentation: appPresentation
      },
      React.createElement(ThrowingChild)
    ));

    expect(screen.getByTestId("app-watchdog-fallback")).toBeTruthy();
    const captured = runtime.store.getSnapshot().errors.at(-1);
    expect(captured).toMatchObject({
      code: "APP_CONTENT_FAILED",
      title: "MemoJournal stopped unexpectedly.",
      exception: "Error",
      source: "SynCloudOS.AppWatchdog",
      context: {
        presentation: "appView",
        watchdog: "MemoJournal.app presentation",
      }
    });
    expect(captured?.context).not.toHaveProperty("windowId");
  });

  it("root and app watchdogs keep a thrown lifecycle error's code and class", () => {
    render(React.createElement(
      SynCloudOSWatchdog,
      { runtime, scope: "root", watchdogName: "SynCloudOS root", fallback: () => null },
      React.createElement(DisposedLayerChild),
    ));
    expectLifecycleIdentity(runtime.store.getSnapshot().errors.at(-1), "SynCloudOS.RootWatchdog");
    cleanup();

    render(React.createElement(
      SynCloudOSWatchdog,
      { runtime, app, scope: "app", watchdogName: "MemoJournal.app presentation", presentation: appPresentation, fallback: () => null },
      React.createElement(DisposedLayerChild),
    ));
    expectLifecycleIdentity(runtime.store.getSnapshot().errors.at(-1), "SynCloudOS.AppWatchdog");
  });

  it("root and app watchdogs capture a thrown non-Error value with the generic code", () => {
    function ThrowsString(): never {
      throw "plain failure";
    }
    render(React.createElement(
      SynCloudOSWatchdog,
      { runtime, scope: "root", watchdogName: "SynCloudOS root", fallback: () => null },
      React.createElement(ThrowsString),
    ));
    expect(runtime.store.getSnapshot().errors.at(-1)).toMatchObject({
      code: "UNKNOWN_RUNTIME_ERROR",
      exception: "Non-Error value (string)",
      message: "plain failure",
      source: "SynCloudOS.RootWatchdog",
    });
    cleanup();

    render(React.createElement(
      SynCloudOSWatchdog,
      { runtime, app, scope: "app", watchdogName: "MemoJournal.app presentation", presentation: appPresentation, fallback: () => null },
      React.createElement(ThrowsString),
    ));
    const captured = runtime.store.getSnapshot().errors.at(-1);
    expect(captured).toMatchObject({
      code: "APP_CONTENT_FAILED",
      exception: "Non-Error value (string)",
      message: "plain failure",
      source: "SynCloudOS.AppWatchdog",
    });
    expect(captured?.technicalDetails).not.toMatch(/\bnone\b/);
  });

  it("resetKey clears app watchdog error state", async () => {
    const props = {
      app,
      runtime,
      fallback: () => React.createElement("div", { "data-testid": "app-watchdog-fallback" }),
      scope: "app" as const,
      watchdogName: "MemoJournal.app presentation",
      presentation: appPresentation
    };

    const { rerender } = render(React.createElement(
      SynCloudOSWatchdog,
      { ...props, resetKey: "one" },
      React.createElement(MaybeThrow, { fail: true })
    ));

    expect(screen.getByTestId("app-watchdog-fallback")).toBeTruthy();

    rerender(React.createElement(
      SynCloudOSWatchdog,
      { ...props, resetKey: "two" },
      React.createElement(MaybeThrow, { fail: false })
    ));

    expect(await screen.findByText("healthy app")).toBeTruthy();
  });

  it("shows a local fallback report when ErrorManager capture throws", () => {
    vi.spyOn(runtime.errors, "capture").mockImplementation(() => {
      throw new Error("capture pipeline failed");
    });

    render(React.createElement(
      SynCloudOSWatchdog,
      { runtime, scope: "root", watchdogName: "SynCloudOS root" },
      React.createElement(ThrowingChild)
    ));

    expect(screen.getByText("Webspring stopped because of an error.")).toBeTruthy();
    expect(runtime.store.getSnapshot().errors).toEqual([]);
  });
});
