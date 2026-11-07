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
import { createTestRuntime, createTestBundle, createTestManifest, flushLaunchTimers, createRuntimeHarness, unlockRuntime } from "./helpers";
import { noteType } from "../fixtures/noteDocumentType";
import { standardWindow } from "../fixtures/windowTestDependencies";

describe("runtime routes, services, windows, and launch services", () => {
  it("describes the retained contact composition capability without claiming a retired app owner", () => {
    const { ServiceRegistry } = createRuntimeHarness(createTestRuntime());
    ServiceRegistry.ensureDefaults();

    const contact = ServiceRegistry.getServiceReport(["contact"]).items[0];

    expect(contact).toMatchObject({
      serviceId: "contact",
      description: "Generic mail composition with a mailto fallback.",
      providedCapabilities: ["contact.compose"],
    });
  });

  it("reports service availability for registered, unavailable, and unknown services", async () => {
    const { ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.ensureDefaults();
    ServiceRegistry.setAvailability("windowing", false);
    ServiceRegistry.registerService({
      id: "custom.available",
      displayName: "Custom Available",
      description: "Test service.",
      availability: "available"
    });

    const report = ServiceRegistry.getServiceReport(["webspring", "windowing", "custom.available", "missing.service"]);

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["windowing", "missing.service"]);
    expect(report.items.find((item) => item.serviceId === "custom.available")?.available).toBe(true);
  });

  it("resolves route tables without opening UI surfaces", async () => {
    const { AppRegistry, RouteManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestManifest({ bundleIdentifier: "com.example.portfolio", route: "/portfolio" }),
      createTestManifest({ bundleIdentifier: "com.example.memo-journal", route: "/memo-journal" }),
      createTestManifest({ bundleIdentifier: "com.example.github", route: "https://github.com/syndromatic", type: "external" })
    ]);

    expect(RouteManager.resolveRoute("/")).toMatchObject({ kind: "webspring", pathname: "/" });
    expect(RouteManager.resolveRoute("/portfolio")).toMatchObject({ kind: "app", pathname: "/portfolio" });
    expect(RouteManager.resolveRoute("/memo-journal")).toMatchObject({ kind: "app", pathname: "/memo-journal" });
    expect(RouteManager.resolveRoute("https://github.com/syndromatic")).toMatchObject({ kind: "external" });
    expect(RouteManager.resolveRoute("/nope")).toMatchObject({ kind: "notFound", pathname: "/nope" });
    expect(RouteManager.getRouteTable().map((route) => route.appId)).toEqual(["com.example.portfolio", "com.example.memo-journal", "com.example.github"]);
    expect(RouteManager.getAppForRoute("/portfolio")?.bundleIdentifier).toBe("com.example.portfolio");
    expect(RouteManager.getAppForRoute("/memo-journal")?.bundleIdentifier).toBe("com.example.memo-journal");
  });

  it("opens, focuses, reuses, and closes runtime windows", async () => {
    const { AppRegistry, WindowManager, RuntimeController } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestManifest({ bundleIdentifier: "com.example.first-window", presentation: "windowedView", window: { title: "First Window" } }),
      createTestManifest({ bundleIdentifier: "com.example.second-window", presentation: "windowedView", window: { title: "Second Window" } })
    ]);

    const first = await WindowManager.openApplicationWindow("com.example.first-window");
    const second = await WindowManager.openApplicationWindow("com.example.second-window");
    const reopenedFirst = await WindowManager.openApplicationWindow("com.example.first-window");

    expect(reopenedFirst?.id).toBe(first?.id);
    expect(RuntimeController.getSnapshot().application.activeAppId).toBeNull();
    expect(WindowManager.list()).toHaveLength(2);
    expect(WindowManager.snapshot().keyWindowControllerId).toBe(first?.id);
    expect(second?.record.isKey).toBe(false);

    await WindowManager.requestClose(first?.id ?? "", { reason: "command" });

    expect(WindowManager.list().map(({ record }) => record.applicationId)).toEqual(["com.example.second-window"]);
    expect(WindowManager.snapshot().keyWindowControllerId).toBe(second?.id);
    expect(RuntimeController.getSnapshot().application.activeAppId).toBeNull();
  });

  it.each([
    ["LaunchServices.closeApp", async (harness: ReturnType<typeof createRuntimeHarness>, appId: string) => harness.LaunchServices.closeApp(appId)],
    ["AppRegistry.unregister", async (harness: ReturnType<typeof createRuntimeHarness>, appId: string) => harness.AppRegistry.unregister(appId)],
  ])("preserves a dirty final document when %s is cancelled", async (_entryPoint, close) => {
    const runtime = createTestRuntime();
    const harness = createRuntimeHarness(runtime);
    const appId = `com.example.document-entry-${_entryPoint.startsWith("Launch") ? "launch" : "registry"}`;
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, presentation: "windowedView" }));
    runtime.documents.registerType(noteType);
    const document = await runtime.documents.newDocument({
      documentId: `${appId}-document`,
      typeId: noteType.id,
      applicationId: appId,
    });
    const controller = runtime.windows.create(standardWindow(`${appId}-primary`, {
      applicationId: appId,
      applicationSessionId: appId,
      documentId: document.id,
      documentAssociationRole: "primary",
      content: { rendererId: "application", parameters: { appId } },
    }));
    await runtime.windows.open(controller.id);
    const cancellation = runtime.documents.registerCloseReviewer({ review: async () => "cancel" });
    const prepareCloseDocuments = vi.spyOn(runtime.documents, "prepareCloseDocuments");

    await close(harness, appId);

    expect(prepareCloseDocuments).toHaveBeenCalledOnce();
    expect(prepareCloseDocuments).toHaveBeenCalledWith(
      [document.id],
      "application-quit",
      undefined,
      [controller.id],
    );
    expect(runtime.windows.list({ applicationId: appId })).toHaveLength(1);
    expect(runtime.documents.getDocument(document.id)).toBe(document);
    expect(harness.AppRegistry.getApp(appId)).not.toBeNull();
    cancellation.dispose();
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await runtime.dispose("entrypoint-test-cleanup");
  });

  it("refuses protected launches until LoginServices has an authorised session", async () => {
    const { AppRegistry, LaunchServices, PolicyKit, RuntimeController } = createRuntimeHarness(createTestRuntime());
    PolicyKit.setAccessMode("webspringVisibleAppProtected");
    AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.locked-app" }));

    const manager = LaunchServices.openApp("com.example.locked-app");

    expect(manager).toBeNull();
    const captured = RuntimeController.getSnapshot().errors.at(-1);
    expect(captured).toMatchObject({
      code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH",
      title: "Webspring has unexpectedly stopped.",
      message: "An unexpected error has prevented this application from working properly.",
      context: { requestedAppId: "com.example.locked-app" },
    });
    expect(captured?.technicalDetails).toContain("This app launch requires an authorised session.");
    expect(captured?.technicalDetails).not.toMatch(/cookie|token|watchdog/iu);
    expect(RuntimeController.getSnapshot()).toMatchObject({
      application: { activeAppId: null },
      lifecycle: { "com.example.locked-app": "registered" },
    });
    expect(PolicyKit.getAuditLog().at(-1)).toMatchObject({
      action: "app.launch",
      allowed: false,
      mode: "webspringVisibleAppProtected",
      resource: "com.example.locked-app"
    });
  });

  it("allows public-mode launches without a LoginServices session", async () => {
    const { AppRegistry, LaunchServices, PolicyKit } = createRuntimeHarness(createTestRuntime());
    PolicyKit.setAccessMode("public");
    AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.public-launch", policy: { public: true } }));

    expect(LaunchServices.explainLaunch("com.example.public-launch")).toMatchObject({
      canLaunch: true,
      code: "READY",
      policy: expect.objectContaining({ allowed: true })
    });
  });

  it("launches an authorised app through manager lifecycle, windows, and route state", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LaunchServices, LoginServices, RuntimeController, WindowManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio", presentation: "windowedView" }));
    const unlock = unlockRuntime(LoginServices);

    const manager = LaunchServices.openApp("com.example.studio");
    await flushLaunchTimers();

    expect(unlock.ok).toBe(true);
    expect(manager?.getState()).toBe("active");
    expect(WindowManager.list()[0]?.record).toMatchObject({ applicationId: "com.example.studio", isKey: true });
    expect(RuntimeController.getSnapshot().application.routePath).toBe("/studio");
    expect(window.location.pathname).toBe("/studio");
  });
});
