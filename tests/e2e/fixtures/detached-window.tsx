import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEAlert, NSEApplication, NSEWindowController, useNSEWindow } from "../../../src/NSE/Application";
import { NSEAppearanceProvider } from "../../../src/NSE/Appearance";
import { atmoTheme } from "../../../src/NSE/Appearance/atmo";
import { createSynWareDefinitionFromApplicationClass } from "../../../src/SynCloudOS/AppHosting/applicationClass";
import { createSynWareBundle } from "../../../src/SynCloudOS/AppSDK/createSynWare";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../../src/SynCloudOSReact";
import { defineWebspring, WebspringBoardView } from "../../../src/Webspring/public";
import { WebspringHost } from "../../../src/Webspring/WebspringHost";
import "../../../src/NSE/public/styles.css";
import "../../../src/NSE/Appearance/atmo-theme.css";
import "../../../src/SynCloudOS/styles/runtime.css";
import "../../../src/Webspring/WebspringHost.css";

const appId = "com.example.transfer-native";
let windowLoads = 0;
let allowClose = false;
let closeAttempts = 0;

function Editor() {
  const [draft, setDraft] = useState("");
  const [response, setResponse] = useState("");
  const window = useNSEWindow();
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
  </>;
}

class MainWindow extends NSEWindowController {
  static override view = Editor;
  override windowDidLoad() { windowLoads += 1; }
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
const shell = defineWebspring({
  manifest: {
    schemaVersion: 1, bundleIdentifier: "com.example.transfer-shell", displayName: "Transfer shell", version: "1.0.0",
    webspringShell: {
      views: [{ id: "board", mode: "launcher", presentations: ["desktop", "tablet", "mobile"] }],
      defaults: { desktop: "board", tablet: "board", mobile: "board" },
      homeRoute: "/",
      branding: { name: { key: "shell.name", fallback: "Transfer shell" } },
    },
  },
  components: { board: WebspringBoardView },
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
