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

import { describe, expect, it, vi } from "vitest";
import {
  createFileMediaProvider,
  createMediaPanelService,
  mergeMediaPanelItems,
  MediaPanelProviderError,
  type MediaPanelItem,
  type MediaPanelProvider,
} from "../../src/SynCloudOS/MediaPanels";

function item(providerId: string, id: string, kind: MediaPanelItem["kind"] = "image"): MediaPanelItem {
  return { id, providerId, kind, name: `${id}.${kind}`, mimeType: `${kind}/test`, source: `https://assets.test/${id}` };
}

function query(overrides: Partial<import("../../src/SynCloudOS/MediaPanels").MediaPanelQuery> = {}) {
  return {
    id: "media-picker",
    providerId: "stock",
    search: "",
    kinds: ["image", "video", "audio"] as const,
    cursor: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe("MediaPanelService", () => {
  it("does not merge distinct opaque provider and item tuples containing NUL", () => {
    const first = item("a\0b", "c");
    const second = item("a", "b\0c");
    expect(mergeMediaPanelItems([], [first, second]).items).toEqual([first, second]);
  });
  it("maps a malformed page and a throwing cleanup to a typed result without escaping provider errors", async () => {
    const release = vi.fn(() => { throw new Error("release leaked a private provider path"); });
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: vi.fn(async () => ({ items: [null] as never, nextCursor: null })),
      release,
    };
    const service = createMediaPanelService([provider]);

    await expect(service.query(query({ id: "malformed-page" }))).resolves.toEqual({
      kind: "error",
      message: "The media provider could not complete the request.",
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("detaches stored pages before best-effort release so clear and dispose never release twice", async () => {
    const release = vi.fn(() => { throw new Error("cleanup failed"); });
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async () => ({ items: [item("stock", "leased")], nextCursor: null }),
      release,
    };
    const service = createMediaPanelService([provider]);
    await service.query(query({ id: "throwing-release" }));

    expect(() => service.clear("throwing-release")).not.toThrow();
    expect(() => service.clear("throwing-release")).not.toThrow();
    expect(() => service.dispose()).not.toThrow();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("enforces activation-required providers and rejects a repeated no-progress cursor", async () => {
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      requiresUserActivation: true,
      query: vi.fn(async (request) => ({
        items: [item("stock", request.cursor === null ? "first" : "second")],
        nextCursor: "same-cursor",
      })),
    };
    const service = createMediaPanelService([provider]);

    await expect(service.query(query({ id: "activation" }))).resolves.toMatchObject({ kind: "interrupted" });
    expect(provider.query).not.toHaveBeenCalled();
    const first = await service.query(query({ id: "cursor-loop", userInitiated: true }));
    if (first.kind !== "accepted") throw new Error("expected first activated page");
    await expect(service.query(query({ id: "cursor-loop", cursor: first.nextCursor, userInitiated: true }))).resolves.toMatchObject({ kind: "error" });
  });

  it("rejects a multi-step cursor cycle and releases the rejected page", async () => {
    const release = vi.fn();
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: vi.fn(async (request) => {
        if (request.cursor === null) return { items: [item("stock", "first")], nextCursor: "A" };
        if (request.cursor === "A") return { items: [item("stock", "second")], nextCursor: "B" };
        return { items: [item("stock", "cycle")], nextCursor: "A" };
      }),
      release,
    };
    const service = createMediaPanelService([provider]);
    const first = await service.query(query({ id: "long-cycle" }));
    if (first.kind !== "accepted") throw new Error("expected first page");
    const second = await service.query(query({ id: "long-cycle", cursor: first.nextCursor }));
    if (second.kind !== "accepted") throw new Error("expected second page");

    await expect(service.query(query({ id: "long-cycle", cursor: second.nextCursor }))).resolves.toEqual({
      kind: "error",
      message: "The media provider returned a cursor without making progress.",
    });
    expect(release).toHaveBeenCalledWith([expect.objectContaining({ id: "cycle" })]);
  });

  it("rejects accessor-backed provider items without executing accessors and releases through the actual provider owner", async () => {
    let providerIdReads = 0;
    const raw = {
      id: "mutable",
      kind: "image",
      name: "mutable.png",
      mimeType: "image/png",
      source: "https://assets.test/mutable",
    } as Record<string, unknown>;
    Object.defineProperty(raw, "providerId", {
      enumerable: true,
      get() {
        providerIdReads += 1;
        return providerIdReads === 1 ? "stock" : "foreign";
      },
    });
    const release = vi.fn();
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async () => ({ items: [raw as unknown as MediaPanelItem], nextCursor: null }),
      release,
    };
    const service = createMediaPanelService([provider]);

    const result = await service.query(query({ id: "mutable-item" }));

    expect(result).toEqual({ kind: "error", message: "The media provider could not complete the request." });
    expect(providerIdReads).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith([raw]);
  });

  it("deduplicates duplicate file references before leasing so the retained item stays live until clear", async () => {
    const reference = {
      kind: "ephemeral-file" as const,
      id: "files:duplicate",
      name: "duplicate.png",
      issuedByRequestId: "media:files:duplicate-reference",
      capabilities: ["read"] as const,
      released: false,
      release: vi.fn(),
      file: new File(["image"], "duplicate.png", { type: "image/png" }),
      mediaType: "image/png",
      size: 5,
      lastModified: 1,
      lifetime: "runtime-memory" as const,
      permission: "granted" as const,
      read: vi.fn(async () => new File(["image"], "duplicate.png", { type: "image/png" })),
    };
    const filePanelService = {
      open: vi.fn(async () => ({ kind: "accepted" as const, values: [reference, reference] })),
      release: vi.fn(),
    };
    const files = createFileMediaProvider({ id: "files", label: "Files", filePanelService });
    const service = createMediaPanelService([files]);

    await expect(service.query(query({ id: "duplicate-reference", providerId: "files", userInitiated: true }))).resolves.toMatchObject({
      kind: "accepted",
      items: [expect.objectContaining({ fileReference: reference })],
    });
    expect(filePanelService.release).not.toHaveBeenCalled();
    service.clear("duplicate-reference");
    expect(filePanelService.release).toHaveBeenCalledTimes(1);
    expect(filePanelService.release).toHaveBeenCalledWith(reference, "caller-finished");
  });

  it("does not release a distinct wrapper that shares the retained file resource identity", async () => {
    let sharedReleased = false;
    const makeReference = (suffix: string) => ({
      kind: "ephemeral-file" as const,
      id: "files:shared-resource",
      name: "shared.png",
      issuedByRequestId: `media:files:shared-${suffix}`,
      capabilities: ["read"] as const,
      get released() { return sharedReleased; },
      release: vi.fn(() => { sharedReleased = true; }),
      file: new File(["image"], "shared.png", { type: "image/png" }),
      mediaType: "image/png",
      size: 5,
      lastModified: 1,
      lifetime: "runtime-memory" as const,
      permission: "granted" as const,
      read: vi.fn(async () => new File(["image"], "shared.png", { type: "image/png" })),
    });
    const firstReference = makeReference("first");
    const duplicateWrapper = makeReference("duplicate");
    const filePanelService = {
      open: vi.fn(async () => ({ kind: "accepted" as const, values: [firstReference, duplicateWrapper] })),
      release: vi.fn((reference: typeof firstReference) => reference.release("caller-finished")),
    };
    const files = createFileMediaProvider({ id: "files", label: "Files", filePanelService });
    const service = createMediaPanelService([files]);

    await expect(service.query(query({ id: "shared-wrapper", providerId: "files", userInitiated: true }))).resolves.toMatchObject({
      kind: "accepted",
      items: [expect.objectContaining({ id: "files:shared-resource", fileReference: firstReference })],
    });
    expect(sharedReleased).toBe(false);
    expect(filePanelService.release).not.toHaveBeenCalled();

    service.clear("shared-wrapper");
    expect(sharedReleased).toBe(true);
    expect(filePanelService.release).toHaveBeenCalledTimes(1);
    expect(filePanelService.release).toHaveBeenCalledWith(firstReference, "caller-finished");
  });

  it("preserves immutable provider ordering and forwards media kind filters", async () => {
    const first: MediaPanelProvider = {
      id: "files",
      label: "Files",
      query: vi.fn(async () => ({ items: [], nextCursor: null })),
    };
    const stock: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: vi.fn(async () => ({ items: [item("stock", "orchid")], nextCursor: null })),
    };
    const service = createMediaPanelService([first, stock]);

    expect(service.providers.map((provider) => provider.id)).toEqual(["files", "stock"]);
    expect(Object.isFrozen(service.providers)).toBe(true);
    const result = await service.query(query({ kinds: ["image"] }));
    expect(result).toEqual({
      kind: "accepted",
      providerId: "stock",
      items: [expect.objectContaining({ id: "orchid", kind: "image" })],
      nextCursor: null,
    });
    expect(stock.query).toHaveBeenCalledWith(expect.objectContaining({ kinds: ["image"], cursor: null }), expect.any(AbortSignal));
  });

  it("keeps cursors provider-scoped and stably deduplicates paginated items", async () => {
    const stock: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: vi.fn(async (request) => request.cursor === null
        ? { items: [item("stock", "first"), item("stock", "duplicate")], nextCursor: "stock:page-2" }
        : { items: [item("stock", "duplicate"), item("stock", "second")], nextCursor: null }),
    };
    const service = createMediaPanelService([stock]);
    const first = await service.query(query());
    if (first.kind !== "accepted") throw new Error("expected first page");
    const second = await service.query(query({ cursor: first.nextCursor }));

    expect(second).toEqual({
      kind: "accepted",
      providerId: "stock",
      items: [
        expect.objectContaining({ id: "first" }),
        expect.objectContaining({ id: "duplicate" }),
        expect.objectContaining({ id: "second" }),
      ],
      nextCursor: null,
    });
    await expect(service.query(query({ providerId: "missing", cursor: "stock:page-2" }))).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("keeps equal opaque cursor values isolated across two available providers", async () => {
    const stock: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async (request) => request.cursor === null
        ? { items: [item("stock", "stock-first")], nextCursor: "opaque:2" }
        : { items: [item("stock", "stock-second")], nextCursor: null },
    };
    const local: MediaPanelProvider = {
      id: "local",
      label: "Local",
      query: async (request) => request.cursor === null
        ? { items: [item("local", "local-first")], nextCursor: "opaque:2" }
        : { items: [item("local", "local-second")], nextCursor: null },
    };
    const service = createMediaPanelService([stock, local]);

    const stockFirst = await service.query(query({ id: "provider-cursors", providerId: "stock" }));
    const localFirst = await service.query(query({ id: "provider-cursors", providerId: "local" }));
    if (stockFirst.kind !== "accepted" || localFirst.kind !== "accepted") throw new Error("expected initial provider pages");
    await expect(service.query(query({ id: "provider-cursors", providerId: "stock", cursor: stockFirst.nextCursor }))).resolves.toMatchObject({
      kind: "accepted",
      items: [expect.objectContaining({ id: "stock-first" }), expect.objectContaining({ id: "stock-second" })],
    });
    await expect(service.query(query({ id: "provider-cursors", providerId: "local", cursor: localFirst.nextCursor }))).resolves.toMatchObject({
      kind: "accepted",
      items: [expect.objectContaining({ id: "local-first" }), expect.objectContaining({ id: "local-second" })],
    });
  });

  it("aborts replacement work and fences a late provider page", async () => {
    const pending: Array<ReturnType<typeof deferred<{ readonly items: readonly MediaPanelItem[]; readonly nextCursor: string | null }>>> = [];
    const release = vi.fn();
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: vi.fn(() => {
        const page = deferred<{ readonly items: readonly MediaPanelItem[]; readonly nextCursor: string | null }>();
        pending.push(page);
        return page.promise;
      }),
      release,
    };
    const service = createMediaPanelService([provider]);
    const first = service.query(query({ id: "replace" }));
    const second = service.query(query({ id: "replace" }));
    const late = item("stock", "late");
    pending[0]!.resolve({ items: [late], nextCursor: null });
    pending[1]!.resolve({ items: [item("stock", "current")], nextCursor: null });

    await expect(first).resolves.toMatchObject({ kind: "interrupted" });
    await expect(second).resolves.toMatchObject({ kind: "accepted", items: [expect.objectContaining({ id: "current" })] });
    expect(release).toHaveBeenCalledWith([late]);
  });

  it("releases invalid and duplicate provider items deterministically without replacing stable page identity", async () => {
    const release = vi.fn();
    const invalid = item("foreign", "bad");
    const invalidProvider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async () => ({ items: [invalid], nextCursor: null }),
      release,
    };
    const invalidService = createMediaPanelService([invalidProvider]);
    await expect(invalidService.query(query())).resolves.toEqual({ kind: "error", message: "The media provider could not complete the request." });
    expect(release).toHaveBeenCalledWith([invalid]);

    const duplicate = item("stock", "repeat");
    const repeated = item("stock", "repeat");
    const paginationRelease = vi.fn();
    const paged: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async (request) => request.cursor === null
        ? { items: [duplicate], nextCursor: "page-2" }
        : { items: [repeated], nextCursor: null },
      release: paginationRelease,
    };
    const pagedService = createMediaPanelService([paged]);
    const first = await pagedService.query(query({ id: "dedup" }));
    if (first.kind !== "accepted") throw new Error("expected page one");
    await expect(pagedService.query(query({ id: "dedup", cursor: first.nextCursor }))).resolves.toMatchObject({ kind: "accepted", items: [duplicate] });
    expect(paginationRelease).toHaveBeenCalledWith([repeated]);
  });

  it("does not release a retained media lease when a provider repeats its exact item object", async () => {
    const repeatedObject = item("stock", "same-object");
    const release = vi.fn();
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async () => ({ items: [repeatedObject, repeatedObject], nextCursor: null }),
      release,
    };
    const service = createMediaPanelService([provider]);

    await expect(service.query(query({ id: "same-object" }))).resolves.toMatchObject({
      kind: "accepted",
      items: [repeatedObject],
    });
    expect(release).not.toHaveBeenCalled();
    service.clear("same-object");
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith([repeatedObject]);
  });

  it("releases one failed media lease once when a malformed provider page repeats its object", async () => {
    const malformed = item("foreign", "same-malformed");
    const release = vi.fn();
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async () => ({ items: [malformed, malformed], nextCursor: null }),
      release,
    };
    const service = createMediaPanelService([provider]);

    await expect(service.query(query({ id: "same-malformed" }))).resolves.toEqual({ kind: "error", message: "The media provider could not complete the request." });
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith([malformed]);
  });

  it("releases only the descriptor-safe prefix of rejected provider pages", async () => {
    const valid = item("stock", "valid-prefix");
    const accessorReads = vi.fn();
    const accessorItems: MediaPanelItem[] = [valid];
    Object.defineProperty(accessorItems, "1", { enumerable: true, get: () => { accessorReads(); return item("stock", "unsafe"); } });
    Object.defineProperty(accessorItems, "length", { value: 2 });
    const sparseItems: MediaPanelItem[] = [valid];
    Object.defineProperty(sparseItems, "length", { value: 3 });
    const release = vi.fn()
      .mockImplementationOnce(() => { throw new Error("cleanup failed"); });
    const pages = [
      { items: accessorItems, nextCursor: null },
      { items: sparseItems, nextCursor: null },
    ];
    const provider: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: vi.fn(async () => pages.shift()!),
      release,
    };
    const service = createMediaPanelService([provider]);

    await expect(service.query(query({ id: "accessor-prefix" }))).resolves.toMatchObject({ kind: "error" });
    await expect(service.query(query({ id: "sparse-prefix" }))).resolves.toMatchObject({ kind: "error" });
    service.clear("accessor-prefix");
    service.clear("sparse-prefix");
    service.dispose();

    expect(accessorReads).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenNthCalledWith(1, [valid]);
    expect(release).toHaveBeenNthCalledWith(2, [valid]);
  });

  it("maps denied, interrupted, and provider errors without exposing provider diagnostics", async () => {
    const denied: MediaPanelProvider = {
      id: "stock",
      label: "Stock",
      query: async () => { throw new MediaPanelProviderError("denied", "A local path must not leak"); },
    };
    const service = createMediaPanelService([denied]);
    await expect(service.query(query())).resolves.toEqual({ kind: "denied", message: "Media access was denied by the provider." });

    const controller = new AbortController();
    controller.abort();
    await expect(service.query(query({ id: "aborted" }), controller.signal)).resolves.toMatchObject({ kind: "interrupted" });

    const broken = createMediaPanelService([{
      id: "broken",
      label: "Broken",
      query: async () => { throw new Error("C:\\private\\image.png"); },
    }]);
    await expect(broken.query(query({ providerId: "broken" }))).resolves.toEqual({ kind: "error", message: "The media provider could not complete the request." });
  });

  it("converts accepted file-panel references using exact media filters and cleans object thumbnails", async () => {
    const release = vi.fn();
    const reference = {
      kind: "ephemeral-file" as const,
      id: "files:cat",
      name: "cat.png",
      issuedByRequestId: "media:files:media-picker",
      capabilities: ["read"] as const,
      released: false,
      release,
      file: new File(["image"], "cat.png", { type: "image/png" }),
      mediaType: "image/png",
      size: 5,
      lastModified: 1,
      lifetime: "runtime-memory" as const,
      permission: "granted" as const,
      read: vi.fn(async () => new File(["image"], "cat.png", { type: "image/png" })),
    };
    const filePanelService = {
      open: vi.fn(async () => ({ kind: "accepted" as const, values: [reference] })),
      save: vi.fn(),
      release: vi.fn(),
      dispose: vi.fn(),
    };
    const thumbnails = {
      createThumbnail: vi.fn(async () => "blob:cat"),
      revokeThumbnail: vi.fn(),
    };
    const files = createFileMediaProvider({ id: "files", label: "Files", filePanelService, thumbnails });
    const service = createMediaPanelService([files]);
    const result = await service.query(query({ providerId: "files", kinds: ["image"], userInitiated: true }));

    expect(result).toMatchObject({ kind: "accepted", items: [expect.objectContaining({ kind: "image", mimeType: "image/png", thumbnailUrl: "blob:cat" })] });
    expect(filePanelService.open).toHaveBeenCalledWith(expect.objectContaining({
      selection: "multiple-files",
      access: "read",
      accepts: [expect.objectContaining({ mimeTypes: expect.arrayContaining(["image/png"]) })],
    }), expect.any(AbortSignal));
    service.clear("media-picker");
    expect(thumbnails.revokeThumbnail).toHaveBeenCalledWith("blob:cat");
    expect(filePanelService.release).toHaveBeenCalledWith(reference, "caller-finished");
  });

  it("does not schedule a file picker without an explicit user action and revokes a thumbnail created before abort", async () => {
    const release = vi.fn();
    const reference = {
      kind: "ephemeral-file" as const,
      id: "files:abort",
      name: "abort.png",
      issuedByRequestId: "media:files:abort",
      capabilities: ["read"] as const,
      released: false,
      release,
      file: new File(["image"], "abort.png", { type: "image/png" }),
      mediaType: "image/png",
      size: 5,
      lastModified: 1,
      lifetime: "runtime-memory" as const,
      permission: "granted" as const,
      read: vi.fn(async () => new File(["image"], "abort.png", { type: "image/png" })),
    };
    const filePanelService = {
      open: vi.fn(async () => ({ kind: "accepted" as const, values: [reference] })),
      save: vi.fn(), release: vi.fn(), dispose: vi.fn(),
    };
    const controller = new AbortController();
    const thumbnails = {
      createThumbnail: vi.fn(async () => { controller.abort(); return "blob:aborted"; }),
      revokeThumbnail: vi.fn(),
    };
    const files = createFileMediaProvider({ id: "files", label: "Files", filePanelService, thumbnails });
    await expect(files.query(query({ providerId: "files" }), new AbortController().signal)).rejects.toMatchObject({ kind: "interrupted" });
    expect(filePanelService.open).not.toHaveBeenCalled();
    await expect(files.query(query({ id: "abort", providerId: "files", userInitiated: true }), controller.signal)).rejects.toMatchObject({ kind: "interrupted" });
    expect(thumbnails.revokeThumbnail).toHaveBeenCalledWith("blob:aborted");
    expect(filePanelService.release).toHaveBeenCalledWith(reference, "caller-finished");
  });

  it("treats an explicit file-panel choose-another continuation as no media selection", async () => {
    const filePanelService = {
      open: vi.fn(async () => ({ kind: "choose-another" as const })),
      save: vi.fn(),
      release: vi.fn(),
      dispose: vi.fn(),
    };
    const files = createFileMediaProvider({ id: "files", label: "Files", filePanelService });
    const service = createMediaPanelService([files]);

    await expect(service.query(query({ providerId: "files", userInitiated: true }))).resolves.toEqual({ kind: "empty", providerId: "files" });
  });
});
