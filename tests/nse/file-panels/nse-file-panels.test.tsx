/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import React, { useMemo, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { NSESavePanel, type NSEFilePanelService } from "../../../src/NSE/FilePanels";
import { createBrowserFilePanelAdapter, createFilePanelService, FilePanelReferenceError } from "../../../src/SynCloudOS/FilePanels";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(() => document.body.replaceChildren());

const workArea = Object.freeze({ width: 1200, height: 800, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const presentation = createStaticPresentationPort({ width: 1200, height: 800 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:file-panel-tests",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

function service(): NSEFilePanelService {
  return {
    open: vi.fn(async () => ({ kind: "accepted" as const, values: [] })),
    save: vi.fn(async () => ({ kind: "accepted" as const, values: [{ kind: "download-export" as const, suggestedName: "copy.txt", exists: false, sink: { kind: "download-export" as const, write: async () => ({ kind: "exported" as const, fileName: "copy.txt" }) } }] })),
    release: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("NSE file panels", () => {
  it("uses a compact sheet for save and keeps explicit confirmation in the service request", async () => {
    const fileService = service();
    const bridge = { open: vi.fn(), close: vi.fn() };
    render(
      <OverlayHarness>
        <NSESavePanel
          id="save-copy"
          open
          anchor={null}
          compact
          parentResponderId="window:editor"
          parentWindowControllerId="window:editor"
          service={fileService}
          windowBridge={bridge}
          request={{ id: "save-copy", accepts: [{ description: "Text", mimeTypes: ["text/plain"], extensions: [".txt"] }], suggestedName: "copy.txt", destination: "handle-or-download", conflictPolicy: "confirm-replace", confirmConflict: async () => "replace" }}
          onOpenChange={vi.fn()}
        />
      </OverlayHarness>,
    );
    expect((await screen.findByRole("dialog", { name: "Save file" })).getAttribute("data-nse-presentation")).toBe("sheet");
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    await waitFor(() => expect(fileService.save).toHaveBeenCalledWith(expect.objectContaining({ conflictPolicy: "confirm-replace" }), expect.any(AbortSignal)));
    expect(bridge.open).toHaveBeenCalledWith(expect.objectContaining({ role: "sheet" }));
  });

  it("bridges a selected panel destination to saveAsDocument and restores exact trigger focus", async () => {
    const saveAsDocument = vi.fn(async () => ({
      documentId: "memo-1",
      previousLocation: null,
      location: { kind: "memory" as const, namespace: "memo", key: "memo-copy" },
      version: { id: "version:1", sequence: 1, savedAt: "2026-01-01T00:00:00.000Z", etag: "one" },
    }));
    const fileService: NSEFilePanelService = {
      ...service(),
      save: vi.fn(async () => ({
        kind: "accepted" as const,
        values: [{
          kind: "download-export" as const,
          suggestedName: "memo-copy.txt",
          exists: false as const,
          sink: { kind: "download-export" as const, write: vi.fn() },
        }],
      })),
    };
    const panelBridge = { open: vi.fn(), close: vi.fn() };
    function Fixture() {
      const [open, setOpen] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      return <OverlayHarness>
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>Save document copy</button>
        <NSESavePanel
          id="save-document-copy"
          open={open}
          anchor={trigger.current}
          parentResponderId="window:editor"
          parentWindowControllerId="window:editor"
          service={fileService}
          windowBridge={panelBridge}
          request={{ id: "save-document-copy", accepts: [], suggestedName: "memo-copy.txt", destination: "handle-or-download", conflictPolicy: "fail-if-exists" }}
          documentSaveBinding={{
            documentId: "memo-1",
            documentController: { saveAsDocument },
            resolveDocumentDestination: async () => ({ location: { kind: "memory", namespace: "memo", key: "memo-copy" } }),
            createExportPayload: async () => ({ fileName: "memo-copy.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
            confirmConflict: async () => "cancel",
          }}
          onOpenChange={setOpen}
        />
      </OverlayHarness>;
    }
    render(<Fixture />);

    const trigger = screen.getByRole("button", { name: "Save document copy" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Choose destination" }));
    await waitFor(() => expect(saveAsDocument).toHaveBeenCalledWith({
      documentId: "memo-1",
      destination: { kind: "memory", namespace: "memo", key: "memo-copy" },
      conflict: { kind: "fail-if-exists" },
      signal: expect.any(AbortSignal),
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save file" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("aborts the document save bridge when its panel closes during destination resolution", async () => {
    let resolveDestination!: (value: { readonly location: { readonly kind: "memory"; readonly namespace: string; readonly key: string } }) => void;
    const destination = new Promise<{ readonly location: { readonly kind: "memory"; readonly namespace: string; readonly key: string } }>((resolve) => { resolveDestination = resolve; });
    const saveAsDocument = vi.fn();
    const fileService: NSEFilePanelService = {
      ...service(),
      save: vi.fn(async () => ({
        kind: "accepted" as const,
        values: [{
          kind: "download-export" as const,
          suggestedName: "memo-copy.txt",
          exists: false as const,
          sink: { kind: "download-export" as const, write: vi.fn() },
        }],
      })),
    };
    const panelBridge = { open: vi.fn(), close: vi.fn() };
    function Fixture() {
      const [open, setOpen] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      return <OverlayHarness>
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>Abort document copy</button>
        <NSESavePanel
          id="abort-document-copy"
          open={open}
          anchor={trigger.current}
          parentResponderId="window:editor"
          parentWindowControllerId="window:editor"
          service={fileService}
          windowBridge={panelBridge}
          request={{ id: "abort-document-copy", accepts: [], suggestedName: "memo-copy.txt", destination: "handle-or-download", conflictPolicy: "fail-if-exists" }}
          documentSaveBinding={{
            documentId: "memo-1",
            documentController: { saveAsDocument },
            resolveDocumentDestination: async () => destination,
            createExportPayload: async () => ({ fileName: "memo-copy.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
            confirmConflict: async () => "cancel",
          }}
          onOpenChange={setOpen}
        />
      </OverlayHarness>;
    }
    render(<Fixture />);

    fireEvent.click(screen.getByRole("button", { name: "Abort document copy" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose destination" }));
    await waitFor(() => expect(fileService.save).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    resolveDestination({ location: { kind: "memory", namespace: "memo", key: "memo-copy" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(saveAsDocument).not.toHaveBeenCalled();
  });

  it("keeps a save panel open for typed choose-another and strips a rejected existing target before retry", async () => {
    const repeatedSave = vi.fn()
      .mockResolvedValueOnce({ kind: "choose-another" as const })
      .mockResolvedValueOnce({ kind: "cancelled" as const });
    const fileService: NSEFilePanelService = { ...service(), save: repeatedSave };
    const panelBridge = { open: vi.fn(), close: vi.fn() };
    render(
      <OverlayHarness>
        <NSESavePanel
          id="choose-another-panel"
          open
          anchor={null}
          parentResponderId="window:editor"
          parentWindowControllerId="window:editor"
          service={fileService}
          windowBridge={panelBridge}
          request={{
            id: "choose-another-panel",
            accepts: [],
            suggestedName: "existing.txt",
            destination: "handle-or-download",
            existingTarget: { kind: "download-export", suggestedName: "existing.txt", exists: false, sink: { kind: "download-export", write: async () => ({ kind: "cancelled" as const }) } },
            conflictPolicy: "fail-if-exists",
          }}
          onOpenChange={vi.fn()}
        />
      </OverlayHarness>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Choose destination" }));
    await waitFor(() => expect(repeatedSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Save file" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Choose another destination.");
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    await waitFor(() => expect(repeatedSave).toHaveBeenCalledTimes(2));
    expect(repeatedSave.mock.calls[1]![0]).not.toHaveProperty("existingTarget");
  });


});
