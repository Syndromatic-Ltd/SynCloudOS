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

    expect(screen.getByText("Webspring caught a runtime error.")).toBeTruthy();
    expect(runtime.store.getSnapshot().errors.at(-1)).toMatchObject({
      code: "UNKNOWN_RUNTIME_ERROR",
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
    expect(runtime.store.getSnapshot().errors.at(-1)).toMatchObject({
      code: "APP_CONTENT_FAILED",
      context: {
        presentation: "appView",
        watchdog: "MemoJournal.app presentation",
        windowId: null
      }
    });
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

    expect(screen.getByText("Webspring caught a runtime error.")).toBeTruthy();
    expect(runtime.store.getSnapshot().errors).toEqual([]);
  });
});
