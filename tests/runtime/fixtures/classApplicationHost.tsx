import { act, render, type RenderResult } from "@testing-library/react";
import * as React from "react";
import { StrictMode, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { NSEApplicationClass } from "../../../src/NSE/Application/NSEApplication";
import { createSynWareDefinitionFromApplicationClass, createSynWareDefinitionFromComponent, isNSEApplicationClass } from "../../../src/SynCloudOS/AppSDK/applicationClass";
import { applicationSessionFor } from "../../../src/SynCloudOS/AppSDK/applicationSession";
import type { SynWareManifestV1 } from "../../../src/SynCloudOS/AppSDK/manifest/manifestTypes";
import type { AppCloseResult, AppLaunchResult } from "../../../src/SynCloudOS/Lifecycle/lifecycleTypes";
import type { RuntimeOperationHandle, SynCloudOSRuntime } from "../../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { WindowPresentation } from "../../../src/SynCloudOS/Windows";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../../src/SynCloudOSReact";
import { createApplicationWindowContentRendererRegistry } from "../../../src/Webspring/WindowLayer";
import { standardWindow } from "../../fixtures/windowTestDependencies";
import { createBrowserAnimationLayerHost } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost";
import { authoriseTestRuntime, createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare } from "../helpers";

let hostSequence = 0;
const branding = Object.freeze({ name: "Class application host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null });

export interface ClassApplicationHost {
  readonly runtime: SynCloudOSRuntime;
  readonly appId: string;
  /** Launches the application through the kernel. */
  launch(): RuntimeOperationHandle<AppLaunchResult>["result"];
  /** Quits the application through the kernel. */
  quit(): RuntimeOperationHandle<AppCloseResult>["result"];
  /** Opens the application's first window and mounts what it renders. */
  openMainWindow(): Promise<string>;
  /** Mounts a window host that renders every window the runtime opens for the application. */
  mountWindows(options?: { readonly strict?: boolean }): { unmount(): void };
  /** Unmounts every window host mounted so far; the windows stay open in the runtime. */
  unmountWindows(): void;
  dispose(): Promise<void>;
}

/**
 * Registers `AppClass` (an application class, or a function component for the single-window shortcut) as an application of a fresh test runtime and renders
 * its windows through the production window content renderer, so a test sees
 * the lifecycle, the window guards and the controllers' views as a host does.
 */
export function createClassApplicationHost(AppClass: NSEApplicationClass | ComponentType, appId = "com.example.classes-app"): ClassApplicationHost {
  const animationLayers = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false });
  const runtime = authoriseTestRuntime(createTestRuntime({
    id: `runtime:${appId}:${++hostSequence}`,
    environment: { ...createTestRuntimeEnvironment(), animationLayers },
  }));
  const manifest: SynWareManifestV1 = { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "Class application" };
  registerTestSynWare(
    runtime,
    isNSEApplicationClass(AppClass)
      ? createSynWareDefinitionFromApplicationClass(AppClass, manifest)
      : createSynWareDefinitionFromComponent(AppClass, manifest),
  );
  runtime.responders.register({ id: `application:${appId}`, kind: "application", parentId: "workspace", scopeId: `application:${appId}` });
  const registry = createApplicationWindowContentRendererRegistry(runtime, { [appId]: runtime.apps.getApp(appId)! });
  let windowSequence = 0;
  const mounted: Array<{ unmount(): void }> = [];

  function WindowHost() {
    const snapshot = useSyncExternalStore(runtime.windows.subscribe, runtime.windows.snapshot, runtime.windows.snapshot);
    return (
      <>
        {snapshot.windowControllerIds.map((id) => {
          const record = runtime.windows.select(id).record;
          if (record.applicationId !== appId || record.state === "closed") return null;
          return (
            <React.Fragment key={id}>
              {registry.render(`application:${appId}`, { mountKey: `application:${appId}`, presentation: {} as WindowPresentation, window: record })}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  const tree = (ui: ReactNode) => (
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={branding}>{ui}</HostSiteBrandingProvider>
    </SynCloudOSProvider>
  );

  return {
    runtime,
    appId,
    launch: () => runtime.lifecycle.launch(appId).result,
    quit: () => runtime.lifecycle.close(appId, { reason: "test" }).result,
    async openMainWindow() {
      const id = `window:${appId}:${++windowSequence}`;
      const window = runtime.windows.create(standardWindow(id, {
        applicationId: appId,
        applicationSessionId: appId,
        content: { rendererId: "application", parameters: { appId } },
        restorationKey: `class-application-host.${id}`,
      }));
      await runtime.windows.open(window.id);
      return window.id;
    },
    mountWindows(options = {}) {
      let result!: RenderResult;
      act(() => {
        result = render(tree(options.strict ? <StrictMode><WindowHost /></StrictMode> : <WindowHost />));
      });
      const handle = { unmount: () => { act(() => { result.unmount(); }); } };
      mounted.push(handle);
      return handle;
    },
    unmountWindows() {
      for (const handle of mounted.splice(0)) handle.unmount();
    },
    async dispose() {
      for (const handle of mounted.splice(0)) handle.unmount();
      // Disposing a runtime does not close its applications; a session left behind would keep later tests in class-application mode.
      applicationSessionFor({ runtimeId: runtime.runtimeId, appId })?.dispose("explicit");
      await runtime.dispose();
    },
  };
}
