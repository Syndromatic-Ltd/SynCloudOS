// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEOpenPanel } from "../../src/NSE/FilePanels/NSEOpenPanel";
import { OpenPanelWindowHost } from "../../src/SynCloudOS/AppHosting/openPanelHosting";
import { OpenPanelApplicationHost } from "../../src/SynCloudOS/AppHosting/openPanelHosting";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { WindowSheetHostContext, useNSEWindowSheetHost } from "../../src/SynCloudOS/AppHosting/windowChrome";
import { WindowSurfaceBridgeProvider } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { createOpenPanelFileSystem, registerOpenPanelFileSystem } from "../../src/SynCloudOS/FilePanels/OpenPanelFileSystem";
import type { NSEWindow } from "../../src/NSE/Application/NSEWindowController";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { resolveNSEOpenPanelHost } from "../../src/NSE/FilePanels/openPanelHost";
afterEach(cleanup);

it.each([[false, false, false, false], [true, false, false, false], [false, true, false, false], [true, true, false, false], [false, false, true, false], [true, false, true, false], [true, false, true, true]])("owns Open lifetime (compact=%s, escape=%s, immediate=%s, application=%s)", async (compact, escape, immediate, application) => {
  const bridge = { present: vi.fn(async () => "modal"), dismiss: vi.fn(async () => ({ outcome: "closed" as const })) };
  const filePanels = { getStatus: () => ({ open: { activation: "active" } }) };
  registerOpenPanelFileSystem(filePanels, createOpenPanelFileSystem({ isSecureContext: () => true, supportsDirectoryPicker: () => false, supportsApplicationStorage: () => false, focusedElement: () => document.activeElement as HTMLElement } as any, "org.test.editor"));
  const value = { filePanels, signal: new AbortController().signal, images: {}, responderId: "editor", windows: { getSnapshot: () => ({ current: { isKey: true }, surface: "window" }) }, presentation: { getSnapshot: () => ({ horizontalSizeClass: compact ? "compact" : "regular", contentBounds: { x: 0, y: 0, width: compact ? 390 : 1000, height: compact ? 844 : 720 } }) } } as any;
  const window = { id: "editor:1", isKey: true, frame: { x: 0, y: 0, width: 1000, height: 720 } } as NSEWindow;
  const panel = new NSEOpenPanel(); panel.mediaSources = [{ id: "pictures", label: "Gallery Pictures", query: async () => ({ items: [], nextCursor: null }) }];
  let response!: Promise<number>;
  function Parent() {
    const [attached, setAttached] = useState(false);
    const sheets = useNSEWindowSheetHost(setAttached);
    return <div><WindowSheetHostContext.Provider value={sheets.host}><OpenPanelWindowHost window={window}>
      <button onClick={() => { response = application ? panel.begin() : panel.beginSheetModal(window); if (immediate) panel.cancel(); }}>Import…</button>
    </OpenPanelWindowHost></WindowSheetHostContext.Provider><div ref={sheets.layerRef} className="nse-window-sheet-layer" data-sheet-attached={attached} /></div>;
  }
  render(<StandaloneControlHost document={document} window={globalThis.window} presentation={createStaticPresentationPort({ width: compact ? 390 : 1000, height: compact ? 844 : 720 })}>
    <WindowSurfaceBridgeProvider bridge={bridge}><SynWareProvider value={value}><OpenPanelApplicationHost value={value}><Parent /></OpenPanelApplicationHost></SynWareProvider></WindowSurfaceBridgeProvider></StandaloneControlHost>);
  const trigger = screen.getByRole("button", { name: "Import…" }); trigger.focus();
  if (immediate) {
    const host = resolveNSEOpenPanelHost(application ? null : window);
    const closed = vi.fn();
    await act(async () => {
      await host.bridge.present({ id: "immediate-panel", title: "Open", role: application ? "modal" : "sheet", parentWindowControllerId: application ? null : window.id,
        parentResponderId: "editor", anchor: trigger, bounds: { x: 0, y: 0, width: 390, height: 640 }, onDidClose: closed }, <span>Panel contents</span>);
      await expect(host.bridge.dismiss("immediate-panel")).resolves.toEqual({ outcome: "closed" });
    });
    expect(screen.queryByRole("dialog", { name: "Open" })).toBeNull();
    expect(bridge.dismiss).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
    return;
  }
  fireEvent.click(trigger);
  const sheet = await screen.findByRole("dialog", { name: "Open" });
  if (compact) {
    expect(sheet.getAttribute("data-nse-presentation")).toBe("sheet");
    expect(sheet.classList.contains("nse-overlay-popup--menu")).toBe(true);
    expect(document.querySelector('.nse-overlay-popup-backdrop:not([hidden])')).toBeTruthy();
  } else {
    expect(sheet.closest(".nse-window-sheet-layer")).toBeTruthy();
    await waitFor(() => expect(sheet.closest(".nse-window-sheet-layer")!.getAttribute("data-sheet-attached")).toBe("true"));
  }
  expect(bridge.present).not.toHaveBeenCalled();
  await act(async () => { if (escape) fireEvent.keyDown(document.body, { key: "Escape" }); else fireEvent.click(screen.getByRole("button", { name: "Cancel" })); });
  await expect(response).resolves.toBe(0); expect(document.activeElement).toBe(trigger);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
