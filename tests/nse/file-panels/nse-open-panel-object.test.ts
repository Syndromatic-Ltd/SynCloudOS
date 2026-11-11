import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOpenPanel } from "../../../src/NSE/FilePanels/NSEOpenPanel";
import { registerNSEOpenPanelHost, type NSEOpenPanelHost } from "../../../src/NSE/FilePanels/openPanelHost";
import { NSEModalResponse } from "../../../src/NSE/Application/NSEAlert";
import type { NSEWindow } from "../../../src/NSE/Application/NSEWindowController";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(stop => stop()));
function host() {
  const result = { service: { open: vi.fn(async () => ({ kind: "cancelled" as const })), save: vi.fn(), release: vi.fn(), dispose: vi.fn() },
    signal: new AbortController().signal, responderId: "app:test", isKey: () => true, isSecureContext: () => true,
    hasTransientUserActivation: () => true, compact: () => false, frame: () => ({ x: 100, y: 80, width: 1000, height: 720 }), focusedElement: () => null,
    fileSystem: { capabilities: () => ({ folders: true, applicationStorage: false }) } as any,
    bridge: { present: vi.fn(async () => "window:panel"), dismiss: vi.fn(async () => ({ outcome: "closed" as const })) },
  } satisfies NSEOpenPanelHost;
  cleanup.push(registerNSEOpenPanelHost(result)); return result;
}
describe("NSEOpenPanel object", () => {
  it("has AppKit defaults and begins application-modally with empty urls", async () => {
    const h = host(); const panel = new NSEOpenPanel();
    expect(panel.canChooseFiles).toBe(true); expect(panel.canChooseDirectories).toBe(false);
    expect(panel.usesSystemFileChooser).toBe(false); expect(panel.urls).toEqual([]);
    const pending = panel.begin();
    expect(h.bridge.present).toHaveBeenCalledWith(expect.objectContaining({ role: "modal", parentWindowControllerId: null }), expect.anything());
    panel.cancel(); await expect(pending).resolves.toBe(NSEModalResponse.cancel);
  });
  it("attaches a desktop sheet to the requested parent and ends when the parent closes", async () => {
    const h = host(); const parent = { id: "editor:1" } as NSEWindow;
    cleanup.push(registerNSEOpenPanelHost(h, parent));
    const panel = new NSEOpenPanel(); const pending = panel.beginSheetModal(parent);
    expect(h.bridge.present).toHaveBeenCalledWith(expect.objectContaining({ role: "sheet", parentWindowControllerId: "editor:1" }), expect.anything());
    h.bridge.present.mock.calls[0]![0].onDidClose!();
    await expect(pending).resolves.toBe(NSEModalResponse.cancel);
  });
  it("opts into the system chooser synchronously and retains file-reference results in urls", async () => {
    const h = host(); const reference = { kind: "ephemeral-file", name: "sample.txt" } as any;
    h.service.open.mockResolvedValue({ kind: "accepted", values: [reference] } as any);
    const panel = new NSEOpenPanel(); panel.usesSystemFileChooser = true; panel.allowedContentTypes = [".txt"];
    const pending = panel.runModal();
    expect(h.service.open).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toBe(NSEModalResponse.OK); expect(panel.urls).toEqual([reference]); expect(h.bridge.present).not.toHaveBeenCalled();
  });
  it("falls back when insecure or nothing is available and never waits for later activation", async () => {
    const h = host(); h.isSecureContext = () => false;
    await new NSEOpenPanel().runModal(); expect(h.service.open).toHaveBeenCalledTimes(1);
    h.hasTransientUserActivation = () => false;
    const panel = new NSEOpenPanel(); await expect(panel.runModal()).resolves.toBe(NSEModalResponse.cancel);
    expect(h.service.open).toHaveBeenCalledTimes(1); expect(panel.result.kind).toBe("denied");
  });
  it("restores focus through its host after the modal scope is removed", async () => {
    const h = host(); const anchor = { isConnected: true, focus: vi.fn() } as any;
    h.focusedElement = () => anchor;
    const restoreFocus = vi.fn(); Object.assign(h, { restoreFocus });
    const panel = new NSEOpenPanel(); const response = panel.begin(); panel.cancel();
    await response; await Promise.resolve();
    expect(restoreFocus).toHaveBeenCalledWith(anchor); expect(anchor.focus).not.toHaveBeenCalled();
  });
});
