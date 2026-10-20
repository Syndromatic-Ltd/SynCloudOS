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

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GFXColour } from "../../src/FX/GraphicsFX/public";
import { parseNSEColourTransfer, serialiseNSEColourTransfer } from "../../src/NSE/Colour/Transfer";
import { NSEColourPanelProvider } from "../../src/NSE/Colour/ColourPanel/NSEColourPanelProvider";
import { NSEColourWell } from "../../src/NSE/Colour/Controls/NSEColourWell";
import { NSEArrayController, NSETreeController } from "../../src/NSE/Controllers";
import type { NSEDataViewAdapter } from "../../src/NSE/DataViews/Core";
import { NSETable } from "../../src/NSE/DataViews/Table";
import { NSECollectionView, createListCollectionLayout } from "../../src/NSE/DataViews/Collection";
import { NSEOutline } from "../../src/NSE/DataViews/Outline";
import { createNSEDataViewDragBinding } from "../../src/NSE/DataViews/Drag";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "../runtime/helpers";

afterEach(cleanup);

interface TransferItem { readonly id: string; readonly label: string }

function transferAdapter(): NSEDataViewAdapter<TransferItem, string> {
  const controller = new NSEArrayController<TransferItem, string>({
    id: "transfer-items",
    content: [{ id: "one", label: "One" }, { id: "two", label: "Two" }],
    getId: ({ id }) => id,
    selection: { mode: "multiple", allowsEmpty: true },
  });
  return { controller, idForItem: ({ id }) => id, labelForItem: ({ label }) => label };
}

function createAuthorisedTransferRuntime(
  options: Parameters<typeof createTestRuntime>[0],
  accessClass: "beta" | "team" = "beta",
) {
  const runtime = authoriseTestRuntime(createTestRuntime({
    ...options,
    initialBundles: options.initialBundles ?? [
      createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" }),
      createTestBundle({ bundleIdentifier: "com.example.publisher", route: "/publisher" }),
    ],
  }));
  if (accessClass === "team") {
    runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });
  }
  return runtime;
}

function scopedDrag(runtime: ReturnType<typeof createTestRuntime>, appId = "com.example.studio") {
  const applicationResponderId = `application:${appId}`;
  if (!runtime.responders.get(applicationResponderId)) {
    runtime.responders.register({ id: applicationResponderId, kind: "application", parentId: "workspace", scopeId: applicationResponderId });
  }
  const scope = runtime.transfers.mountApp(runtime.apps.getApp(appId)!, { responderId: applicationResponderId }).scope;
  const endpointForResponder = (responderId: string) => {
    const ownedResponderId = `${appId}:${responderId}`;
    if (!runtime.responders.get(ownedResponderId)) {
      runtime.responders.register({ id: ownedResponderId, kind: "view", parentId: applicationResponderId, scopeId: applicationResponderId });
    }
    return scope.drag.endpoint({ responderId: ownedResponderId });
  };
  return Object.freeze({
    scope,
    manager: scope.drag.manager,
    endpoint: scope.drag.endpoint(),
    endpointForResponder,
  });
}

function recordingBinding() {
  const begin = vi.fn();
  const drop = vi.fn(async (_location, _target, handlers) => {
    const proposal = {
      sessionId: "session-component",
      generation: 1,
      signal: new AbortController().signal,
      ids: ["one"],
      targetId: "one",
      insertionIndex: 0,
      operation: "on" as const,
    };
    if ((await handlers?.validate?.(proposal)) === false) return false;
    await handlers?.accept?.(proposal);
    return true;
  });
  return { binding: { begin, drop, update: vi.fn(), end: vi.fn(), cancel: vi.fn() } as never, begin, drop };
}

function nativeDataTransfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    files: { length: 0 },
    get types() { return [...values.keys()]; },
    setData: vi.fn((type: string, value: string) => { values.set(type, value); }),
    getData: vi.fn((type: string) => values.get(type) ?? ""),
  };
}

function fireNativeDragEvent(type: "dragover" | "drop", target: Element, dataTransfer: ReturnType<typeof nativeDataTransfer>, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(target, event);
}

function fireNativeDrop(target: Element, dataTransfer: ReturnType<typeof nativeDataTransfer>, clientY: number) {
  fireNativeDragEvent("drop", target, dataTransfer, clientY);
}

describe("NSE colour transfer", () => {
  it("uses one canonical serializer for pasteboard and drag paths", () => {
    const representations = serialiseNSEColourTransfer(GFXColour.parse("#336699"));
    expect(representations.map(({ type }) => type)).toEqual([
      "application/x-syncloudos-colour",
      "text/plain",
    ]);
    expect(parseNSEColourTransfer([...representations].reverse())?.toHex()).toBe("#336699");
  });

  it("uses the responder command path for typed copy and paste without changing the well host", async () => {
    const runtime = createTestRuntime({ id: "runtime:colour-transfer" });
    const write = vi.fn(async () => ({ kind: "written" as const }));
    const read = vi.fn(async () => ({
      kind: "accepted" as const,
      payload: { type: "application/x-syncloudos-colour" as const, value: "rgb(255 0 0)" },
    }));
    const change = vi.fn();
    const { container } = render(
      <SynCloudOSProvider runtime={runtime}>
        <NSEColourPanelProvider service={runtime.colourPanel} commands={runtime.commands} responderId="runtime" options={{ transferAdapter: { read, write } }}>
          <NSEColourWell
            aria-label="Transfer ink"
            defaultValue={GFXColour.parse("#336699")}
            onValueChange={change}
          />
        </NSEColourPanelProvider>
      </SynCloudOSProvider>,
    );
    const button = screen.getByRole("button", { name: "Transfer ink" });
    fireEvent.click(button);
    await runtime.commands.dispatch("colour-panel.copy");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await runtime.commands.dispatch("colour-panel.paste");
    await waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({}), "commit"));
    expect(write).toHaveBeenCalledWith(
      { type: "application/x-syncloudos-colour", value: "rgb(51 102 153)" },
      expect.any(AbortSignal),
    );
    expect(container.querySelector("[data-nse-control='colour-well'] > button")).toBe(button);
  });

  it("denies native colour drops unless the injected transfer policy authorises them", async () => {
    const runtime = createTestRuntime({ id: "runtime:colour-native-deny" });
    const change = vi.fn();
    render(<SynCloudOSProvider runtime={runtime}>
      <NSEColourPanelProvider service={runtime.colourPanel}>
        <NSEColourWell aria-label="Denied ink" defaultValue={GFXColour.parse("#000000")} onValueChange={change} />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    fireEvent.drop(screen.getByRole("button", { name: "Denied ink" }), {
      dataTransfer: {
        types: ["application/x-syncloudos-colour", "text/plain"],
        files: { length: 0 },
        getData: () => "rgb(255 0 0)",
      },
    });
    await Promise.resolve();
    expect(change).not.toHaveBeenCalled();
  });

  it("routes a permitted native colour session through one controller commit with undo, redo and recents", async () => {
    const runtime = createAuthorisedTransferRuntime({ id: "runtime:colour-native-manager" });
    const drag = scopedDrag(runtime);
    const undo = runtime.undo.create({ kind: "application", id: "colour-native-manager" });
    const targetChange = vi.fn();
    render(<SynCloudOSProvider runtime={runtime}>
      <NSEColourPanelProvider
        service={runtime.colourPanel}
        options={{ undoManager: undo }}
        drag={drag}
      >
        <NSEColourWell id="source-colour" aria-label="Source ink" defaultValue={GFXColour.parse("#336699")} />
        <NSEColourWell id="target-colour" aria-label="Target ink" defaultValue={GFXColour.parse("#000000")} onValueChange={targetChange} />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    const transfer = nativeDataTransfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "Source ink" }), { dataTransfer: transfer });
    fireNativeDrop(screen.getByRole("button", { name: "Target ink" }), transfer, 0);

    await waitFor(() => expect(screen.getByRole("button", { name: "Target ink" }).textContent).toContain("#336699"));
    expect(targetChange.mock.calls.filter(([, phase]) => phase === "commit")).toHaveLength(1);
    expect(targetChange).toHaveBeenCalledWith(expect.any(GFXColour), "commit");
    expect(runtime.colourPanel.getSnapshot().recents).toContain("rgb(51 102 153)");
    expect(undo.undoTitle).toBe("Undo Change Colour");

    await undo.undo();
    await waitFor(() => expect(screen.getByRole("button", { name: "Target ink" }).textContent).toContain("#000000"));
    await undo.redo();
    await waitFor(() => expect(screen.getByRole("button", { name: "Target ink" }).textContent).toContain("#336699"));
  });

  it("uses the same runtime manager for keyboard colour transfer and policy-gated text fallback", async () => {
    const policy = vi.fn(() => true);
    const runtime = createAuthorisedTransferRuntime(
      { id: "runtime:colour-keyboard-manager", dragAuthorisation: { authorise: policy } },
      "team",
    );
    const drag = scopedDrag(runtime);
    const changes = vi.fn();
    render(<SynCloudOSProvider runtime={runtime}>
      <NSEColourPanelProvider
        service={runtime.colourPanel}
        drag={drag}
      >
        <NSEColourWell id="keyboard-source" aria-label="Keyboard source" defaultValue={GFXColour.parse("#224466")} />
        <NSEColourWell id="keyboard-target" aria-label="Keyboard target" defaultValue={GFXColour.parse("#000000")} onValueChange={changes} />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Keyboard source" }), { key: "d", altKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Keyboard target" }), { key: "Enter", altKey: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Keyboard target" }).textContent).toContain("#224466"));

    const fallback = nativeDataTransfer();
    fallback.setData("text/plain", "#ff0000");
    fireNativeDrop(screen.getByRole("button", { name: "Keyboard target" }), fallback, 0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Keyboard target" }).textContent).toContain("#ff0000"));
    expect(policy).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ appId: "com.example.studio" }),
      representationTypes: ["text/plain"],
      capability: "transfer.same-application",
    }), expect.any(AbortSignal));
  });

  it("routes focused colour drag begin and drop through runtime commands without accepting an unfocused responder", async () => {
    const runtime = createAuthorisedTransferRuntime({ id: "runtime:colour-command-drag", dragAuthorisation: { authorise: () => true } }, "team");
    const drag = scopedDrag(runtime);
    const changes = vi.fn();
    render(<SynCloudOSProvider runtime={runtime}>
      <NSEColourPanelProvider service={runtime.colourPanel} drag={drag} commands={runtime.commands}>
        <NSEColourWell id="command-source" aria-label="Command source" defaultValue={GFXColour.parse("#224466")} />
        <NSEColourWell id="command-target" aria-label="Command target" defaultValue={GFXColour.parse("#000000")} onValueChange={changes} />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    await waitFor(() => expect(runtime.commands.inspect().registrations.filter(({ commandId }) => commandId === "nse.drag.begin")).toHaveLength(2));

    runtime.focus.requestFocus("com.example.studio:command-source:responder");
    await expect(runtime.commands.dispatch("nse.drag.begin")).resolves.toMatchObject({ status: "executed", value: true });
    runtime.focus.requestFocus("com.example.studio:command-target:responder");
    await expect(runtime.commands.dispatch("nse.drag.drop")).resolves.toMatchObject({ status: "executed", value: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Command target" }).textContent).toContain("#224466"));

    runtime.responders.register({ id: "other-drag-command-target", kind: "view", parentId: "workspace", scopeId: "other-drag-command-target" });
    runtime.focus.requestFocus("other-drag-command-target");
    await expect(runtime.commands.dispatch("nse.drag.begin")).resolves.toMatchObject({ status: "unhandled" });
    expect(runtime.drag.snapshot().active).toBeNull();
  });

  it("announces a policy-denied keyboard colour drop and leaves the session idle", async () => {
    const runtime = createTestRuntime({ id: "runtime:colour-keyboard-denied" });
    runtime.policy.registerPolicy("deny-studio", (request, decision) =>
      request.app?.bundleIdentifier === "com.example.studio" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    render(<SynCloudOSProvider runtime={runtime}>
      <NSEColourPanelProvider
        service={runtime.colourPanel}
        drag={{
          manager: runtime.drag,
          endpoint: { appId: "com.example.studio", windowId: "main", responderId: "colour-panel" },
        }}
      >
        <NSEColourWell id="denied-source" aria-label="Denied source" defaultValue={GFXColour.parse("#224466")} />
        <NSEColourWell id="denied-target" aria-label="Denied target" defaultValue={GFXColour.parse("#000000")} />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Denied source" }), { key: "d", altKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Denied target" }), { key: "Enter", altKey: true });
    await waitFor(() => expect(screen.getAllByRole("status").some((node) => /denied|failed/i.test(node.textContent ?? ""))).toBe(true));
    expect(runtime.drag.snapshot().active).toBeNull();
    expect(screen.getByRole("button", { name: "Denied target" }).textContent).toContain("#000000");
  });

  it("claims a local colour drop before delayed policy so dragend cannot replace it with native ingress", async () => {
    let releasePolicy!: (allowed: boolean) => void;
    const policyEntered = vi.fn();
    const runtime = createAuthorisedTransferRuntime({ id: "runtime:colour-drop-claim" });
    const drag = scopedDrag(runtime);
    render(<SynCloudOSProvider runtime={runtime}>
      <NSEColourPanelProvider
        service={runtime.colourPanel}
        drag={drag}
      >
        <NSEColourWell id="claimed-source" aria-label="Claimed source" defaultValue={GFXColour.parse("#224466")} />
        <NSEColourWell
          id="claimed-target"
          aria-label="Claimed target"
          defaultValue={GFXColour.parse("#000000")}
          transfer={{
            authoriseDrop: () => {
              policyEntered();
              return new Promise<boolean>((resolve) => { releasePolicy = resolve; });
            },
          }}
        />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    const source = screen.getByRole("button", { name: "Claimed source" });
    const transfer = nativeDataTransfer();
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireNativeDrop(screen.getByRole("button", { name: "Claimed target" }), transfer, 0);
    fireEvent.dragEnd(source, { dataTransfer: transfer });
    await waitFor(() => expect(policyEntered).toHaveBeenCalled());
    expect(drag.manager.snapshot().active?.source).toMatchObject({ appId: "com.example.studio" });
    releasePolicy(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Claimed target" }).textContent).toContain("#224466"));
  });

  it("keeps the manager-owned colour payload inaccessible through the app pasteboard scope", async () => {
    const first = createAuthorisedTransferRuntime({ id: "runtime:colour-payload-first" });
    const drag = scopedDrag(first);
    render(<SynCloudOSProvider runtime={first}>
      <NSEColourPanelProvider
        service={first.colourPanel}
        drag={drag}
      >
        <NSEColourWell id="owned-source" aria-label="Owned source" defaultValue={GFXColour.parse("#224466")} />
        <NSEColourWell id="owned-target" aria-label="Owned target" defaultValue={GFXColour.parse("#000000")} />
      </NSEColourPanelProvider>
    </SynCloudOSProvider>);
    const transfer = nativeDataTransfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "Owned source" }), { dataTransfer: transfer });
    await expect(drag.scope.pasteboards.drag.write(serialiseNSEColourTransfer(GFXColour.parse("#ff0000"))))
      .rejects.toMatchObject({ name: "SecurityError" });
    fireNativeDrop(screen.getByRole("button", { name: "Owned target" }), transfer, 0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Owned target" }).textContent).toContain("#224466"));
  });

  it("rejects different colour and drag runtime owners even when their textual IDs match", () => {
    const first = createTestRuntime({ id: "runtime:colour-port-same" });
    const second = createTestRuntime({ id: "runtime:colour-port-same" });
    const undo = second.undo.create({ kind: "application", id: "colour-port-second" });
    const change = vi.fn();
    const before = second.colourPanel.getSnapshot();
    expect(first.drag.ownerToken).toBe(first.colourPanel.ownerToken);
    expect(second.drag.ownerToken).toBe(second.colourPanel.ownerToken);
    expect(first.drag.ownerToken).not.toBe(second.drag.ownerToken);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(
        <NSEColourPanelProvider
          service={second.colourPanel}
          options={{ undoManager: undo }}
          drag={{
            manager: first.drag,
            endpoint: { appId: "com.example.studio", windowId: "main", responderId: "colour-panel" },
          }}
        >
          <NSEColourWell aria-label="Mismatched colour" defaultValue={GFXColour.parse("#000000")} onValueChange={change} />
        </NSEColourPanelProvider>,
      )).toThrow(/runtime/i);
    } finally {
      consoleError.mockRestore();
    }
    expect(change).not.toHaveBeenCalled();
    expect(second.colourPanel.getSnapshot()).toMatchObject({
      activeTargetId: before.activeTargetId,
      recents: before.recents,
    });
    expect(undo.canUndo).toBe(false);
    expect(undo.canRedo).toBe(false);
    expect(first.drag.snapshot().active).toBeNull();
  });
});

describe("NSE data-view transfer hosts", () => {
  it("invokes the table proposal validation and acceptance seams from keyboard drag", async () => {
    const drag = recordingBinding();
    const validate = vi.fn(() => true);
    const accept = vi.fn();
    render(<NSETable
      aria-label="Transfer table"
      adapter={transferAdapter()}
      columns={[{ id: "label", title: "Label", value: (item: TransferItem) => item.label, width: { min: 80, ideal: 120, max: 200 } }]}
      dragBinding={drag.binding}
      dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "table" }}
      onValidateDrop={validate}
      onAcceptDrop={accept}
    />);
    const grid = screen.getByRole("grid", { name: "Transfer table" });
    fireEvent.keyDown(grid, { key: "d", altKey: true });
    expect(drag.begin).toHaveBeenCalledWith(["one"], expect.objectContaining({ responderId: "table" }));
    fireEvent.keyDown(grid, { key: "Enter", altKey: true });
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-component", ids: ["one"] }));
  });

  it("routes focused table drag commands through the runtime command graph and denies read-only mutation", async () => {
    const runtime = createTestRuntime({ id: "runtime:table-command-drag" });
    runtime.responders.register({ id: "table-command-responder", kind: "view", parentId: "workspace", scopeId: "table-command-responder" });
    const drag = recordingBinding();
    const accept = vi.fn();
    const view = render(<NSETable
      aria-label="Command transfer table"
      adapter={transferAdapter()}
      columns={[{ id: "label", title: "Label", value: (item: TransferItem) => item.label, width: { min: 80, ideal: 120, max: 200 } }]}
      dragBinding={drag.binding}
      dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "table-command-responder" }}
      commands={runtime.commands}
      responderId="table-command-responder"
      onAcceptDrop={accept}
    />);
    await waitFor(() => expect(runtime.commands.inspect().registrations.some(({ commandId, responderId }) => commandId === "nse.drag.begin" && responderId === "table-command-responder")).toBe(true));
    runtime.focus.requestFocus("table-command-responder");
    await expect(runtime.commands.dispatch("nse.drag.begin")).resolves.toMatchObject({ status: "executed", value: true });
    expect(drag.begin).toHaveBeenCalledWith(["one"], expect.objectContaining({ responderId: "table-command-responder" }));
    await expect(runtime.commands.dispatch("nse.drag.drop")).resolves.toMatchObject({ status: "executed", value: true });
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));

    view.rerender(<NSETable
      aria-label="Command transfer table"
      adapter={transferAdapter()}
      columns={[{ id: "label", title: "Label", value: (item: TransferItem) => item.label, width: { min: 80, ideal: 120, max: 200 } }]}
      state={{ kind: "read-only", message: "Read only" }}
      dragBinding={drag.binding}
      dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "table-command-responder" }}
      commands={runtime.commands}
      responderId="table-command-responder"
    />);
    await expect(runtime.commands.dispatch("nse.drag.begin")).resolves.toMatchObject({ status: "disabled" });
    expect(drag.begin).toHaveBeenCalledTimes(1);
  });

  it("invokes the collection proposal validation and acceptance seams from keyboard drag", async () => {
    const drag = recordingBinding();
    const validate = vi.fn(() => true);
    const accept = vi.fn();
    render(<NSECollectionView
      aria-label="Transfer collection"
      adapter={transferAdapter()}
      layout={createListCollectionLayout(32)}
      renderItem={({ item }: { item: TransferItem }) => <span>{item.label}</span>}
      dragBinding={drag.binding}
      dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "collection" }}
      onValidateDrop={validate}
      onAcceptDrop={accept}
    />);
    const grid = screen.getByRole("grid", { name: "Transfer collection" });
    fireEvent.keyDown(grid, { key: "d", altKey: true });
    expect(drag.begin).toHaveBeenCalledWith(["one"], expect.objectContaining({ responderId: "collection" }));
    fireEvent.keyDown(grid, { key: "Enter", altKey: true });
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-component", ids: ["one"] }));
  });

  it("moves one canonical session across table and virtual collection endpoints and restores rejection selection", async () => {
    const policy = vi.fn(() => true);
    const runtime = createAuthorisedTransferRuntime(
      { id: "runtime:data-view-cross-host", dragAuthorisation: { authorise: policy } },
      "team",
    );
    const sourceDrag = scopedDrag(runtime, "com.example.studio");
    const targetDrag = scopedDrag(runtime, "com.example.publisher");
    const source = transferAdapter();
    const target = transferAdapter();
    source.controller.select(["one"]);
    const restore = vi.fn((ids: readonly string[]) => source.controller.select(ids));
    const binding = createNSEDataViewDragBinding<string>({
      manager: sourceDrag.manager,
      representations: (ids) => [{ type: "application/x-syncloudos-fixture", value: { ids } }, { type: "text/plain", value: ids.join(",") }],
      captureSelection: () => [...source.controller.getSnapshot().selection.selectedIds],
      restoreSelection: restore,
    });
    const accept = vi.fn();
    let validateAllowed = true;
    const validate = vi.fn(() => validateAllowed);
    render(<>
      <NSETable
        aria-label="Source table"
        adapter={source}
        columns={[{ id: "label", title: "Label", value: (item: TransferItem) => item.label, width: { min: 80, ideal: 120, max: 200 } }]}
        dragBinding={binding}
        dragEndpoint={sourceDrag.endpointForResponder("source-table")}
      />
      <NSECollectionView
        aria-label="Target collection"
        adapter={target}
        layout={createListCollectionLayout(32)}
        renderItem={({ item }: { item: TransferItem }) => <span>{item.label}</span>}
        dragBinding={binding}
        dragEndpoint={targetDrag.endpointForResponder("target-collection")}
        onValidateDrop={validate}
        onAcceptDrop={accept}
      />
    </>);
    const targetItem = within(screen.getByRole("grid", { name: "Target collection" })).getByRole("gridcell", { name: "Two" });
    const sourceRow = within(screen.getByRole("grid", { name: "Source table" })).getByRole("row", { name: "One" });
    targetItem.getBoundingClientRect = () => ({ top: 100, bottom: 132, height: 32, left: 0, right: 120, width: 120, x: 0, y: 100, toJSON: () => ({}) });
    const acceptedTransfer = nativeDataTransfer();
    fireEvent.dragStart(sourceRow, { dataTransfer: acceptedTransfer });
    fireNativeDragEvent("dragover", targetItem, acceptedTransfer, 131);
    await screen.findByText("Drop below target ready.");
    fireNativeDrop(targetItem, acceptedTransfer, 131);
    await waitFor(() => expect(accept).toHaveBeenCalledWith(expect.objectContaining({
      ids: ["one"], targetId: "two", insertionIndex: 2, operation: "below",
    })));
    expect(policy).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ appId: "com.example.studio", responderId: "com.example.studio:source-table" }),
      destination: expect.objectContaining({ appId: "com.example.publisher", responderId: "com.example.publisher:target-collection" }),
    }), expect.any(AbortSignal));

    validateAllowed = false;
    source.controller.select(["one"]);
    const rejectedTransfer = nativeDataTransfer();
    fireEvent.dragStart(sourceRow, { dataTransfer: rejectedTransfer });
    source.controller.select(["two"]);
    fireNativeDrop(targetItem, rejectedTransfer, 131);

    await waitFor(() => expect(validate).toHaveBeenCalledWith(expect.objectContaining({
      ids: ["one"], targetId: "two", insertionIndex: 2, operation: "below",
    })));
    expect(restore).toHaveBeenCalledWith(["one"]);
    expect([...source.controller.getSnapshot().selection.selectedIds]).toEqual(["one"]);
  });

  it("claims a browser drop synchronously while data-view validation is delayed", async () => {
    const runtime = createAuthorisedTransferRuntime({ id: "runtime:data-view-drop-claim" });
    const drag = scopedDrag(runtime);
    const source = transferAdapter();
    const target = transferAdapter();
    source.controller.select(["one"]);
    const binding = createNSEDataViewDragBinding<string>({
      manager: drag.manager,
      representations: (ids) => [{ type: "text/plain", value: ids.join(",") }],
      captureSelection: () => [...source.controller.getSnapshot().selection.selectedIds],
      restoreSelection: (ids) => source.controller.select(ids),
    });
    let releaseValidation!: (allowed: boolean) => void;
    const validationEntered = vi.fn();
    const accept = vi.fn();
    render(<>
      <NSETable
        aria-label="Claim source table"
        adapter={source}
        columns={[{ id: "label", title: "Label", value: (item: TransferItem) => item.label, width: { min: 80, ideal: 120, max: 200 } }]}
        dragBinding={binding}
        dragEndpoint={drag.endpointForResponder("source-table")}
      />
      <NSECollectionView
        aria-label="Claim target collection"
        adapter={target}
        layout={createListCollectionLayout(32)}
        renderItem={({ item }: { item: TransferItem }) => <span>{item.label}</span>}
        dragBinding={binding}
        dragEndpoint={drag.endpointForResponder("target-collection")}
        onValidateDrop={() => {
          validationEntered();
          return new Promise<boolean>((resolve) => { releaseValidation = resolve; });
        }}
        onAcceptDrop={accept}
      />
    </>);
    const sourceRow = within(screen.getByRole("grid", { name: "Claim source table" })).getByRole("row", { name: "One" });
    const targetItem = within(screen.getByRole("grid", { name: "Claim target collection" })).getByRole("gridcell", { name: "Two" });
    const transfer = nativeDataTransfer();
    fireEvent.dragStart(sourceRow, { dataTransfer: transfer });
    fireNativeDrop(targetItem, transfer, 0);
    fireEvent.dragEnd(sourceRow, { dataTransfer: transfer });
    expect(validationEntered).toHaveBeenCalledTimes(1);
    releaseValidation(true);
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
  });

  it("wires outline rows for native and keyboard proposals through the runtime manager", async () => {
    type Node = Readonly<{ id: string; label: string; children: readonly Node[] }>;
    const nodes: readonly Node[] = [
      { id: "one", label: "One", children: [] },
      { id: "two", label: "Two", children: [] },
    ];
    const controller = new NSETreeController<Node, string>({
      id: "drag-outline",
      content: nodes,
      getId: ({ id }) => id,
      getChildren: ({ children }) => children,
      withChildren: (node, children) => ({ ...node, children }),
      selection: { mode: "multiple", allowsEmpty: true },
    });
    controller.select(["one"]);
    const runtime = createAuthorisedTransferRuntime({ id: "runtime:outline-drag" });
    const drag = scopedDrag(runtime);
    const binding = createNSEDataViewDragBinding<string>({
      manager: drag.manager,
      representations: (ids) => [{ type: "text/plain", value: ids.join(",") }],
      captureSelection: () => [...controller.getSnapshot().selection.selectedIds],
      restoreSelection: (ids) => controller.select(ids),
    });
    const accept = vi.fn();
    let outlineAllowed = true;
    render(<NSEOutline
      aria-label="Transfer outline"
      controller={controller}
      idForItem={({ id }) => id}
      childrenForItem={({ children }) => children}
      labelForItem={({ label }) => label}
      dragBinding={binding}
      dragEndpoint={drag.endpointForResponder("outline")}
      onValidateDrop={() => outlineAllowed}
      onAcceptDrop={accept}
    />);
    const transfer = nativeDataTransfer();
    fireEvent.dragStart(screen.getByRole("treeitem", { name: "One" }), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole("treeitem", { name: "Two" }), { dataTransfer: transfer, clientY: 0 });
    await waitFor(() => expect(accept).toHaveBeenCalledWith(expect.objectContaining({ ids: ["one"], targetId: "two" })));

    const tree = screen.getByRole("tree", { name: "Transfer outline" });
    fireEvent.keyDown(tree, { key: "d", altKey: true });
    fireEvent.keyDown(tree, { key: "Enter", altKey: true });
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));

    outlineAllowed = false;
    controller.select(["one"]);
    const rejected = nativeDataTransfer();
    fireEvent.dragStart(screen.getByRole("treeitem", { name: "One" }), { dataTransfer: rejected });
    controller.select(["two"]);
    fireEvent.drop(screen.getByRole("treeitem", { name: "Two" }), { dataTransfer: rejected });
    await waitFor(() => expect([...controller.getSnapshot().selection.selectedIds]).toEqual(["one"]));
  });

  it.each(["read-only", "disabled", "loading", "denied", "invalid"] as const)(
    "rejects table, collection and outline drag mutation while state is %s",
    (kind) => {
      const state = kind === "read-only" ? { kind, message: "Read only" } as const
        : kind === "disabled" ? { kind, message: "Disabled" } as const
          : kind === "loading" ? { kind, message: "Loading" } as const
            : kind === "denied" ? { kind, message: "Denied" } as const
              : { kind, message: "Invalid" } as const;
      const tableDrag = recordingBinding();
      const collectionDrag = recordingBinding();
      const outlineDrag = recordingBinding();
      const tree = new NSETreeController<TransferItem, string>({
        id: `state-outline-${kind}`,
        content: [{ id: "one", label: "One" }],
        getId: ({ id }) => id,
        getChildren: () => [],
        withChildren: (item) => item,
        selection: { mode: "multiple", allowsEmpty: true },
      });
      render(<>
        <NSETable
          aria-label={`State table ${kind}`}
          adapter={transferAdapter()}
          columns={[{ id: "label", title: "Label", value: (item: TransferItem) => item.label, width: { min: 80, ideal: 120, max: 200 } }]}
          state={state}
          dragBinding={tableDrag.binding}
          dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "table" }}
        />
        <NSECollectionView
          aria-label={`State collection ${kind}`}
          adapter={transferAdapter()}
          layout={createListCollectionLayout(32)}
          renderItem={({ item }: { item: TransferItem }) => <span>{item.label}</span>}
          state={state}
          dragBinding={collectionDrag.binding}
          dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "collection" }}
        />
        <NSEOutline
          aria-label={`State outline ${kind}`}
          controller={tree}
          idForItem={({ id }) => id}
          childrenForItem={() => []}
          labelForItem={({ label }) => label}
          state={state}
          dragBinding={outlineDrag.binding}
          dragEndpoint={{ appId: "com.example.gallery", windowId: "main", responderId: "outline" }}
        />
      </>);
      for (const host of [
        screen.getByRole("grid", { name: `State table ${kind}` }),
        screen.getByRole("grid", { name: `State collection ${kind}` }),
        screen.getByRole("tree", { name: `State outline ${kind}` }),
      ]) {
        expect(host.querySelector("[draggable='true']")).toBeNull();
        fireEvent.keyDown(host, { key: "d", altKey: true });
        fireEvent.keyDown(host, { key: "Enter", altKey: true });
      }
      expect(tableDrag.begin).not.toHaveBeenCalled();
      expect(tableDrag.drop).not.toHaveBeenCalled();
      expect(collectionDrag.begin).not.toHaveBeenCalled();
      expect(collectionDrag.drop).not.toHaveBeenCalled();
      expect(outlineDrag.begin).not.toHaveBeenCalled();
      expect(outlineDrag.drop).not.toHaveBeenCalled();
    },
  );
});
