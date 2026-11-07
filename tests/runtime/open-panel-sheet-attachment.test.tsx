// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEOpenPanel } from "../../src/NSE/FilePanels/NSEOpenPanel";
import { NSEOpenPanelWindowHost } from "../../src/SynCloudOS/AppHosting/openPanelHosting";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { NSEWindowSheetHostContext, useNSEWindowSheetHost } from "../../src/SynCloudOS/AppHosting/windowChrome";
import { NSEWindowSurfaceBridgeProvider } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { createOpenPanelFileSystem, registerOpenPanelFileSystem } from "../../src/SynCloudOS/FilePanels/OpenPanelFileSystem";
import type { NSEWindow } from "../../src/NSE/Application/NSEWindowController";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
afterEach(cleanup);

it.each([[false, false], [true, false], [false, true], [true, true]])("draws Open in its owned sheet and restores focus (compact=%s, escape=%s)", async (compact, escape) => {
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
    return <div><NSEWindowSheetHostContext.Provider value={sheets.host}><NSEOpenPanelWindowHost window={window}>
      <button onClick={() => { response = panel.beginSheetModal(window); }}>Import…</button>
    </NSEOpenPanelWindowHost></NSEWindowSheetHostContext.Provider><div ref={sheets.layerRef} className="nse-window-sheet-layer" data-sheet-attached={attached} /></div>;
  }
  render(<NSEStandaloneControlHost document={document} window={globalThis.window} presentation={createStaticPresentationPort({ width: compact ? 390 : 1000, height: compact ? 844 : 720 })}>
    <NSEWindowSurfaceBridgeProvider bridge={bridge}><SynWareProvider value={value}><Parent /></SynWareProvider></NSEWindowSurfaceBridgeProvider></NSEStandaloneControlHost>);
  const trigger = screen.getByRole("button", { name: "Import…" }); trigger.focus(); fireEvent.click(trigger);
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
