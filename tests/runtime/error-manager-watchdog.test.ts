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
import { SynCloudOSLifecycleRecord } from "../../src/SynCloudOS/ErrorManager/lifecycleError";
import { toTechnicalReport } from "../../src/SynCloudOS/ErrorManager/errorReport";

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

function disposedLayerError() {
  const record = new SynCloudOSLifecycleRecord({ kind: "AFXLayer" });
  record.markDisposed("explicit");
  return record.error({ code: "AFX_LAYER_DISPOSED", operation: "hidden", access: "set" });
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

    const captured = SynCloudOS.ErrorManager.createAppContentFailedError(app, new TypeError("Cannot read properties of null (reading 'value')"), {
      watchdog: "MemoJournal.app presentation",
      componentStack: "\n    at MemoJournalApp (index.tsx:88:31)",
      windowId: "window-memo-journal"
    });

    expect(captured).toMatchObject({
      code: "APP_CONTENT_FAILED",
      exception: "TypeError",
      message: "Cannot read properties of null (reading 'value')",
      source: "SynCloudOS.AppWatchdog",
      appId: "memo-journal",
      packageName: "MemoJournal.app",
      recoverable: false,
      severity: "fatal",
      suggestedActions: ["returnToWebspring"]
    });
    expect(captured.technicalDetails).toContain("MemoJournalApp");
    expect(captured.technicalDetails).toContain("Window: window-memo-journal");
    expect(RuntimeController.getSnapshot().errors.at(-1)?.id).toBe(captured.id);
    expect(RuntimeController.getSnapshot().webspring.lowerShelfMode).toBe("error");
  });

  it("captures root render failures as fatal reloadable alerts", async () => {
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());

    const captured = SynCloudOS.ErrorManager.createRuntimeRenderError(new Error("Root render failed"), {
      watchdog: "SynCloudOS root",
      componentStack: "\n    at App"
    });

    expect(captured).toMatchObject({
      code: "UNKNOWN_RUNTIME_ERROR",
      exception: "Error",
      message: "Root render failed",
      source: "SynCloudOS.RootWatchdog",
      recoverable: false,
      severity: "fatal",
      suggestedActions: ["reload"]
    });
    expect(captured.technicalDetails).not.toContain("Root render failed");
    expect(RuntimeController.getSnapshot().errors.at(-1)?.id).toBe(captured.id);
  });

  it("keeps a thrown lifecycle error's own code and class instead of the watchdog's generic code", () => {
    const { AppRegistry, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const app = AppRegistry.register(createTestManifest({ id: "fx-demo", packageName: "FXDemo.app", displayName: "FX Demo", route: "/fx-demo", componentKey: "FXDemo" }));

    for (const captured of [
      SynCloudOS.ErrorManager.createRuntimeRenderError(disposedLayerError()),
      SynCloudOS.ErrorManager.createAppContentFailedError(app, disposedLayerError()),
    ]) {
      expect(captured).toMatchObject({ code: "AFX_LAYER_DISPOSED", exception: "SynCloudOSLifecycleError", message: "Cannot set AFXLayer.hidden after disposal." });
      expect(captured.technicalDetails).toContain("Disposal reason: an explicit dispose() call");
      expect(captured.technicalDetails).toContain("StrictMode");
      expect(captured.technicalDetails).not.toMatch(/\bnone\b|undefined|null/);
    }
  });

  it("formats one summary and omits unknown fields in the technical report", () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const captured = SynCloudOS.ErrorManager.createRuntimeRenderError(disposedLayerError(), { watchdog: "SynCloudOS root" });
    const report = toTechnicalReport(captured);

    expect(report.startsWith([
      "Webspring stopped because of an error.",
      "",
      "Exception: SynCloudOSLifecycleError",
      "Code: AFX_LAYER_DISPOSED",
      "Message: Cannot set AFXLayer.hidden after disposal.",
      "Caught by: SynCloudOS.RootWatchdog",
    ].join("\n"))).toBe(true);
    expect(report).not.toMatch(/: none$|SYN-|UNKNOWN_RUNTIME_ERROR/m);
    expect(report.split("Cannot set AFXLayer.hidden after disposal.")).toHaveLength(2);
    expect(SynCloudOS.ErrorManager.toTechnicalReport(captured)).toBe(report);
  });

  it("applies the generic code to an error without a catalogue code and to a thrown non-Error value", () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const coded = Object.assign(new Error("x"), { code: "ERR_SOMETHING_LOCAL" });

    expect(SynCloudOS.ErrorManager.createRuntimeRenderError(new Error("x"))).toMatchObject({ code: "UNKNOWN_RUNTIME_ERROR", exception: "Error", message: "x" });
    expect(SynCloudOS.ErrorManager.createRuntimeRenderError(coded)).toMatchObject({ code: "UNKNOWN_RUNTIME_ERROR" });
    expect(SynCloudOS.ErrorManager.createRuntimeRenderError("plain failure")).toMatchObject({
      code: "UNKNOWN_RUNTIME_ERROR",
      exception: "Non-Error value (string)",
      message: "plain failure",
    });
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
