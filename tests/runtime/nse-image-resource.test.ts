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

import { IFXImageResource } from "../../src/FX/ImageFX/IFXImageResource";
function loadImageResource(service: import("../../src/SynCloudOS/Images/imageTypes").RuntimeImageService, request: import("../../src/SynCloudOS/Images/imageTypes").RuntimeImageLoadRequest) {
  const resource = service.load(request);
  return new IFXImageResource({ resource, readPixels: signal => service.readPixels(resource, signal), export: (format, signal) => service.export(resource, format, signal) });
}
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  RuntimeDecodedImageLease,
  RuntimeImageAdapter,
  RuntimeImageAdapterFactory,
  RuntimeImageDecodeRequest,
} from "../../src/SynCloudOS/Images";
import { BrowserImageAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserImageAdapter";
import type { BrowserImagePlatform } from "../../src/SynCloudOS/PlatformAdapters/browserImageAdapterTypes";
import { GFXPath, GFXGradient, GFXContext } from "../../src/FX/GraphicsFX/public";
import { GFXColour } from "../../src/FX/GraphicsFX/public";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

class RecordingImageAdapter implements RuntimeImageAdapter {
  readonly decodeRequests: RuntimeImageDecodeRequest[] = [];
  readonly released: string[] = [];
  readonly exported: string[] = [];
  readonly pending = new Map<string, { resolve(value: RuntimeDecodedImageLease): void; reject(error: unknown): void }>();
  automatic = true;
  disposed = false;

  decode(request: RuntimeImageDecodeRequest): Promise<RuntimeDecodedImageLease> {
    this.decodeRequests.push(request);
    if (!this.automatic) return new Promise((resolve, reject) => this.pending.set(request.cacheKey, { resolve, reject }));
    return Promise.resolve(this.lease(request.cacheKey, request.source.kind === "bytes" ? request.source.bytes.byteLength : 64));
  }

  lease(key: string, byteLength = 64, corsClean = true): RuntimeDecodedImageLease {
    let released = false;
    return Object.freeze({
      src: `blob:${key}`,
      intrinsicSize: Object.freeze({ width: 32, height: 16 }),
      density: 2,
      byteLength,
      corsClean,
      release: () => { if (!released) { released = true; this.released.push(key); } },
    });
  }

  export(lease: RuntimeDecodedImageLease, format: "image/png" | "image/webp", signal: AbortSignal) {
    signal.throwIfAborted();
    this.exported.push(`${lease.src}:${format}`);
    return Promise.resolve(new Uint8Array([1, 2, 3]));
  }

  dispose() { this.disposed = true; }
}

function runtimeWithImages(id: string, adapter = new RecordingImageAdapter()) {
  const environment = createTestRuntimeEnvironment();
  const factory: RuntimeImageAdapterFactory = {
    acquire: () => {
      let released = false;
      return Object.freeze({ adapter, release() { if (!released) { released = true; adapter.dispose(); } } });
    },
  };
  Object.defineProperty(environment, "images", { enumerable: true, value: factory });
  return { runtime: createTestRuntime({ id, environment, imageAuthorisation: { authorise: () => true } }), adapter };
}

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose("image test cleanup");
});

const subject = Object.freeze({ appId: "app:gallery", capability: "image.decode" as const });

describe("runtime-owned image resources", () => {
  it("reuses a subject-scoped decoded cache entry and releases it on bounded eviction", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-dedupe");
    runtimes.push(runtime);
    const request = { subject, source: { kind: "app-asset" as const, path: "/assets/logo.png" }, accessibleLabel: "Logo" };
    const first = loadImageResource(runtime.images, request);
    const second = loadImageResource(runtime.images, request);
    await Promise.all([first.ready, second.ready]);
    expect(adapter.decodeRequests).toHaveLength(1);
    expect(first.src).toBe(second.src);
    expect(first.intrinsicSize).toEqual({ width: 32, height: 16 });
    first.release();
    expect(adapter.released).toHaveLength(0);
    second.release();
    expect(adapter.released).toHaveLength(0);
    expect(runtime.images.diagnostics()).toMatchObject({ activeReferenceCount: 0, decodedEntryCount: 1 });
    const reused = loadImageResource(runtime.images, request);
    await reused.ready;
    expect(adapter.decodeRequests).toHaveLength(1);
    reused.release();
    expect(runtime.caches.prune({ reason: "memory-warning", targetWeight: 0 }).removed).toBe(1);
    expect(adapter.released).toHaveLength(1);
    expect(runtime.images.diagnostics()).toMatchObject({ activeReferenceCount: 0, decodedEntryCount: 0 });
  });

  it("rejects network-path and non-canonical app assets before authorisation or adapter I/O", () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    const authorise = vi.fn(() => true);
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    const runtime = createTestRuntime({ id: "runtime:image-app-root", environment, imageAuthorisation: { authorise } });
    runtimes.push(runtime);
    for (const path of ["//cdn.example.test/tracker.png", "/assets//logo.png", "/assets/./logo.png", "/assets/%2f%2fevil.png", "/assets/café.png"]) {
      expect(() => runtime.images.load({ subject, source: { kind: "app-asset", path } })).toThrow(TypeError);
    }
    expect(authorise).not.toHaveBeenCalled();
    expect(adapter.decodeRequests).toHaveLength(0);
  });

  it("decodes bundled assets named the way bundlers hand them over, for any app, with no host image policy", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    const runtime = createTestRuntime({ id: "runtime:image-bundled", environment });
    runtimes.push(runtime);
    const origin = environment.browser.getLocation().origin;
    const fromURL = loadImageResource(runtime.images, { subject: { appId: "app:any", capability: "image.decode" }, source: { kind: "app-asset", path: `${origin}/src/Effects/plate.png?no-inline` } });
    const fromImport = loadImageResource(runtime.images, { subject: { appId: "app:other", capability: "image.decode" }, source: { kind: "app-asset", path: "/assets/plate-4f2a.png" } });
    await Promise.all([fromURL.ready, fromImport.ready]);
    expect(adapter.decodeRequests.map((request) => request.source)).toEqual([
      { kind: "url", url: "/src/Effects/plate.png?no-inline", cors: "anonymous" },
      { kind: "url", url: "/assets/plate-4f2a.png", cors: "anonymous" },
    ]);
    fromURL.release(); fromImport.release();
    for (const path of ["https://cdn.example.test/plate.png", `${origin}/plate.png#frag`, "/plate.png?x=%2f", "/plate.png?a b"]) {
      expect(() => runtime.images.load({ subject, source: { kind: "app-asset", path } })).toThrow(TypeError);
    }
  });

  it("separates policy subjects, CORS requests and independent runtimes even when runtime ids match", async () => {
    const sharedEnvironment = createTestRuntimeEnvironment();
    const adapters: RecordingImageAdapter[] = [];
    Object.defineProperty(sharedEnvironment, "images", { enumerable: true, value: {
      acquire: () => {
        const adapter = new RecordingImageAdapter();
        adapters.push(adapter);
        return { adapter, release: () => adapter.dispose() };
      },
    } satisfies RuntimeImageAdapterFactory });
    const imageAuthorisation = { authorise: () => true };
    const firstRuntime = createTestRuntime({ id: "runtime:same", environment: sharedEnvironment, imageAuthorisation });
    const secondRuntime = createTestRuntime({ id: "runtime:same", environment: sharedEnvironment, imageAuthorisation });
    runtimes.push(firstRuntime, secondRuntime);
    const source = { kind: "url" as const, url: "https://cdn.example.test/image.png", cors: "anonymous" as const };
    const first = firstRuntime.images.load({ subject, source });
    const otherSubject = firstRuntime.images.load({ subject: { appId: "app:other", capability: "image.decode" }, source });
    const second = secondRuntime.images.load({ subject, source });
    await Promise.all([first.ready, otherSubject.ready, second.ready]);
    expect(adapters).toHaveLength(2);
    expect(adapters[0]?.decodeRequests).toHaveLength(2);
    expect(adapters[1]?.decodeRequests).toHaveLength(1);
    await expect(secondRuntime.images.export(first, "image/png")).rejects.toThrow(TypeError);
    first.release(); otherSubject.release(); second.release();
    await firstRuntime.dispose("dispose first image runtime");
    expect(adapters[0]?.disposed).toBe(true);
    expect(adapters[1]?.disposed).toBe(false);
  });

  it("does not reuse a decoded cache entry across policy subjects", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-cache-subject");
    runtimes.push(runtime);
    const source = { kind: "app-asset" as const, path: "/assets/subject.png" };
    const first = runtime.images.load({ subject, source });
    await first.ready;
    first.release();
    const second = runtime.images.load({ subject: { appId: "app:other", capability: "image.decode" }, source });
    await second.ready;
    expect(adapter.decodeRequests).toHaveLength(2);
    second.release();
  });

  it("rechecks mutable policy before exposing a decoded cache hit", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    let allowed = true;
    const runtime = createTestRuntime({ id: "runtime:image-cache-policy", environment, imageAuthorisation: { authorise: () => allowed } });
    runtimes.push(runtime);
    const source = { kind: "url" as const, url: "https://cdn.example.test/cache-policy.png", cors: "anonymous" as const };
    const first = runtime.images.load({ subject, source });
    await first.ready;
    first.release();
    allowed = false;
    const denied = runtime.images.load({ subject, source });
    await expect(denied.ready).rejects.toMatchObject({ name: "SecurityError" });
    expect(denied.src).toBe("");
    expect(adapter.decodeRequests).toHaveLength(1);
    denied.release();
  });

  it("isolates overlapping cache activations from stale authorisation settlement", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    const pending: Array<(allowed: boolean) => void> = [];
    let initial = true;
    const runtime = createTestRuntime({
      id: "runtime:image-cache-generation",
      environment,
      imageAuthorisation: { authorise: () => initial ? (initial = false, true) : new Promise<boolean>((resolve) => pending.push(resolve)) },
    });
    runtimes.push(runtime);
    const request = { subject, source: { kind: "url" as const, url: "https://cdn.example.test/generation.png", cors: "anonymous" as const } };
    const seeded = runtime.images.load(request);
    await seeded.ready;
    seeded.release();

    const first = runtime.images.load(request);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    first.release();
    const second = runtime.images.load(request);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0]!(true);
    await expect(first.ready).rejects.toMatchObject({ name: "AbortError" });
    const third = runtime.images.load(request);
    expect(third.state).toBe("loading");
    expect(third.src).toBe("");
    pending[1]!(false);
    await expect(second.ready).rejects.toMatchObject({ name: "SecurityError" });
    await expect(third.ready).rejects.toMatchObject({ name: "SecurityError" });
    expect(third.src).toBe("");
    second.release(); third.release();
  });

  it("does not merge distinct byte sources whose bounded cache hashes collide", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-collision");
    runtimes.push(runtime);
    const first = runtime.images.load({ subject, source: { kind: "bytes", mimeType: "image/png", bytes: new Uint8Array([16, 151, 230, 82, 47]) } });
    const second = runtime.images.load({ subject, source: { kind: "bytes", mimeType: "image/png", bytes: new Uint8Array([120, 247, 115, 9, 119]) } });
    await Promise.all([first.ready, second.ready]);
    expect(adapter.decodeRequests).toHaveLength(2);
    expect(adapter.decodeRequests[0]?.cacheKey).not.toBe(adapter.decodeRequests[1]?.cacheKey);
    first.release(); second.release();
  });

  it("keeps the byte-source snapshot unchanged when an adapter mutates its decode input", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    const decodedBytes: number[] = [];
    adapter.decode = async request => {
      adapter.decodeRequests.push(request);
      if (request.source.kind !== "bytes") throw new Error("Expected a byte source.");
      decodedBytes.push(request.source.bytes[0]!);
      request.source.bytes[0] = 77;
      return adapter.lease(request.cacheKey, request.source.bytes.byteLength);
    };
    Object.defineProperty(environment, "images", { value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } });
    const runtime = createTestRuntime({
      id: "runtime:image-source-snapshot",
      environment,
      imageAuthorisation: { authorise: () => true },
    });
    runtimes.push(runtime);
    const bytes = new Uint8Array([17, 18, 19]);
    const source = { kind: "bytes" as const, mimeType: "image/png" as const, bytes };
    const first = runtime.images.load({ subject, source });
    bytes[0] = 41;
    await first.ready;
    await runtime.images.export(first, "image/png");
    first.release();
    const second = runtime.images.load({ subject, source: { ...source, bytes: new Uint8Array([17, 18, 19]) } });
    await second.ready;
    second.release();
    expect(decodedBytes).toEqual([17]);
    expect(adapter.decodeRequests).toHaveLength(1);
    expect(bytes[0]).toBe(41);
  });

  it("denies remote URLs by default before adapter I/O", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    const runtime = createTestRuntime({ id: "runtime:image-default-deny", environment });
    runtimes.push(runtime);
    const image = runtime.images.load({ subject, source: { kind: "url", url: "https://cdn.example.test/private.png", cors: "anonymous" } });
    await expect(image.ready).rejects.toMatchObject({ name: "SecurityError" });
    expect(adapter.decodeRequests).toHaveLength(0);
    image.release();
  });

  it("binds document image descriptors to the exact active document and policy subject", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-document");
    runtimes.push(runtime);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer,
    }, new AbortController().signal);
    const source = { kind: "document-resource" as const, documentId: "document:a", descriptor };
    const denied = runtime.images.load({ subject, source });
    await expect(denied.ready).rejects.toMatchObject({ name: "SecurityError" });
    expect(adapter.decodeRequests).toHaveLength(0);
    denied.release();
    const allowed = runtime.images.load({ subject: { ...subject, documentId: "document:a" }, source });
    await allowed.ready;
    expect(adapter.decodeRequests).toHaveLength(1);
    expect(() => runtime.images.load({ subject: { ...subject, documentId: "document:b" }, source: { ...source, documentId: "document:b" } })).toThrow(TypeError);
    allowed.release();
    expect(runtime.documentResources.release("document:a", descriptor)).toBe(true);
  });

  it("rechecks an exact document lease before decode and before committing a delayed result", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    adapter.automatic = false;
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    const runtime = createTestRuntime({
      id: "runtime:image-document-live",
      environment,
      imageAuthorisation: { authorise: () => true },
    });
    runtimes.push(runtime);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const firstDescriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer,
    }, new AbortController().signal);
    const first = runtime.images.load({ subject: { ...subject, documentId: "document:a" }, source: { kind: "document-resource", documentId: "document:a", descriptor: firstDescriptor } });
    expect(runtime.documentResources.release("document:a", firstDescriptor)).toBe(true);
    await expect(first.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.decodeRequests).toHaveLength(0);
    first.release();

    const secondDescriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer,
    }, new AbortController().signal);
    const second = runtime.images.load({ subject: { ...subject, documentId: "document:a" }, source: { kind: "document-resource", documentId: "document:a", descriptor: secondDescriptor } });
    await vi.waitFor(() => expect(adapter.decodeRequests).toHaveLength(1));
    expect(runtime.documentResources.releaseDocument("document:a")).toBe(1);
    const key = adapter.decodeRequests[0]!.cacheKey;
    adapter.pending.get(key)!.resolve(adapter.lease(key));
    await expect(second.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.released).toEqual([key]);
    second.release();
  });

  it("snapshots a mutable document descriptor before asynchronous authority checks", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-document-snapshot");
    runtimes.push(runtime);
    const firstDescriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer,
    }, new AbortController().signal);
    const secondDescriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([2]).buffer,
    }, new AbortController().signal);
    const mutableDescriptor = { ...firstDescriptor };
    const image = runtime.images.load({
      subject: { ...subject, documentId: "document:a" },
      source: { kind: "document-resource", documentId: "document:a", descriptor: mutableDescriptor },
    });
    Object.assign(mutableDescriptor, secondDescriptor);
    expect(runtime.documentResources.release("document:a", firstDescriptor)).toBe(true);
    await expect(image.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.decodeRequests).toHaveLength(0);
    image.release();
    expect(runtime.documentResources.release("document:a", secondDescriptor)).toBe(true);
  });

  it("invalidates and revokes a mounted document image immediately when its document closes", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-mounted-close");
    runtimes.push(runtime);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer,
    }, new AbortController().signal);
    const image = runtime.images.load({ subject: { ...subject, documentId: "document:a" }, source: { kind: "document-resource", documentId: "document:a", descriptor } });
    await image.ready;
    expect(image.src).not.toBe("");
    expect(runtime.documentResources.releaseDocument("document:a")).toBe(1);
    expect(image.state).toBe("failed");
    expect(image.src).toBe("");
    expect(adapter.released).toHaveLength(1);
    image.release();
  });

  it("publishes one observable resource revision when a mounted document image is invalidated", async () => {
    const { runtime } = runtimeWithImages("runtime:image-observable-close");
    runtimes.push(runtime);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer,
    }, new AbortController().signal);
    const image = loadImageResource(runtime.images, {
      subject: { ...subject, documentId: "document:a" },
      source: { kind: "document-resource", documentId: "document:a", descriptor },
    });
    await image.ready;
    expect("subscribe" in image).toBe(true);
    const initialRevision = image.revision;
    let publications = 0;
    const unsubscribe = image.subscribe(() => { publications += 1; });
    expect(runtime.documentResources.releaseDocument("document:a")).toBe(1);
    expect(image.revision).toBe(initialRevision + 1);
    expect(publications).toBe(1);
    unsubscribe();
    unsubscribe();
    image.release();
    expect(publications).toBe(1);
  });

  it("publishes runtime disposal once and clears resource subscriptions", async () => {
    const { runtime } = runtimeWithImages("runtime:image-observable-dispose");
    runtimes.push(runtime);
    const image = loadImageResource(runtime.images, {
      subject,
      source: { kind: "app-asset", path: "/assets/dispose.png" },
    });
    await image.ready;
    const initialRevision = image.revision;
    let publications = 0;
    const unsubscribe = image.subscribe(() => { publications += 1; });
    await runtime.dispose("dispose observable image runtime");
    expect(image.state).toBe("released");
    expect(image.revision).toBe(initialRevision + 1);
    expect(publications).toBe(1);
    image.release();
    unsubscribe();
    expect(publications).toBe(1);
  });

  it("releases a still-held publication after document invalidation and runtime disposal", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-invalidated-dispose");
    runtimes.push(runtime);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer,
    }, new AbortController().signal);
    const image = loadImageResource(runtime.images, {
      subject: { ...subject, documentId: "document:a" },
      source: { kind: "document-resource", documentId: "document:a", descriptor },
    });
    await image.ready;
    const initialRevision = image.revision;
    let publications = 0;
    const unsubscribe = image.subscribe(() => { publications += 1; });
    expect(runtime.documentResources.releaseDocument("document:a")).toBe(1);
    expect(image.state).toBe("failed");
    expect(image.revision).toBe(initialRevision + 1);
    expect(publications).toBe(1);
    expect(adapter.released).toHaveLength(1);
    await runtime.dispose("dispose after document image invalidation");
    expect(image.state).toBe("released");
    expect(image.revision).toBe(initialRevision + 2);
    expect(publications).toBe(2);
    image.release();
    unsubscribe();
    expect(publications).toBe(2);
    expect(adapter.released).toHaveLength(1);
  });

  it("invalidates a zero-reference cached document image immediately on document close", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-cached-close");
    runtimes.push(runtime);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer,
    }, new AbortController().signal);
    const image = runtime.images.load({ subject: { ...subject, documentId: "document:a" }, source: { kind: "document-resource", documentId: "document:a", descriptor } });
    await image.ready;
    image.release();
    expect(adapter.released).toHaveLength(0);
    expect(runtime.documentResources.releaseDocument("document:a")).toBe(1);
    expect(adapter.released).toHaveLength(1);
    expect(runtime.images.diagnostics().decodedEntryCount).toBe(0);
  });

  it("does not retain or export a cached document image after its document closes", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-document-close");
    runtimes.push(runtime);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer,
    }, new AbortController().signal);
    const image = runtime.images.load({
      subject: { ...subject, documentId: "document:a" },
      source: { kind: "document-resource", documentId: "document:a", descriptor },
    });
    await image.ready;
    expect(runtime.documentResources.releaseDocument("document:a")).toBe(1);
    await expect(runtime.images.export(image, "image/png")).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.exported).toHaveLength(0);
    image.release();
    expect(adapter.released).toHaveLength(1);
    expect(runtime.images.diagnostics().decodedEntryCount).toBe(0);
  });

  it("fences late decode after release/disposal and releases the late platform lease exactly once", async () => {
    const adapter = new RecordingImageAdapter();
    adapter.automatic = false;
    const { runtime } = runtimeWithImages("runtime:image-late", adapter);
    runtimes.push(runtime);
    const image = runtime.images.load({ subject, source: { kind: "app-asset", path: "/late.png" } });
    await vi.waitFor(() => expect(adapter.decodeRequests).toHaveLength(1));
    const key = adapter.decodeRequests[0]!.cacheKey;
    image.release();
    adapter.pending.get(key)!.resolve(adapter.lease(key));
    await expect(image.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.released).toEqual([key]);
    expect(runtime.images.diagnostics().activeOperationCount).toBe(0);
  });

  it("keeps non-cooperative adapter work counted and blocks retry until cancellation settles", async () => {
    const adapter = new RecordingImageAdapter();
    adapter.automatic = false;
    const { runtime } = runtimeWithImages("runtime:image-non-cooperative-cancel", adapter);
    runtimes.push(runtime);
    const request = Object.freeze({ subject, source: Object.freeze({ kind: "app-asset" as const, path: "/non-cooperative.png" }) });
    const first = runtime.images.load(request);
    await vi.waitFor(() => expect(adapter.decodeRequests).toHaveLength(1));
    const firstKey = adapter.decodeRequests[0]!.cacheKey;

    first.release();
    expect(runtime.images.diagnostics()).toMatchObject({ activeOperationCount: 1, activeReferenceCount: 0 });
    expect(() => runtime.images.load(request)).toThrow(/settling/i);
    expect(adapter.decodeRequests).toHaveLength(1);

    adapter.pending.get(firstKey)!.resolve(adapter.lease(firstKey));
    await expect(first.ready).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(runtime.images.diagnostics().activeOperationCount).toBe(0));
    const retry = runtime.images.load(request);
    await vi.waitFor(() => expect(adapter.decodeRequests).toHaveLength(2));
    const retryKey = adapter.decodeRequests[1]!.cacheKey;
    adapter.pending.get(retryKey)!.resolve(adapter.lease(retryKey));
    await expect(retry.ready).resolves.toBeUndefined();
    retry.release();
  });

  it("fences a decode which settles after runtime disposal", async () => {
    const adapter = new RecordingImageAdapter();
    adapter.automatic = false;
    const { runtime } = runtimeWithImages("runtime:image-dispose-late", adapter);
    runtimes.push(runtime);
    const image = runtime.images.load({ subject, source: { kind: "app-asset", path: "/dispose-late.png" } });
    await vi.waitFor(() => expect(adapter.decodeRequests).toHaveLength(1));
    const key = adapter.decodeRequests[0]!.cacheKey;
    await runtime.dispose("dispose during image decode");
    adapter.pending.get(key)!.resolve(adapter.lease(key));
    await expect(image.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.released).toEqual([key]);
  });

  it("rejects hostile descriptors and bounded binary inputs without invoking accessors or decode", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-hostile");
    runtimes.push(runtime);
    let getterCalls = 0;
    const hostile = Object.create(null);
    Object.defineProperty(hostile, "kind", { enumerable: true, get() { getterCalls += 1; return "url"; } });
    expect(() => runtime.images.load({ subject, source: hostile } as never)).toThrow(TypeError);
    expect(getterCalls).toBe(0);
    expect(() => runtime.images.load({ subject, source: { kind: "bytes", mimeType: "image/svg+xml", bytes: new Uint8Array(4) } })).toThrow(TypeError);
    expect(() => runtime.images.load({ subject, source: { kind: "bytes", mimeType: "image/png", bytes: new Uint8Array(8 * 1024 * 1024 + 1) } })).toThrow(RangeError);
    expect(() => runtime.images.load({ subject, source: { kind: "url", url: "javascript:alert(1)", cors: "anonymous" } })).toThrow(TypeError);
    let mimeCoercions = 0;
    const hostileMime = { [Symbol.toPrimitive]() { mimeCoercions += 1; return "image/png"; } };
    expect(() => runtime.images.load({ subject, source: { kind: "bytes", mimeType: hostileMime, bytes: new Uint8Array([1]) } } as never)).toThrow(TypeError);
    expect(mimeCoercions).toBe(0);
    expect(adapter.decodeRequests).toHaveLength(0);
    let sliceReads = 0; let expandoReads = 0;
    const poisonedBytes = new Uint8Array([1, 2, 3]);
    Object.defineProperty(poisonedBytes, "slice", { get() { sliceReads += 1; throw new Error("poisoned slice"); } });
    Object.defineProperty(poisonedBytes, "metadata", { get() { expandoReads += 1; throw new Error("poisoned expando"); } });
    const safeCopy = runtime.images.load({ subject, source: { kind: "bytes", mimeType: "image/png", bytes: poisonedBytes } });
    await safeCopy.ready;
    expect(sliceReads).toBe(0);
    expect(expandoReads).toBe(0);
    safeCopy.release();
    expect(adapter.decodeRequests).toHaveLength(1);
  });

  it("loads generated SVG and svg+xml bytes and exposes template and cap-inset metadata", async () => {
    const { runtime, adapter } = runtimeWithImages("runtime:image-svg-template");
    runtimes.push(runtime);
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"8\"><rect width=\"16\" height=\"8\" fill=\"currentColor\"/></svg>";
    const generated = loadImageResource(runtime.images, {
      subject,
      source: { kind: "generated-svg", svg, intrinsicSize: { width: 16, height: 8 }, density: 2 },
      accessibleLabel: "Generated mark",
      renderingMode: "template",
      tintColour: "#336699",
      capInsets: { top: 2, right: 3, bottom: 2, left: 3 },
      resizingMode: "cap-insets",
    });
    await generated.ready;
    expect(generated.state).toBe("ready");
    expect(generated.intrinsicSize).toEqual({ width: 16, height: 8 });
    expect(generated.density).toBe(2);
    expect(generated.renderingMode).toBe("template");
    expect(generated.tintColour).toBe("#336699");
    expect(generated.capInsets).toEqual({ top: 2, right: 3, bottom: 2, left: 3 });
    expect(generated.resizingMode).toBe("cap-insets");
    expect(adapter.decodeRequests[0]?.source).toMatchObject({ kind: "bytes", mimeType: "image/svg+xml" });

    const encoded = new TextEncoder().encode(svg);
    const fromBytes = runtime.images.load({
      subject,
      source: { kind: "bytes", mimeType: "image/svg+xml", bytes: encoded },
      renderingMode: "original",
    });
    await fromBytes.ready;
    expect(fromBytes.renderingMode).toBe("original");
    expect(fromBytes.capInsets).toBeNull();
    expect(adapter.decodeRequests).toHaveLength(2);

    expect(() => runtime.images.load({
      subject,
      source: { kind: "generated-svg", svg: "<svg/><script>alert(1)</script>" },
    })).toThrow(/forbidden|script/i);
    generated.release();
    fromBytes.release();
  });

  it("rejects SVG subresources before image policy, fetch, decode, or object-URL work while preserving safe internal references", async () => {
    const environment = createTestRuntimeEnvironment();
    const authorise = vi.fn(() => true);
    const fetch = vi.fn();
    const createObjectURL = vi.fn(() => "blob:svg-safe");
    const platform: BrowserImagePlatform = {
      decode: vi.fn(async () => {
        fetch(); createObjectURL();
        return Object.freeze({ src: "blob:svg-safe", intrinsicSize: Object.freeze({ width: 32, height: 16 }), density: 1, byteLength: 64, corsClean: true, revoke: true });
      }),
      export: vi.fn(async () => new Uint8Array([1])),
      revokeObjectURL: vi.fn(),
    };
    const adapter = new BrowserImageAdapter(platform);
    Object.defineProperty(environment, "images", { enumerable: true, value: {
      acquire: () => Object.freeze({ adapter, release: () => adapter.dispose() }),
    } satisfies RuntimeImageAdapterFactory });
    const runtime = createTestRuntime({ id: "runtime:image-svg-subresource-policy", environment, imageAuthorisation: { authorise } });
    runtimes.push(runtime);
    const hostile = [
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"https://attacker.example/pixel.svg\"/></svg>",
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><use href=\"https://attacker.example/symbol.svg#x\"/></svg>",
      "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\"><use xlink:href=\"data:image/svg+xml,evil\"/></svg>",
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><style>@import url(https://attacker.example/payload.css);</style></svg>",
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><style>.mark { fill: url(blob:attacker); }</style></svg>",
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect style=\"fill:url(https://attacker.example/paint)\"/></svg>",
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect filter=\"url(javascript:alert(1))\"/></svg>",
    ];
    for (const svg of hostile) {
      expect(() => runtime.images.load({ subject, source: { kind: "generated-svg", svg } })).toThrow(DOMException);
      expect(() => runtime.images.load({ subject, source: { kind: "bytes", mimeType: "image/svg+xml", bytes: new TextEncoder().encode(svg) } })).toThrow(DOMException);
    }
    const documentBytes = new TextEncoder().encode(hostile[0]!);
    await expect(runtime.documentResources.acquire("document:svg", {
      type: "image/svg+xml", size: documentBytes.byteLength, arrayBuffer: async () => documentBytes.slice().buffer,
    }, new AbortController().signal)).rejects.toThrow(/MIME type/i);
    expect(authorise).not.toHaveBeenCalled();
    expect(platform.decode).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();

    const safe = runtime.images.load({
      subject,
      source: {
        kind: "generated-svg",
        svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><defs><linearGradient id=\"paint\"><stop offset=\"0\"/></linearGradient><filter id=\"soft\"><feGaussianBlur stdDeviation=\"1\"/></filter><path id=\"shape\" d=\"M0 0H8V8Z\"/></defs><use href=\"#shape\" fill=\"url(#paint)\" filter=\"url(#soft)\" style=\"stroke:url('#paint')\"/></svg>",
      },
    });
    await safe.ready;
    expect(authorise).not.toHaveBeenCalled();
    expect(platform.decode).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    safe.release();

    const graphics = GFXContext.recording({
      size: { width: 16, height: 8 },
      identifiers: runtime.images.createGraphicsIdentifierIssuer(),
    });
    graphics.setFill(new GFXGradient([
      { offset: 0, colour: GFXColour.parse("#000") },
      { offset: 1, colour: GFXColour.parse("#fff") },
    ]));
    graphics.clip(GFXPath.rect({ x: 0, y: 0, width: 16, height: 8 }));
    graphics.setShadow({ offset: { x: 1, y: 1 }, blur: 1, spread: 0, colour: GFXColour.parse("#123456") });
    graphics.setBlendMode("multiply");
    graphics.fill(GFXPath.rect({ x: 1, y: 1, width: 14, height: 6 }));
    const generatedGraphics = runtime.images.load({ subject, source: { kind: "generated-svg", svg: graphics.toSVG() } });
    await generatedGraphics.ready;
    expect(platform.decode).toHaveBeenCalledTimes(2);
    generatedGraphics.release();
  });

  it("exports only adapter-proven CORS-clean pixels", async () => {
    const adapter = new RecordingImageAdapter();
    adapter.lease = (key, byteLength = 64) => RecordingImageAdapter.prototype.lease.call(adapter, key, byteLength, false);
    const { runtime } = runtimeWithImages("runtime:image-cors", adapter);
    runtimes.push(runtime);
    const image = runtime.images.load({ subject, source: { kind: "url", url: "https://cdn.example.test/tainted.png", cors: "none" } });
    await image.ready;
    await expect(runtime.images.export(image, "image/png")).rejects.toMatchObject({ name: "SecurityError" });
    expect(adapter.exported).toHaveLength(0);
    image.release();
  });

  it("rechecks the exact resource lease after delayed export authorisation", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new RecordingImageAdapter();
    Object.defineProperty(environment, "images", { enumerable: true, value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory });
    let settleExport!: (allowed: boolean) => void;
    const runtime = createTestRuntime({
      id: "runtime:image-export-lease",
      environment,
      imageAuthorisation: { authorise: (request) => request.operation === "decode" ? true : new Promise<boolean>((resolve) => { settleExport = resolve; }) },
    });
    runtimes.push(runtime);
    const image = runtime.images.load({ subject, source: { kind: "url", url: "https://cdn.example.test/export.png", cors: "anonymous" } });
    await image.ready;
    const exporting = runtime.images.export(image, "image/png");
    await Promise.resolve();
    image.release();
    settleExport(true);
    await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.exported).toHaveLength(0);
  });
});
