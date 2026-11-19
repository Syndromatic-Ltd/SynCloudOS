/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEAlert, NSEApplication, NSEWindowController, useNSEApplication, useNSEWindow } from "../../../../src/NSE/Application";
import { NSEAppearance } from "../../../../src/NSE/Appearance/NSEAppearance";
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { NSETabView } from "../../../../src/NSE/Navigation/NSETabView";
import { NSEPopover } from "../../../../src/NSE/Overlays/NSEPopover";
import type { NSEAppTheme } from "../../../../src/NSE/Theme/NSEAppTheme";
import type { NSETheme } from "../../../../src/NSE/Theme/NSETheme";
import { createSynWareDefinitionFromApplicationClass } from "../../../../src/SynCloudOS/AppHosting/applicationClass";
import { createSynWareBundle } from "../../../../src/SynCloudOS/AppSDK/createSynWare";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../../../src/SynCloudOSReact";
import { SystemUILayer } from "../../../../src/Webspring/SystemUILayer";
import { createWebspring } from "../../../../src/Webspring/public";
import { WebspringHost } from "../../../../src/Webspring/WebspringHost";
import "../../../../src/Webspring/WebspringHost.css";

const appId = "com.example.appearance-documents";
const documentTabs = ["Draft", "Archive"].map(label => ({
  id: label.toLowerCase(),
  label,
  render: () => <p>{label} content</p>,
}));
const controlsLayout = { display: "grid", justifyItems: "start", gap: 8, padding: 24 } as const;

export async function mountApplication(root: HTMLElement, dusk: NSETheme, red: NSEAppTheme, blue: NSEAppTheme) {
  const applicationAppearance = new NSEAppearance({ theme: red });
  const windowAppearance = new NSEAppearance({ theme: blue });

  function SecondaryDocument() {
    const app = useNSEApplication();
    const window = useNSEWindow();
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const [popover, setPopover] = useState(false);
    return (
      <div id="secondary-document" style={controlsLayout}>
        <NSETabView aria-label="Secondary document" items={documentTabs} defaultSelectedId="draft" />
        <button type="button" onClick={() => { app.appearance = applicationAppearance; }}>Set application appearance</button>
        <button type="button" onClick={() => { app.appearance = null; }}>Clear application appearance</button>
        <button type="button" onClick={() => { window.appearance = windowAppearance; }}>Set window appearance</button>
        <button type="button" onClick={() => { window.appearance = null; }}>Clear window appearance</button>
        <button type="button" onClick={() => {
          const alert = new NSEAlert();
          alert.messageText = "Keep draft?";
          alert.addButton("Keep");
          alert.addButton("Cancel");
          void alert.beginSheetModal(window);
        }}>Open draft sheet</button>
        <button type="button" onClick={() => { void runtime.commands.dispatch("system.showPreferences"); }}>Open System Preferences</button>
        <button type="button" ref={setAnchor} onClick={() => setPopover(true)}>Open document notes</button>
        <NSEPopover id="application-appearance-popover" open={popover} anchor={anchor} behavior="applicationDefined"
          surface="overlay" parentWindowControllerId={window.id} title="Document notes" onOpenChange={setPopover}
          presentation={{ mode: "anchored" }} contentSize={{ width: 200, height: 120 }}>
          <p>Document notes</p>
          <button type="button" onClick={() => { window.appearance = windowAppearance; }}>Change window appearance</button>
        </NSEPopover>
      </div>
    );
  }

  class SecondaryWindow extends NSEWindowController {
    static override view = SecondaryDocument;
  }

  function MainDocument() {
    const app = useNSEApplication();
    return (
      <div id="main-document" style={controlsLayout}>
        <NSETabView aria-label="Main document" items={documentTabs} defaultSelectedId="draft" />
        <button type="button" onClick={() => {
          void app.openWindow(SecondaryWindow, { title: "Secondary document", width: 480, height: 440, preferredBounds: "centred" });
        }}>Open secondary window</button>
      </div>
    );
  }

  class MainWindow extends NSEWindowController {
    static override view = MainDocument;
  }

  class DocumentApplication extends NSEApplication {
    static override mainWindow = MainWindow;
  }

  const definition = createSynWareDefinitionFromApplicationClass(DocumentApplication, {
    schemaVersion: 1,
    bundleIdentifier: appId,
    displayName: "Appearance Documents",
    version: "1.0.0",
    routes: [{ path: "/appearance-documents", primary: true }],
    runtime: { policy: { public: true } },
    webspring: { visible: true, order: 1 },
  });
  const shell = createWebspring({
    info: {
      bundleIdentifier: "com.example.appearance-documents-shell",
      displayName: "Appearance Documents shell",
      version: "1.0.0",
      branding: { name: { key: "shell.name", fallback: "Appearance Documents shell" } },
    },
  });
  const runtime = createSynCloudOS({
    id: "theme-application-scope",
    environment: createBrowserRuntimeEnvironment(),
    initialBundles: [createSynWareBundle(definition)],
    authenticationPolicy: "disabled",
  });
  await runtime.boot({ initialPathname: "/" });
  runtime.appearance.set("light");
  root.style.padding = "0";
  createRoot(root).render(
    <SynCloudOSProvider runtime={runtime}>
      <NSEAppearanceProvider theme={dusk} appearanceService={runtime.appearance}>
        <RuntimeInputBoundary>
          <WebspringHost shell={shell} startupPhase="complete" />
          <SystemUILayer />
        </RuntimeInputBoundary>
      </NSEAppearanceProvider>
    </SynCloudOSProvider>,
  );
  await runtime.launchServices.openApp(appId, { source: "developer" }).result;
}
