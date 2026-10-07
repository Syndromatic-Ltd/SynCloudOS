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
import { createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";
import { getSystemAlertIcon } from "../../src/SynCloudOSReact/SystemAlert";
import type { CapturedSynCloudOSError } from "../../src/SynCloudOS/ErrorManager/errorTypes";
import { createAppContentFailedError, createRuntimeRenderError } from "../../src/SynCloudOS/ErrorManager/ErrorManager";

function createCapturedError(overrides: Partial<CapturedSynCloudOSError>): CapturedSynCloudOSError {
  return {
    id: "error-test",
    at: 1,
    timestamp: "2026-06-01T00:00:00.000Z",
    code: "UNKNOWN_RUNTIME_ERROR",
    title: "Test error",
    message: "Test message",
    ...overrides
  };
}

describe("ErrorManager watchdog captures", () => {
  it("captures app render failures without treating them as Webspring fatal errors", async () => {
    const { AppRegistry, RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const app = AppRegistry.register(createTestManifest({
      id: "memo-journal",
      packageName: "MemoJournal.app",
      displayName: "MemoJournal",
      route: "/memo-journal",
      componentKey: "MemoJournal"
    }));

    const captured = createAppContentFailedError(SynCloudOS.ErrorManager, app, new TypeError("Cannot read properties of null (reading 'value')"), {
      source: "SynCloudOS.AppWatchdog",
      watchdog: "MemoJournal.app presentation",
      componentStack: "\n    at MemoJournalApp (index.tsx:88:31)",
      windowId: "window-memo-journal"
    });

    expect(captured).toMatchObject({
      code: "APP_CONTENT_FAILED",
      appId: "memo-journal",
      packageName: "MemoJournal.app",
      recoverable: false,
      severity: "fatal",
      suggestedActions: ["returnToWebspring"]
    });
    expect(captured.technicalDetails).toContain("MemoJournalApp");
    expect(RuntimeController.getSnapshot().errors.at(-1)?.id).toBe(captured.id);
    expect(RuntimeController.getSnapshot().webspring.lowerShelfMode).toBe("error");
  });

  it("captures root render failures as fatal reloadable alerts", async () => {
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());

    const captured = createRuntimeRenderError(SynCloudOS.ErrorManager, new Error("Root render failed"), {
      source: "SynCloudOS.RootWatchdog",
      watchdog: "SynCloudOS root",
      componentStack: "\n    at App"
    });

    expect(captured).toMatchObject({
      code: "UNKNOWN_RUNTIME_ERROR",
      recoverable: false,
      severity: "fatal",
      suggestedActions: ["reload"]
    });
    expect(captured.technicalDetails).toContain("Root render failed");
    expect(RuntimeController.getSnapshot().errors.at(-1)?.id).toBe(captured.id);
  });

  it("uses plain caution for app recovery without an app icon and system branding for root failures", () => {
    expect(getSystemAlertIcon(createCapturedError({
      code: "APP_CONTENT_FAILED",
      appId: "journal-publisher",
      packageName: "JournalPublisher.app",
      suggestedActions: ["returnToWebspring"]
    }))).toMatchObject({
      kind: "app",
      src: null
    });

    expect(getSystemAlertIcon(createCapturedError({
      code: "UNKNOWN_RUNTIME_ERROR",
      suggestedActions: ["reload"]
    }))).toMatchObject({
      kind: "syncloudos",
      src: expect.stringContaining("SynCloudOSLogo.png")
    });
  });
});
