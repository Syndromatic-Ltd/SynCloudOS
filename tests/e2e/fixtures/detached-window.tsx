import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEAlert, NSEApplication, NSEWindowController, useNSEWindow } from "../../../src/NSE/Application";
import { NSEAppearanceProvider } from "../../../src/NSE/Appearance";
import { atmoTheme } from "../../../src/NSE/Appearance/atmo";
import { useNSEWindowLayoutSnapshot } from "../../../src/NSE/Layout/windowObstructions";
import { createSynWareDefinitionFromApplicationClass } from "../../../src/SynCloudOS/AppHosting/applicationClass";
import { createSynWareBundle } from "../../../src/SynCloudOS/AppSDK/createSynWare";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../../src/SynCloudOSReact";
import { createWebspring } from "../../../src/Webspring/public";
import { WebspringHost } from "../../../src/Webspring/WebspringHost";
import "../../../src/NSE/public/styles.css";
import "../../../src/NSE/Appearance/atmo-theme.css";
import "../../../src/SynCloudOS/styles/runtime.css";
import "../../../src/Webspring/WebspringHost.css";

const appId = "com.example.transfer-native";
const parameters = new URLSearchParams(location.search);
let windowLoads = 0;
let allowClose = false;
let closeAttempts = 0;

function Editor() {
  const [draft, setDraft] = useState("");
  const [response, setResponse] = useState("");
  const window = useNSEWindow();
  const layout = useNSEWindowLayoutSnapshot();
  return <>
    <label>Draft <input value={draft} onChange={event => setDraft(event.currentTarget.value)} /></label>
    <button type="button" onClick={() => {
      if (!window) return;
      const alert = new NSEAlert();
      alert.messageText = "Keep draft?";
      alert.addButton("Keep");
      alert.addButton("Cancel");
      void alert.beginSheetModal(window).then(result => setResponse(String(result)));
    }}>Open sheet</button>
    <button type="button" onClick={() => { allowClose = true; }}>Allow close</button>
    <output aria-label="Last sheet response">{response}</output>
    <output aria-label="Window loads">{windowLoads}</output>
    <output aria-label="Window identity">{window?.id}</output>
    <span hidden data-local-window-width={layout.bounds?.width} />
  </>;
}

class MainWindow extends NSEWindowController {
  static override view = Editor;
  override windowDidLoad() {
    windowLoads += 1;
    if (parameters.get("material") === "metal") {
      this.window.styleMask = [...this.window.styleMask, "texturedBackground"];
    }
  }
  override windowShouldClose() { closeAttempts += 1; return allowClose; }
}
class EditorApp extends NSEApplication {
  static override mainWindow = MainWindow;
}
const definition = createSynWareDefinitionFromApplicationClass(EditorApp, {
  schemaVersion: 1,
  bundleIdentifier: appId,
  displayName: "Transfer editor",
  version: "1.0.0",
  routes: [{ path: "/transfer", primary: true }],
  runtime: { policy: { public: true } },
  webspring: { visible: true, order: 1 },
});
const shell = createWebspring({
  info: {
    bundleIdentifier: "com.example.transfer-shell", displayName: "Transfer shell", version: "1.0.0",
    branding: { name: { key: "shell.name", fallback: "Transfer shell" } },
  },
});
const runtime = createSynCloudOS({
  environment: createBrowserRuntimeEnvironment(),
  initialBundles: [createSynWareBundle(definition)],
  authenticationPolicy: "disabled",
});
Object.defineProperty(document, "transferProbe", { value: {
  closeAttempts: () => closeAttempts,
  keyWindow: () => runtime.windows.snapshot().keyWindowControllerId,
} });
await runtime.boot({ initialPathname: "/" });
const appearance = parameters.get("appearance");
if (appearance === "dark" || appearance === "light") runtime.appearance.set(appearance);
createRoot(document.getElementById("root")!).render(
  <SynCloudOSProvider runtime={runtime}>
    <NSEAppearanceProvider theme={atmoTheme} appearanceService={runtime.appearance}>
      <RuntimeInputBoundary>
        <WebspringHost shell={shell} startupPhase="complete" />
      </RuntimeInputBoundary>
    </NSEAppearanceProvider>
  </SynCloudOSProvider>,
);
await runtime.launchServices.openApp(appId, { source: "developer" }).result;
