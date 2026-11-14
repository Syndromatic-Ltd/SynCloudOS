import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEAppearanceProvider } from "../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../src/NSE/Appearance/atmo";
import { StandaloneControlHost } from "../../../src/NSE/Overlays";
import { NSEMenu } from "../../../src/NSE/Menus/NSEMenu";
import { NSEMenuBar } from "../../../src/NSE/Menus/NSEMenuBar";
import { nseMenuModel } from "../../../src/NSE/Menus/menuTypes";
import { MenuRuntimeProvider } from "../../../src/NSE/Menus/menuRuntimeContext";
import { WindowTitlebarView } from "../../../src/NSE/Windows/WindowTitlebarView";
import { NSEToolbarController } from "../../../src/NSE/Toolbars/NSEToolbarController";
import { ToolbarView } from "../../../src/NSE/Toolbars/ToolbarView";
import { NSEUserDefaultsController } from "../../../src/NSE/Controllers";
import { nseUnowned } from "../../../src/NSE/Controllers/ownership";
import type { ToolbarPreferences, ToolbarRuntimePort } from "../../../src/NSE/Toolbars/toolbarTypes";
import type { NSEWindowToolbarStyle } from "../../../src/NSE/Application/NSEWindowController";
import { defaultsFrom } from "../../fixtures/userDefaults";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import "../../../src/NSE/public/styles.css";

const params = new URLSearchParams(location.search);
const toolbarStyle = (params.get("style") ?? "unified") as NSEWindowToolbarStyle;
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
document.documentElement.dataset.appearance = scheme;
document.documentElement.style.colorScheme = scheme;
document.documentElement.style.background = scheme === "dark" ? "#20252c" : "#e7ebef";
const actions: string[] = [];
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
    const preferences = new NSEUserDefaultsController<ToolbarPreferences>({ owner: nseUnowned, namespace: "layout-toolbar", schema: {
      version: 1, defaults: { itemIds: ids, displayMode: "icon-only", sizeMode: "regular" },
      fields: { itemIds: { validate: (v: unknown): v is readonly string[] => Array.isArray(v) }, displayMode: { validate: (v: unknown): v is ToolbarPreferences["displayMode"] => v === "icon-only" }, sizeMode: { validate: (v: unknown): v is ToolbarPreferences["sizeMode"] => v === "regular" } }, migrations: [],
    }, defaults: defaultsFrom({ read: key => values.get(key) ?? null, write: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } }) });
    const runtime: ToolbarRuntimePort = { signal: new AbortController().signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration: 1, responderGeneration: 1 }),
      validateMany: async requests => new Map(requests.map(request => [request.key, { commandId: request.commandId, responderId: "layout", title: request.commandId, enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }])),
      prepareDispatch: async commandId => { actions.push(commandId); return { status: "cancelled", reason: "The geometry fixture records admission requests without executing application commands." }; },
      dispatch: async commandId => ({ status: "cancelled", commandId, operationId: "layout", reason: "fixture" }),
    } };
    return new NSEToolbarController({ owner: nseUnowned, configuration: { identifier: "layout-toolbar", owner: { kind: "window", windowControllerId: "layout" }, allowedItemIds: ids, defaultItemIds: ids, displayMode: "icon-only", sizeMode: "regular" }, preferences, runtime,
      items: ids.map((id, index) => ({ kind: "command", id, commandId: id, label: `Action ${index + 1}`, paletteLabel: `Action ${index + 1}`, icon: <span>{index + 1}</span>, minimumWidth: 32, idealWidth: 32 })),
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
  useLayoutEffect(() => {
    if (!params.has("native")) return;
    const rect = frame.current!.getBoundingClientRect();
    setNativeRect(new DOMRect(params.get("native") === "right" ? rect.right - 120 : rect.left, rect.top, 120, 70));
  }, []);
  return <div ref={frame} data-layout-fixture="" style={{ width: Number(params.get("width") ?? 900), margin: 20 }}>
    <WindowTitlebarView document={{ title: "A long document title", subtitle: "Unsaved draft", documentEdited: true, toolbarStyle, hasToolbar: true, titlebarPresentation: params.has("floating") ? "floating" : "attached" }}
      isKeyWindow mode={scheme} material={params.has("cumulus") ? "cumulus" : "metal"} controls={nativeRect ? null : <button style={{ width: 50, height: 26 }}>Close</button>}
      leading={<button style={{ width: 60, height: 26 }}>Leading</button>}
      trailing={<select aria-label="Trailing accessory" style={{ width: 90, height: 26 }}><option>Trailing</option></select>}
      toolbar={<MeasuredToolbar />} nativeControlExclusion={nativeRect}
      menuBar={params.has("menu") ? <FixtureMenuBar /> : undefined}
      bottomAccessories={<div style={{ height: 23 }}>Bottom accessory</div>}
      moveHandleProps={{ onPointerDown: () => setDrags(value => value + 1) }} />
    <output data-drag-count="">{drags}</output>
  </div>;
}
createRoot(document.getElementById("root")!).render(<NSEAppearanceProvider theme={atmoTheme} colourScheme={scheme}>
  <StandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width: innerWidth, height: innerHeight, reducedMotion: true })}><Fixture /></StandaloneControlHost>
</NSEAppearanceProvider>);
