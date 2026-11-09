import { useContext, useEffect, useLayoutEffect, useState } from "react";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynWare, createSynWareBundle } from "../../../../src/SynCloudOS/AppSDK/createSynWare";
import { SynCloudOSProvider } from "../../../../src/SynCloudOSReact";
import { defineWebspring } from "../../../../src/Webspring/public";
import { WebspringBoardView } from "../../../../src/Webspring/Contents/Views/WebspringBoardView/WebspringBoardView";
import { WebspringHost } from "../../../../src/Webspring/WebspringHost";
import { NotificationCentrePresenter } from "../../../../src/Webspring/NotificationCentrePresenter";
import { NSEStandardWindowView } from "../../../../src/NSE/Windows/NSEStandardWindowView";
import { NSEHUDWindowView } from "../../../../src/NSE/Windows/NSEHUDWindowView";
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../../src/NSE/Themes/Atmo";
import { NSEWindowTitlebarHostContext } from "../../../../src/NSE/Windows/windowTitlebarContext";
import type { WindowRecord } from "../../../../src/SynCloudOS/Windows";
import type { NSEWindowToolbarStyle } from "../../../../src/NSE/Application/NSEWindowController";
import type { ThemeBaselineSurface } from "./catalogue";
import "../../../../src/Webspring/WebspringHost.css";

const shell = defineWebspring({
  manifest: { schemaVersion: 1, bundleIdentifier: "com.example.theme-baseline.shell", version: "1.0.0", displayName: "Atmo baseline",
    webspringShell: { views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "board", tablet: "board", mobile: "board" }, homeRoute: "/",
      branding: { name: { key: "baseline.name", fallback: "SynCloudOS" } },
      folders: { editable: true, initial: [{ id: "folder.tools", title: { key: "tools", fallback: "Tools" }, order: 1, apps: ["com.example.theme-baseline.pictures", "com.example.theme-baseline.music"] }] } } },
  components: { board: WebspringBoardView },
});

function SystemSurface({ kind }: { kind: "board" | "notifications" | "notification-centre" }) {
  const [runtime] = useState(() => createSynCloudOS({ id: "theme-baseline-system", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled",
    initialBundles: ["documents", "pictures", "music"].map((name, order) => createSynWareBundle(createSynWare({
      manifest: { schemaVersion: 1, bundleIdentifier: `com.example.theme-baseline.${name}`, version: "1.0.0", displayName: name[0].toUpperCase() + name.slice(1),
        runtime: { policy: { public: true } }, routes: [{ path: `/${name}`, primary: true }], webspring: { visible: true, order } }, root: () => null,
    }))) }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void runtime.boot({ initialPathname: "/" }).then(async () => {
      if (kind !== "board") await runtime.notifications.post({ kind: "system", title: "Backup finished", message: "All documents are safe." });
      if (active) setReady(true);
    });
    return () => { active = false; void runtime.dispose("theme baseline surface unmounted"); };
  }, [runtime, kind]);
  if (!ready) return <p>Preparing surface…</p>;
  return <SynCloudOSProvider runtime={runtime}><div data-system-baseline-ready="" style={{ height: "100vh" }}>
    {kind === "board" ? <WebspringHost shell={shell} startupPhase="complete" /> : <NotificationCentrePresenter snapshot={runtime.store.getSnapshot()} openRequest={kind === "notification-centre" ? { key: 1 } : null} />}
  </div></SynCloudOSProvider>;
}

function WindowSurface({ chrome, isKey, toolbarStyle }: { chrome: "standard" | "metal" | "hud"; isKey: boolean; toolbarStyle: NSEWindowToolbarStyle }) {
  const scheme = new URLSearchParams(location.search).get("scheme") === "dark" ? "dark" : "light";
  const record: WindowRecord = {
    id: "baseline-window", runtimeId: "baseline" as WindowRecord["runtimeId"], workspaceId: "baseline", applicationId: null, applicationSessionId: null,
    documentId: null, documentAssociationRole: null, representedDocument: null, toolbar: null,
    role: chrome === "hud" ? "hud" : "standard", style: ["titled", "closable", "minimisable", "zoomable", "resizable"], title: "Documents",
    content: { rendererId: "baseline", parameters: {} }, bounds: { x: 0, y: 0, width: 600, height: 280 }, minimumSize: { width: 200, height: 150 }, maximumSize: null,
    level: chrome === "hud" ? "floating" : "normal", parentWindowControllerId: null, anchor: null, pinned: false, state: "open", isKey, isMain: isKey,
    zIndex: 1, mobilePolicy: "fullscreen", restorationKey: null, chromeMode: "system", smoothSurface: "off",
  };
  const View = chrome === "hud" ? NSEHUDWindowView : NSEStandardWindowView;
  return <div style={{ position: "relative", width: 600, height: 280 }}><NSEAppearanceProvider theme={atmoTheme} chrome={chrome} colourScheme={scheme}>
    <View record={record} presentation={{ kind: "desktop-window", visible: true, bounds: record.bounds, safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }, movable: true, resizable: true, titleBarVisible: true }} blocked={false} dirty={false} dispatchCommand={async () => undefined}><WindowDocument toolbarStyle={toolbarStyle} /><p>Window content</p></View>
  </NSEAppearanceProvider></div>;
}
function WindowDocument({ toolbarStyle }: { toolbarStyle: NSEWindowToolbarStyle }) {
  const host = useContext(NSEWindowTitlebarHostContext);
  useLayoutEffect(() => { host?.setDocument({ title: "Documents", subtitle: "3 items", documentEdited: false, toolbarStyle }); return () => host?.setDocument(null); }, [host, toolbarStyle]);
  return null;
}

export function systemThemeBaselineCatalogue(): ThemeBaselineSurface[] {
  const entries: ThemeBaselineSurface[] = [];
  for (const chrome of ["standard", "metal", "hud"] as const) for (const isKey of [false, true]) for (const toolbarStyle of ["automatic", "expanded", "preference", "unified", "unifiedCompact"] as const) {
    entries.push({ id: `window-${chrome}-${isKey ? "key" : "inactive"}-${toolbarStyle}`, render: () => <WindowSurface chrome={chrome} isKey={isKey} toolbarStyle={toolbarStyle} /> });
  }
  for (const kind of ["board", "notifications", "notification-centre"] as const) entries.push({ id: kind, render: () => <SystemSurface kind={kind} />, ready: kind === "board" ? ".webspring-board" : kind === "notifications" ? ".syncloudos-notification-banner" : "#syncloudos-notification-centre", fullPage: true });
  entries.push({ id: "folder-presentation", render: () => <SystemSurface kind="board" />, ready: ".webspring-board", interaction: "folder", fullPage: true });
  return entries;
}
