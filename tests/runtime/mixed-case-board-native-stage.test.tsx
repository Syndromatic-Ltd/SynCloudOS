// @vitest-environment jsdom
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppSDK/applicationClass";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring, WebspringBoardView } from "../../src/Webspring/public";
import { selectApplicationStageAppIds } from "../../src/Webspring/ApplicationStageLayer";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageLayer } from "../../src/Webspring/ApplicationStageLayer";
import { createApplicationWindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { createClassApplicationHost } from "./fixtures/classApplicationHost";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });

const appId = "com.example.BetaNotes";
const mounts: MountedSynCloudOSHost[] = [];
const elements: HTMLElement[] = [];
afterEach(async () => {
  for (const host of mounts.splice(0)) await act(async () => { await host.dispose("mixed-case-stage-test"); });
  for (const element of elements.splice(0)) element.remove();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1, bundleIdentifier: "com.example.NotesBoard", displayName: "Notes Board", version: "1.0.0",
    webspringShell: {
      views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "board", tablet: "board", mobile: "board" }, homeRoute: "/",
      branding: { name: { key: "host.name", fallback: "Notes Board" } },
    },
  },
  components: { board: WebspringBoardView },
});

function notesBundle(events: string[]) {
  class NotesController extends NSEViewController {
    static override view = function NotesContent() {
      const [opened, setOpened] = useState(false);
      return <button onClick={() => setOpened(true)}>{opened ? "Native note opened" : "Open native note"}</button>;
    };
  }
  class NotesWindow extends NSEWindowController {
    readonly workspace = new NotesController();
    override windowDidLoad() {
      events.push("windowDidLoad");
      this.contentViewController = this.workspace;
    }
  }
  class NotesApplication extends NSEApplication {
    static override mainWindow = NotesWindow;
    override applicationWillFinishLaunching() { events.push("applicationWillFinishLaunching"); }
    override applicationDidFinishLaunching() { events.push("applicationDidFinishLaunching"); }
  }
  return createSynWareDefinitionFromApplicationClass(NotesApplication, {
    schemaVersion: 1, bundleIdentifier: appId, displayName: "Beta Notes", version: "1.0.0",
    routes: [{ path: "/notes", primary: true }],
    runtime: { presentation: "appView", policy: { public: true, requiresLogin: false } },
  });
}

describe("mixed-case native application Board stages", () => {
  it.each(["Board icon", "deep link"] as const)("mounts the authored class main view from a %s", async entry => {
    const events: string[] = [];
    const bundle = notesBundle(events);
    const element = document.createElement("div");
    document.body.append(element);
    elements.push(element);
    window.history.replaceState(null, "", entry === "deep link" ? "/notes" : "/");
    let mounting!: Promise<MountedSynCloudOSHost>;
    await act(async () => {
      mounting = mountSynCloudOS({ element, shell, bundles: [bundle], authentication: "disabled" });
    });
    mounts.push(await mounting);
    const runtime = vi.mocked(createSynCloudOS).mock.results.at(-1)!.value;
    if (entry === "Board icon") {
      const icon = await screen.findByRole("button", { name: "Open Beta Notes" });
      await act(async () => { fireEvent.click(icon); });
    }
    await waitFor(() => expect(runtime.store.getSnapshot().application.activeAppId).toBe(appId));
    const content = await screen.findByRole("button", { name: "Open native note" });
    expect(events).toContain("applicationWillFinishLaunching");
    expect(events).toContain("applicationDidFinishLaunching");
    expect(events).toContain("windowDidLoad");
    expect(window.location.pathname).toBe("/notes");
    expect(bundle.manifest.bundleIdentifier).toBe(appId);
    expect(runtime.apps.getApp(appId.toUpperCase())?.bundleIdentifier).toBe(appId);
    expect(runtime.store.getSnapshot().appInfo[appId.toLowerCase()]?.bundleIdentifier).toBe(appId);
    fireEvent.click(content);
    expect(await screen.findByRole("button", { name: "Native note opened" })).toBeTruthy();
  });

  it("retains the native stage when selection changes only identifier case", async () => {
    class MainWindow extends NSEWindowController {
      static override view = function NativeContent() {
        return <input aria-label="Native note" defaultValue="Draft" />;
      };
    }
    class Application extends NSEApplication { static override mainWindow = MainWindow; }
    const host = createClassApplicationHost(Application, appId);
    await host.launch();
    const snapshot = host.runtime.store.getSnapshot();
    const registry = createApplicationWindowContentRendererRegistry(host.runtime, snapshot.appInfo);
    const frame = (selection: string) => (
      <SynCloudOSProvider runtime={host.runtime}>
        <HostSiteBrandingProvider value={{ name: "Notes Board", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null }}>
          <ApplicationStageLayer windowContentRegistry={registry} apps={snapshot.appInfo}
            lifecycle={snapshot.lifecycle} activeAppId={selection} />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>
    );
    const view = render(frame(appId));
    try {
      const content = await screen.findByRole("textbox", { name: "Native note" }) as HTMLInputElement;
      fireEvent.change(content, { target: { value: "Edited native note" } });
      act(() => { content.focus(); });
      view.rerender(frame(appId.toUpperCase()));
      expect(await screen.findByRole("textbox", { name: "Native note" })).toBe(content);
      expect(content.value).toBe("Edited native note");
      expect(document.activeElement).toBe(content);
    } finally {
      view.unmount();
      await host.dispose();
    }
  });

  it("selects a same-app MultiSwitch only once without rewriting its authored ID", () => {
    expect(selectApplicationStageAppIds({
      activeAppId: appId,
      multiSwitch: { status: "switching", fromAppId: appId, toAppId: appId.toUpperCase() },
      returnTransitionId: null,
    })).toEqual([appId]);
  });
});
