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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createNSEDataViewDragBinding } from "../../src/NSE/DataViews/Drag";
import { snapshotNSEDataTransfer, useNSEDragSource, useNSEDropTarget } from "../../src/NSE/Drag";

describe("NSE data-view drag bridge", () => {
  it("carries ordered ids and restores the pre-session selection after rejection", async () => {
    const restoreSelection = vi.fn();
    const cancel = vi.fn();
    const binding = createNSEDataViewDragBinding<string>({
      manager: {
        begin: vi.fn(() => ({ id: "session-1" })),
        updateDestination: vi.fn(async () => ({ operation: "copy" })),
        performDrop: vi.fn(async () => ({ accepted: false })),
        claimDrop: vi.fn(),
        cancelUnclaimed: vi.fn(() => true),
        cancel,
      } as never,
      representations: (ids) => [{ type: "application/x-syncloudos-fixture", value: [...ids] }],
      captureSelection: () => Object.freeze(["b", "a"]),
      restoreSelection,
      onValidateDrop: async () => false,
      onAcceptDrop: vi.fn(),
    });

    binding.begin(["b", "a"], { appId: "com.example.gallery", windowId: "source", responderId: "table" });
    const accepted = await binding.drop(
      { targetId: "c", insertionIndex: 2, operation: "above" },
      { appId: "com.example.publisher", windowId: "target", responderId: "collection" },
    );

    expect(accepted).toBe(false);
    expect(restoreSelection).toHaveBeenCalledWith(["b", "a"]);
    expect(cancel).toHaveBeenCalledWith("session-1", "drop rejected");
  });

  it("passes the manager commit signal to data-view acceptance", async () => {
    let accept!: (session: never, signal: AbortSignal) => Promise<boolean | void>;
    const commit = new AbortController();
    const onAcceptDrop = vi.fn(async (proposal: { signal: AbortSignal }) => {
      expect(proposal.signal).toBe(commit.signal);
    });
    const manager = {
      begin: vi.fn(() => ({ id: "session-commit" })),
      updateDestination: vi.fn(async (_id, request) => {
        accept = request.accept;
        return { operation: "copy" };
      }),
      performDrop: vi.fn(async () => {
        await accept({} as never, commit.signal);
        return { accepted: true, operation: "copy" };
      }),
      claimDrop: vi.fn(),
      cancelUnclaimed: vi.fn(() => true),
      cancel: vi.fn(),
    };
    const binding = createNSEDataViewDragBinding<string>({
      manager: manager as never,
      representations: (ids) => [{ type: "application/x-syncloudos-fixture", value: [...ids] }],
      captureSelection: () => ["a"],
      restoreSelection: vi.fn(),
      onAcceptDrop,
    });

    binding.begin(["a"], { appId: "com.example.gallery", windowId: "source", responderId: "table" });
    await expect(binding.drop(
      { targetId: "b", insertionIndex: 1 },
      { appId: "com.example.publisher", windowId: "target", responderId: "collection" },
    )).resolves.toBe(true);
    expect(onAcceptDrop).toHaveBeenCalledTimes(1);
  });

  it("rejects accessor-backed ordered ids without executing them", () => {
    const getter = vi.fn(() => "a");
    const ids = Array(1) as string[];
    Object.defineProperty(ids, "0", { enumerable: true, get: getter });
    const binding = createNSEDataViewDragBinding<string>({
      manager: { begin: vi.fn() } as never,
      representations: () => [{ type: "text/plain", value: "payload" }],
      captureSelection: () => [],
      restoreSelection: vi.fn(),
    });

    expect(() => binding.begin(ids, { appId: "com.example.gallery", windowId: "source", responderId: "table" })).toThrow(/dense|data/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it("clears and restores source ownership when target policy throws", async () => {
    const restoreSelection = vi.fn();
    const cancel = vi.fn();
    const binding = createNSEDataViewDragBinding<string>({
      manager: {
        begin: vi.fn(() => ({ id: "session-cleanup" })),
        updateDestination: vi.fn(async () => { throw new Error("policy offline"); }),
        claimDrop: vi.fn(),
        cancelUnclaimed: vi.fn(() => true),
        cancel,
      } as never,
      representations: (ids) => [{ type: "application/x-syncloudos-fixture", value: { ids } }],
      captureSelection: () => ["source"],
      restoreSelection,
    });
    binding.begin(["source"], { appId: "com.example.studio", windowId: "source", responderId: "row" });

    await expect(binding.drop(
      { targetId: "target", insertionIndex: 0 },
      { appId: "com.example.publisher", windowId: "target", responderId: "item" },
    )).rejects.toThrow("policy offline");
    expect(cancel).toHaveBeenCalledWith("session-cleanup", expect.stringMatching(/failed/i));
    expect(restoreSelection).toHaveBeenCalledWith(["source"]);
    await expect(binding.drop(
      { targetId: "target", insertionIndex: 0 },
      { appId: "com.example.publisher", windowId: "target", responderId: "item" },
    )).resolves.toBe(false);
  });

  it("cancels the exact session on owner abort and fences a late target callback", async () => {
    const owner = new AbortController();
    const cancel = vi.fn();
    let settle!: () => void;
    const binding = createNSEDataViewDragBinding<string>({
      manager: {
        begin: vi.fn(() => ({ id: "session-owner" })),
        updateDestination: vi.fn(() => new Promise((resolve) => { settle = () => resolve({ operation: "copy" }); })),
        cancel,
      } as never,
      ownerSignal: owner.signal,
      representations: () => [{ type: "text/plain", value: "source" }],
      captureSelection: () => ["source"],
      restoreSelection: vi.fn(),
    });
    binding.begin(["source"], { appId: "com.example.studio", windowId: "source", responderId: "row" });
    const update = binding.update(
      { targetId: "target", insertionIndex: 0 },
      { appId: "com.example.publisher", windowId: "target", responderId: "item" },
    );
    await Promise.resolve();
    owner.abort();
    settle();

    await expect(update).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledWith("session-owner", expect.stringMatching(/owner/i));
  });
});

describe("NSE native drag bridge", () => {
  it("does not expose native payload when canonical begin fails and cancels canonical ownership when native write fails", () => {
    const setData = vi.fn();
    const cancel = vi.fn();
    function Harness({ failBegin = false }: { readonly failBegin?: boolean }) {
      const source = useNSEDragSource({
        begin: () => {
          if (failBegin) throw new Error("canonical begin failed");
          return { representations: [{ type: "text/plain", value: "payload" }], cancel };
        },
      });
      return <button {...source}>Source</button>;
    }

    const first = render(<Harness failBegin />);
    fireEvent.dragStart(screen.getByRole("button", { name: "Source" }), {
      dataTransfer: { effectAllowed: "none", setData },
    });
    expect(setData).not.toHaveBeenCalled();
    first.unmount();

    setData.mockImplementation(() => { throw new Error("native write failed"); });
    render(<Harness />);
    fireEvent.dragStart(screen.getByRole("button", { name: "Source" }), {
      dataTransfer: { effectAllowed: "none", setData },
    });
    expect(cancel).toHaveBeenCalledWith(expect.stringMatching(/native/i));
  });

  it("releases the same source ownership on drag end, Escape, window loss and unmount", () => {
    const cancel = vi.fn();
    function Harness() {
      const source = useNSEDragSource({
        begin: () => ({ representations: [{ type: "text/plain", value: "payload" }], cancel }),
      });
      return <button {...source}>Owned source</button>;
    }
    const view = render(<Harness />);
    const source = screen.getByRole("button", { name: "Owned source" });
    const transfer = { effectAllowed: "none", setData: vi.fn() };

    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.dragEnd(source, { dataTransfer: transfer });
    expect(cancel).toHaveBeenLastCalledWith(expect.stringMatching(/ended/i));

    fireEvent.keyDown(source, { key: "d", altKey: true });
    fireEvent.keyDown(source, { key: "Escape" });
    expect(cancel).toHaveBeenLastCalledWith(expect.stringMatching(/Escape/i));

    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.blur(source, { relatedTarget: null });
    expect(cancel).toHaveBeenLastCalledWith(expect.stringMatching(/window/i));

    fireEvent.dragStart(source, { dataTransfer: transfer });
    view.unmount();
    expect(cancel).toHaveBeenLastCalledWith(expect.stringMatching(/unmounted/i));
  });

  it("snapshots strings synchronously before asynchronous policy work", () => {
    let live = true;
    const snapshot = snapshotNSEDataTransfer({
      types: ["application/x-syncloudos-fixture", "text/plain"],
      files: { length: 0 },
      getData: (type) => {
        if (!live) throw new Error("native event expired");
        return type === "text/plain" ? "fallback" : "{\"ids\":[\"a\",\"b\"]}";
      },
    });
    live = false;
    expect(snapshot).toEqual([
      { type: "application/x-syncloudos-fixture", value: { ids: ["a", "b"] } },
      { type: "text/plain", value: "fallback" },
    ]);
  });

  it("rejects malformed custom JSON, unknown MIME and all unleased files", () => {
    expect(() => snapshotNSEDataTransfer({
      types: ["application/x-syncloudos-fixture"], files: { length: 0 }, getData: () => "{bad",
    })).toThrow(/canonical JSON/i);
    expect(() => snapshotNSEDataTransfer({
      types: ["application/pdf"], files: { length: 0 }, getData: () => "pdf",
    })).toThrow(/unsupported native drag MIME/i);
    expect(() => snapshotNSEDataTransfer({
      types: ["Files"], files: { length: 1, item: () => ({ name: "ink.png", type: "image/png", size: 12 }) }, getData: () => "",
    })).toThrow(/resource lease/i);
  });

  it("rejects accessor-backed MIME arrays and invalid file metadata without executing getters", () => {
    const typeGetter = vi.fn(() => "text/plain");
    const types = Array(1) as string[];
    Object.defineProperty(types, "0", { enumerable: true, get: typeGetter });
    expect(() => snapshotNSEDataTransfer({
      types,
      files: { length: 0 },
      getData: () => "payload",
    })).toThrow(/dense|data/i);
    expect(typeGetter).not.toHaveBeenCalled();

    expect(() => snapshotNSEDataTransfer({
      types: ["Files"],
      files: { length: 1, item: () => ({ name: "payload.bin", type: "", size: 8 }) },
      getData: () => "",
    })).toThrow(/file type/i);
    expect(() => snapshotNSEDataTransfer({
      types: ["Files"],
      files: { length: 1, item: () => ({ name: "large.png", type: "image/png", size: 16 * 1024 * 1024 + 1 }) },
      getData: () => "",
    })).toThrow(/file size/i);
  });

  it("aborts pending native policy on owner unmount and never commits late", async () => {
    let settle!: (value: boolean) => void;
    let policySignal!: AbortSignal;
    const drop = vi.fn();
    function Harness() {
      const target = useNSEDropTarget({
        accept: (_types, signal) => {
          policySignal = signal;
          return new Promise<boolean>((resolve) => { settle = resolve; });
        },
        drop,
      });
      return <button {...target}>Target</button>;
    }
    const view = render(<Harness />);
    fireEvent.drop(screen.getByRole("button", { name: "Target" }), {
      dataTransfer: { types: ["text/plain"], files: { length: 0 }, getData: () => "payload" },
    });
    expect(policySignal.aborted).toBe(false);
    view.unmount();
    expect(policySignal.aborted).toBe(true);
    settle(true);
    await Promise.resolve();
    expect(drop).not.toHaveBeenCalled();
    cleanup();
  });
});
