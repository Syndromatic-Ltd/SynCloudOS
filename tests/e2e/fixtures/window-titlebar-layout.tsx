import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEAppearance } from "../../../src/NSE/Appearance/NSEAppearance";
import { NSEAppearanceProvider, ViewAppearanceBoundary } from "../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../src/NSE/Appearance/atmo";
import { StandaloneControlHost } from "../../../src/NSE/Overlays";
import { NSEMenu } from "../../../src/NSE/Menus/NSEMenu";
import { NSEMenuBar } from "../../../src/NSE/Menus/NSEMenuBar";
import { nseMenuModel } from "../../../src/NSE/Menus/menuTypes";
import { MenuRuntimeProvider } from "../../../src/NSE/Menus/menuRuntimeContext";
import { WindowTitlebarView } from "../../../src/NSE/Windows/WindowTitlebarView";
import type { WindowTitlebarDocument, WindowTitlebarHost } from "../../../src/NSE/Windows/windowTitlebarContext";
import { NSEToolbarController } from "../../../src/NSE/Toolbars/NSEToolbarController";
import { NSEToolbarItem } from "../../../src/NSE/Toolbars/NSEToolbar";
import { NSEWindowFrameView } from "../../../src/NSE/Application/NSEWindowFrameView";
import { ToolbarView } from "../../../src/NSE/Toolbars/ToolbarView";
import { NSEUserDefaultsController } from "../../../src/NSE/Controllers";
import { nseUnowned } from "../../../src/NSE/Controllers/ownership";
import type { ToolbarPreferences, ToolbarRuntimePort } from "../../../src/NSE/Toolbars/toolbarTypes";
import { NSEWindowController, type NSEWindowToolbarStyle } from "../../../src/NSE/Application/NSEWindowController";
import { useNSEWindowTitlebarDocument } from "../../../src/SynCloudOS/AppHosting/windowAccessories";
import { defaultsFrom } from "../../fixtures/userDefaults";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import "../../../src/NSE/public/styles.css";
// @ts-expect-error The fixture Vite plugin provides this virtual module.
import { themes } from "virtual:window-titlebar-layout/themes";

const params = new URLSearchParams(location.search);
const toolbarStyle = (params.get("style") ?? "unified") as NSEWindowToolbarStyle;
const trackingEnabled = params.has("tracking") && params.get("tracking") !== "before";
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
document.documentElement.dataset.appearance = scheme;
document.documentElement.style.colorScheme = scheme;
document.documentElement.style.background = scheme === "dark" ? "#20252c" : "#e7ebef";
const actions: string[] = [];
const titlebarAppearance = new NSEAppearance({ theme: themes["com.example.titlebar-blue"] });
Object.assign(window, { titlebarLayoutRequests: actions });
const menuRuntime: ToolbarRuntimePort = { signal: new AbortController().signal, commands: {
  getPresentationGeneration: () => ({ registryGeneration: 1, responderGeneration: 1 }),
  validateMany: async requests => new Map(requests.map(request => [request.key, { commandId: request.commandId, responderId: "layout", title: request.commandId, enabled: request.commandId !== "redo", denied: false, hidden: false, state: request.commandId === "sidebar" ? "on" as const : "off" as const, stale: false }])),
  prepareDispatch: async commandId => { actions.push(commandId); return { status: "cancelled", reason: "The semantic fixture records admission requests only." }; },
  dispatch: async commandId => ({ status: "cancelled", commandId, operationId: "layout", reason: "fixture" }),
} };
function FixtureMenuBar() {
  const [menu] = useState(() => new NSEMenu({ owner: nseUnowned, runtime: menuRuntime,
    [nseMenuModel]: { id: "titlebar-menu", label: "Window Lab", entries: [
      { kind: "submenu", id: "application", label: "Window Lab", entries: [
        { kind: "command", id: "about", commandId: "about", labelOverride: "About Window Lab" },
        { kind: "separator", id: "application-separator" },
        { kind: "command", id: "preferences", commandId: "preferences", labelOverride: "Preferences…" },
        { kind: "command", id: "quit", commandId: "quit", labelOverride: "Quit Window Lab" },
      ] },
      { kind: "submenu", id: "file", label: "File", entries: [
        { kind: "command", id: "new", commandId: "new", labelOverride: "New Document" },
        { kind: "command", id: "close", commandId: "close", labelOverride: "Close Window" },
      ] },
      { kind: "submenu", id: "edit", label: "Edit", entries: [
        { kind: "command", id: "undo", commandId: "undo", labelOverride: "Undo" },
        { kind: "command", id: "redo", commandId: "redo", labelOverride: "Redo" },
      ] },
      { kind: "submenu", id: "view", label: "View", entries: [
        { kind: "command", id: "sidebar", commandId: "sidebar", labelOverride: "Show Sidebar" },
      ] },
    ] },
  }));
  useEffect(() => () => menu.dispose(), [menu]);
  return <MenuRuntimeProvider port={menuRuntime}><NSEMenuBar menu={menu} overlay={{ parentResponderId: "layout" }} /></MenuRuntimeProvider>;
}
function MeasuredToolbar() {
  const node = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [controller] = useState(() => {
    const values = new Map<string, unknown>(), ids = Array.from({ length: 8 }, (_, index) => `action-${index + 1}`);
    const items = ids.map((id, index) => ({ kind: "command" as const, id, commandId: id, label: `Action ${index + 1}`, paletteLabel: `Action ${index + 1}`, icon: <span>{index + 1}</span>, minimumWidth: 32, idealWidth: 32 }));
    const configurationIds = trackingEnabled ? ["sidebarTrackingSeparator", ...ids] : ids;
    const preferences = new NSEUserDefaultsController<ToolbarPreferences>({ owner: nseUnowned, namespace: "layout-toolbar", schema: {
      version: 1, defaults: { itemIds: configurationIds, displayMode: "icon-only", sizeMode: "regular" },
      fields: { itemIds: { validate: (v: unknown): v is readonly string[] => Array.isArray(v) }, displayMode: { validate: (v: unknown): v is ToolbarPreferences["displayMode"] => v === "icon-only" }, sizeMode: { validate: (v: unknown): v is ToolbarPreferences["sizeMode"] => v === "regular" } }, migrations: [],
    }, defaults: defaultsFrom({ read: key => values.get(key) ?? null, write: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } }) });
    const runtime: ToolbarRuntimePort = { signal: new AbortController().signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration: 1, responderGeneration: 1 }),
      validateMany: async requests => new Map(requests.map(request => [request.key, { commandId: request.commandId, responderId: "layout", title: request.commandId, enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }])),
      prepareDispatch: async commandId => { actions.push(commandId); return { status: "cancelled", reason: "The geometry fixture records admission requests without executing application commands." }; },
      dispatch: async commandId => ({ status: "cancelled", commandId, operationId: "layout", reason: "fixture" }),
    } };
    return new NSEToolbarController({ owner: nseUnowned, configuration: { identifier: "layout-toolbar", owner: { kind: "window", windowControllerId: "layout" }, allowedItemIds: configurationIds, defaultItemIds: configurationIds, displayMode: "icon-only", sizeMode: "regular" }, preferences, runtime,
      items: trackingEnabled ? [NSEToolbarItem.sidebarTrackingSeparator, ...items] : items,
    });
  });
  useEffect(() => () => controller.dispose(), [controller]);
  useLayoutEffect(() => {
    const element = node.current!;
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={node} style={{ minWidth: 0, flex: "1 1 auto" }}>{width > 0 ? <ToolbarView composition="configured" controller={controller} width={width} interaction={{ parentResponderId: "layout" }} /> : null}</div>;
}

function Fixture() {
  const frame = useRef<HTMLDivElement>(null);
  const [nativeRect, setNativeRect] = useState<DOMRect | null>(null);
  const [drags, setDrags] = useState(0);
  const [controller] = useState(() => {
    const value = new NSEWindowController({ styleMask: ["titled"] });
    value.window.title = "A long document title";
    value.window.subtitle = "Unsaved draft";
    value.window.isDocumentEdited = true;
    value.window.toolbarStyle = toolbarStyle;
    value.window.titlebarPresentation = params.has("floating") ? "floating" : "attached";
    if (params.has("frame")) {
      value.window.frameViewClass = NSEWindowFrameView;
      value.window.appearance = params.get("frame") === "before" ? null : titlebarAppearance;
    }
    return value;
  });
  const [titlebarDocument, setTitlebarDocument] = useState<WindowTitlebarDocument | null>(null);
  const titlebarHost = useMemo<WindowTitlebarHost>(() => ({
    setDocument: setTitlebarDocument,
    leadingAccessories: null,
    trailingAccessories: null,
  }), []);
  const [sidebarWidth, setSidebarWidth] = useState<number | undefined>(params.has("tracking") ? 200 : undefined);
  useNSEWindowTitlebarDocument(controller, titlebarHost, sidebarWidth);
  useEffect(() => () => controller.dispose(), [controller]);
  useLayoutEffect(() => {
    if (!params.has("native")) return;
    const rect = frame.current!.getBoundingClientRect();
    setNativeRect(new DOMRect(params.get("native") === "right" ? rect.right - 120 : rect.left, rect.top, 120, 70));
  }, []);
  return <div ref={frame} data-layout-fixture="" style={{ width: Number(params.get("width") ?? 900), margin: 20 }}>
    {titlebarDocument && <ViewAppearanceBoundary appearance={titlebarDocument.appearance ?? null} projectBoundary={params.has("frame")}>
      <WindowTitlebarView document={titlebarDocument}
        isKeyWindow material={params.has("cumulus") ? "cumulus" : "metal"} controls={nativeRect ? null : <button style={{ width: 50, height: 26 }}>Close</button>}
        leading={<button style={{ width: 60, height: 26 }}>Leading</button>}
        trailing={<select aria-label="Trailing accessory" style={{ width: 90, height: 26 }}><option>Trailing</option></select>}
        toolbar={<MeasuredToolbar />} nativeControlExclusion={nativeRect}
        menuBar={params.has("menu") ? <FixtureMenuBar /> : undefined}
        bottomAccessories={<div style={{ height: 23 }}>Bottom accessory</div>}
        moveHandleProps={{ onPointerDown: () => setDrags(value => value + 1) }} />
    </ViewAppearanceBoundary>}
    <output data-drag-count="">{drags}</output>
    {params.has("frame") ? <>
      <WindowTitlebarView document={{ title: "Another window", subtitle: "", documentEdited: false }} isKeyWindow />
      <button onClick={() => { controller.window.appearance = null; }}>Clear window appearance</button>
    </> : null}
    {params.has("tracking") ? <>
      <button onClick={() => setSidebarWidth(260)}>Resize sidebar</button>
      <button onClick={() => setSidebarWidth(undefined)}>Collapse sidebar</button>
      {params.has("evidence") ? <div style={{ height: 135, display: "flex", marginBlockStart: 12, background: "var(--nse-window-title-background)", border: "1px solid var(--nse-window-divider)" }}>
        <div data-fixture-sidebar="" style={{ width: sidebarWidth, boxSizing: "border-box", flex: "0 0 auto", padding: 12, borderInlineEnd: "1px solid var(--nse-window-divider)" }}>Sidebar</div>
        <div style={{ padding: 12 }}>Document</div>
      </div> : null}
    </> : null}
  </div>;
}
createRoot(document.getElementById("root")!).render(<NSEAppearanceProvider theme={atmoTheme} colourScheme={scheme}>
  <StandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width: innerWidth, height: innerHeight, reducedMotion: true })}><Fixture /></StandaloneControlHost>
</NSEAppearanceProvider>);
