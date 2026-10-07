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

import { describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";
import { defineSyncUndoAction } from "../../src/SynCloudOS/SynCloudOS";

describe("Diagnostics Inspector runtime report", () => {
  it("publishes the immutable redacted conformance projection through the canonical inspector", () => {
    const runtime = createTestRuntime({ id: "runtime:diagnostics-conformance" });
    const { Inspector } = createRuntimeHarness(runtime);
    runtime.errors.capture({
      code: "DIAGNOSTICS_SECRET",
      title: "Sensitive diagnostics fixture",
      message: "secret body",
      source: "tests",
    });
    runtime.pasteboards.system.clear();

    const snapshot = Inspector.getConformanceSnapshot();

    expect(snapshot).toMatchObject({ runtimeId: expect.stringMatching(/^ref-/) });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.pasteboards).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "system", types: [] }),
    ]));
    expect(JSON.stringify(snapshot)).not.toContain("secret body");
  });

  it("collects launch, policy, registry, statechart, services, routing, windows, errors, and login data", async () => {
    const {
      AppRegistry,
      Inspector,
      LaunchServices,
      PolicyKit,
      RouteManager,
      RuntimeController,
      ServiceRegistry,
      WindowManager
    } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.ensureDefaults();
    ServiceRegistry.setAvailability("windowing", false);
    PolicyKit.setAccessMode("webspringVisibleAppProtected");
    AppRegistry.registerMany([
      createTestManifest({
        id: "inspector-app",
        route: "/inspector",
        presentation: "windowedView",
        requiredServices: ["webspring", "routing"]
      }),
      createTestManifest({
        id: "blocked-app",
        route: "/blocked",
        requiredServices: ["windowing"]
      })
    ]);

    RouteManager.openRoute("/");
    await WindowManager.openApplicationWindow("inspector-app");
    LaunchServices.openApp("blocked-app", { deferUntilAuthorised: true });
    LaunchServices.openApp("missing-app");
    const report = Inspector.getRuntimeReport();

    expect(report.apps.registered).toContain("InspectorApp.app");
    expect(report.apps.registrationHistory.map((entry) => entry.appId)).toEqual(
      expect.arrayContaining(["inspector-app", "blocked-app"])
    );
    expect(report.policyKit.accessMode).toBe("webspringVisibleAppProtected");
    expect(report.policyKit.auditLog.at(-1)).toMatchObject({ action: "app.launch", allowed: false });
    expect(report.launch.deferred).toEqual([expect.objectContaining({ appId: "blocked-app" })]);
    expect(report.launch.history.map((entry) => ("action" in entry ? entry.action : entry.type))).toContain("deferred");
    expect(report.services.dependencyGraph.webspring).toEqual(expect.arrayContaining(["assetLoading", "responsiveMode"]));
    expect(report.services.impactSummary.affectedApps).toEqual([
      expect.objectContaining({ appId: "blocked-app", missing: ["windowing"] })
    ]);
    expect(report.routing.currentExplanation).toMatchObject({ kind: "webspring", pathname: "/" });
    expect(report.routing.history.at(-1)).toMatchObject({ action: "open", pathname: "/" });
    expect(report.windows).toMatchObject({ openWindowCount: 1, activeAppId: "inspector-app", ok: true });
    expect(report.statechart.definitions["active.webspring"]).toMatchObject({ name: "active.webspring" });
    expect(report.statechart.inspection?.inspectedState).toBe(report.statechart.currentState);
    expect(report.errorReport.latest).toMatchObject({ code: "APP_NOT_FOUND" });
    expect(report.loginServices.status).toBe("locked");
    expect(report.transactions).toEqual(RuntimeController.getTransactionHistory());
  });

  it("reports bounded command, responder, focus, binding, and undo state without sensitive data", async () => {
    const runtime = createTestRuntime({ commandHistoryLimit: 3 });
    const { Inspector } = createRuntimeHarness(runtime);
    runtime.responders.register({ id: "app:inspect", kind: "application", parentId: "workspace", scopeId: "app:inspect" });
    runtime.responders.register({ id: "control:inspect", kind: "control", parentId: "app:inspect", scopeId: "app:inspect", undoOwner: { kind: "document", id: "inspect" } });
    runtime.focus.requestFocus("control:inspect");
    const command = runtime.commands.register({
      id: "inspect.command",
      responderId: "control:inspect",
      title: { key: "inspect.command", fallback: "Inspect command" },
      payload: { description: "A secret.", parse: (value: unknown) => typeof value === "string" ? { ok: true as const, value } : { ok: false as const, issues: ["String required."] } },
      defaultKeyBindings: [{ key: "i", modifiers: ["primary"], scope: "focused" }],
      scope: "focused",
      undo: { kind: "none" },
      execute: () => undefined,
      telemetry: { category: "inspection", sensitivePayload: true },
    });
    for (let index = 0; index < 4; index += 1) await runtime.commands.dispatch("inspect.command", `secret-${index}`);
    runtime.keyBindings.resolve({ key: "i", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false }, {});
    const manager = runtime.undo.create({ kind: "document", id: "inspect" });
    manager.register(defineSyncUndoAction({
      name: "Private edit",
      asyncPolicy: "forbid",
      undo: () => undefined,
      redo: () => undefined,
      restoration: { before: { selection: "private-selection" }, restore: () => undefined },
    }));
    const popover = runtime.focus.openScope({ id: "inspect:popover", kind: "popover", parentResponderId: "control:inspect", modal: false, trapFocus: false });
    popover.close();
    runtime.responders.resolveChain();

    const generatedAt = 1_786_136_917_010;
    vi.mocked(runtime.environment.now).mockReturnValue(generatedAt);
    const report = Inspector.getRuntimeReport();
    expect(report.generatedAt).toBe(generatedAt);
    expect(report.commands.registrations).toContainEqual(expect.objectContaining({ commandId: "inspect.command", responderId: "control:inspect" }));
    expect(report.commands.history).toHaveLength(3);
    expect(report.responders.lastResolution[0]).toBe("control:inspect");
    expect(report.focus.restorations.at(-1)).toEqual({ scopeId: "inspect:popover", responderId: "control:inspect" });
    expect(report.keyBindings.lastCandidates).toContainEqual(expect.objectContaining({ commandId: "inspect.command", reason: "winner" }));
    expect(report.undo).toContainEqual(expect.objectContaining({ owner: { kind: "document", id: "inspect" }, undoTitle: "Undo Private edit" }));
    expect(JSON.stringify(report)).not.toContain("secret-3");
    expect(JSON.stringify(report)).not.toContain("private-selection");
    command.dispose();
  });
});
