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

import { createHash } from "node:crypto";
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeSynCloudOSHostContributions,
  createSynCloudOSHostContribution,
  prepareSynCloudOSHostContributions,
  type SynCloudOSHostCompositionInput,
} from "../../src/SynCloudOS/HostContributions/hostContribution";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import type { DocumentAssetStore } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentAssetRuntimeBacking } from "../../src/SynCloudOS/Runtime/DocumentAssetRuntimeIntegration";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring } from "../../src/Webspring/public";
import { noteType } from "../fixtures/noteDocumentType";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });
vi.mock("../../src/App", () => ({ App: () => null }));

const environment = {} as SynCloudOSRuntimeEnvironment;
const stores: DocumentAssetStore[] = [];
let sequence = 0;
function store() {
  const original = createInMemoryDocumentAssetStore({
    randomUUID: () => `host-asset-${++sequence}`,
    hash: async bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  });
  stores.push(original);
  return { ...original, capabilities: { ...original.capabilities } };
}
function backing() {
  return {
    store: store(),
    scopeForDocument: (documentId: string) => ({ authorizationId: "host-assets", documentId }),
    manifest: {
      enumerateReferences: vi.fn(() => []),
      scopeForLocation: vi.fn(() => ({ authorizationId: "host-assets", documentId: "native" })),
      nativeDurability: "memory" as "memory" | "durable",
      hash: async (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    },
  };
}
async function prepare(value: unknown, id = "asset-owner") {
  return prepareSynCloudOSHostContributions([
    createSynCloudOSHostContribution(id, `tests/${id}`, () => ({
      applicationDocuments: { assetBacking: value as DocumentAssetRuntimeBacking },
    })),
  ], environment);
}
async function normalize(value: unknown, path: "contribution" | "base") {
  if (path === "contribution") return (await prepare(value))[0]!.applicationDocuments!.assetBacking!;
  return composeSynCloudOSHostContributions([], {
    applicationDocuments: { assetBacking: value as DocumentAssetRuntimeBacking },
  }).applicationDocuments!.assetBacking!;
}
afterEach(() => { for (const value of stores.splice(0)) value.dispose(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("host document asset backing", () => {
  it.each(["contribution", "base"] as const)("accepts and forwards a supplied store through the actual %s path", async path => {
    const original = backing();
    const captured = await normalize(original, path);
    expect(Object.isFrozen(captured)).toBe(true); expect(Object.isFrozen(captured.store)).toBe(true);
    expect(Object.isFrozen(captured.store!.capabilities)).toBe(true); expect(Object.isFrozen(captured.manifest)).toBe(true);
    expect(Object.isFrozen(captured.scopeForDocument)).toBe(true);
    const scope = captured.scopeForDocument("one");
    const reference = await captured.store!.put(scope, { bytes: new Uint8Array([1, 2]), mimeType: "image/png" });
    await expect(original.store.read(scope, reference)).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(captured.store!.read(scope, reference)).resolves.toEqual(new Uint8Array([1, 2]));
    expect(captured.manifest!.enumerateReferences({}, { typeId: "notes", schemaVersion: 1 })).toEqual([]);
  });

  it("captures options and callable selections before later caller mutation", async () => {
    const original = backing(), admittedStore = original.store, admittedManifest = original.manifest;
    const enumeration = admittedManifest.enumerateReferences, location = admittedManifest.scopeForLocation, hash = admittedManifest.hash;
    const [prepared] = await prepare(original);
    original.store = store(); original.scopeForDocument = () => { throw new Error("replacement scope"); };
    admittedStore.capabilities.maximumAssetBytes = 1;
    admittedStore.read = async () => { throw new Error("replacement read"); };
    admittedManifest.enumerateReferences = vi.fn(() => { throw new Error("replacement enumeration"); });
    admittedManifest.scopeForLocation = vi.fn(() => { throw new Error("replacement location"); });
    admittedManifest.hash = async () => { throw new Error("replacement hash"); };
    admittedManifest.nativeDurability = "durable";
    const captured = composeSynCloudOSHostContributions([prepared!]).applicationDocuments!.assetBacking!;
    expect(captured.scopeForDocument("one")).toEqual({ authorizationId: "host-assets", documentId: "one" });
    expect(captured.store!.capabilities.maximumAssetBytes).toBeGreaterThan(1);
    expect(captured.manifest!.nativeDurability).toBe("memory");
    expect(captured.manifest!.enumerateReferences({}, { typeId: "notes", schemaVersion: 1 })).toEqual([]);
    expect(enumeration).toHaveBeenCalledOnce(); expect(admittedManifest.enumerateReferences).not.toHaveBeenCalled();
    captured.manifest!.scopeForLocation({ kind: "memory", namespace: "notes", key: "one" }); expect(location).toHaveBeenCalledOnce();
    await expect(captured.manifest!.hash!(new Uint8Array([1]))).resolves.toBe(await hash(new Uint8Array([1])));
    const scope = captured.scopeForDocument("one");
    const reference = await captured.store!.put(scope, { bytes: new Uint8Array([1, 2]), mimeType: "image/png" });
    await expect(captured.store!.read(scope, reference)).resolves.toEqual(new Uint8Array([1, 2]));
  });

  it("captures an owned store factory lazily and retains its original receiver", async () => {
    const supplied = store();
    const original = {
      createStore: vi.fn(function (this: object) { expect(this).toBe(original); return supplied; }),
      scopeForDocument(documentId: string) { expect(this).toBe(original); return { authorizationId: "host-assets", documentId }; },
    };
    const factory = original.createStore;
    const [prepared] = await prepare(original); expect(factory).not.toHaveBeenCalled();
    original.createStore = vi.fn(() => { throw new Error("replacement factory"); });
    const captured = composeSynCloudOSHostContributions([prepared!]).applicationDocuments!.assetBacking!;
    expect(captured.scopeForDocument("one").documentId).toBe("one");
    const created = captured.createStore!();
    expect(factory).toHaveBeenCalledOnce(); expect(original.createStore).not.toHaveBeenCalled();
    expect(Object.isFrozen(created)).toBe(true); expect(created.capabilities).toEqual(supplied.capabilities);
  });

  it("captures callbacks without reading a caller-defined bind accessor", async () => {
    const original = backing(); let reads = 0;
    Object.defineProperty(original.scopeForDocument, "bind", { get() { reads += 1; throw new Error("callback bind getter executed"); } });
    const captured = await normalize(original, "contribution");
    expect(captured.scopeForDocument("one").documentId).toBe("one"); expect(reads).toBe(0);
  });

  for (const path of ["contribution", "base"] as const) {
    it.each(["name", "length"] as const)(`captures ${path} operations without reading function metadata %s accessors`, async property => {
      for (const ownership of ["supplied", "owned"] as const) {
        const source = backing(); let reads = 0, callbacks = 0, factories = 0;
        const input = {
          ...(ownership === "supplied" ? { store: source.store } : { createStore: () => { factories += 1; return source.store; } }),
          scopeForDocument(documentId: string) { callbacks += 1; return { authorizationId: "host-assets", documentId }; },
          manifest: {
            enumerateReferences: () => { callbacks += 1; return []; },
            scopeForLocation: () => { callbacks += 1; return { authorizationId: "host-assets", documentId: "native" }; },
            nativeDurability: () => { callbacks += 1; return "memory" as const; },
            hash: async (_bytes: Uint8Array) => { callbacks += 1; return `sha256:${"0".repeat(64)}`; },
          },
        };
        const operations = [input.scopeForDocument, ...Object.values(input.manifest),
          ...Object.values(source.store).filter(value => typeof value === "function"),
          ...(ownership === "owned" && "createStore" in input ? [input.createStore] : [])];
        for (const operation of operations) Object.defineProperty(operation, property, {
          configurable: true, get() { reads += 1; throw new Error("function metadata getter executed"); },
        });
        const captured = await normalize(input, path);
        expect(reads).toBe(0); expect(callbacks).toBe(0); expect(factories).toBe(0);
        const admitted = ownership === "owned" ? captured.createStore!() : captured.store!;
        expect(factories).toBe(ownership === "owned" ? 1 : 0); expect(reads).toBe(0);
        expect(Object.isFrozen(admitted)).toBe(true);
        expect(captured.scopeForDocument("one").documentId).toBe("one");
        expect(callbacks).toBe(1); expect(reads).toBe(0);
      }
    });
  }

  it("captures prototype store methods with private receivers and forwards atomic root promotion", async () => {
    // Node structuredClone returns Node typed arrays; use that same realm for
    // the real transactional backing while this file runs under jsdom.
    vi.stubGlobal("Uint8Array", structuredClone(new Uint8Array()).constructor);
    class PrivateStore implements DocumentAssetStore {
      #delegate = store();
      readonly capabilities = this.#delegate.capabilities;
      put(...args: Parameters<DocumentAssetStore["put"]>) { return this.#delegate.put(...args); }
      read(...args: Parameters<DocumentAssetStore["read"]>) { return this.#delegate.read(...args); }
      copy(...args: Parameters<DocumentAssetStore["copy"]>) { return this.#delegate.copy(...args); }
      retain(...args: Parameters<DocumentAssetStore["retain"]>) { return this.#delegate.retain(...args); }
      release(...args: Parameters<DocumentAssetStore["release"]>) { return this.#delegate.release(...args); }
      listRetentionRoots(...args: Parameters<DocumentAssetStore["listRetentionRoots"]>) { return this.#delegate.listRetentionRoots(...args); }
      collectGarbage(...args: Parameters<DocumentAssetStore["collectGarbage"]>) { return this.#delegate.collectGarbage(...args); }
      promoteRetentionRoot(...args: Parameters<NonNullable<DocumentAssetStore["promoteRetentionRoot"]>>) { return this.#delegate.promoteRetentionRoot!(...args); }
      dispose() { this.#delegate.dispose(); }
    }
    const original = new PrivateStore(), captured = await normalize({ ...backing(), store: original }, "base");
    const scope = captured.scopeForDocument("private"), source = { scope, kind: "transaction" as const, id: "source" }, target = { scope, kind: "history" as const, id: "target" };
    const reference = await captured.store!.put(scope, { bytes: new Uint8Array([3]), mimeType: "image/png" });
    const token = await captured.store!.retain(source, [reference]);
    const promoted = await captured.store!.promoteRetentionRoot!(source, target, [reference], token);
    expect(promoted).toBeTypeOf("string");
    expect(await original.listRetentionRoots(scope)).toEqual([{ root: target, references: [reference], token: promoted }]);
    await expect(captured.store!.read(scope, reference)).resolves.toEqual(new Uint8Array([3]));
  });

  it("accepts a store without the optional atomic root promotion operation", async () => {
    const { promoteRetentionRoot: _optional, ...supplied } = store();
    const captured = await normalize({ ...backing(), store: supplied }, "base");
    expect(captured.store!.promoteRetentionRoot).toBeUndefined();
    expect(Object.hasOwn(captured.store!, "promoteRetentionRoot")).toBe(false);
  });

  it("validates a factory's actual returned store lazily without executing accessor operations", async () => {
    let reads = 0;
    const supplied = Object.defineProperty(store(), "read", { enumerable: true, get() { reads += 1; throw new Error("getter executed"); } });
    const factory = vi.fn(() => supplied), captured = await normalize({ createStore: factory, scopeForDocument: backing().scopeForDocument }, "base");
    expect(factory).not.toHaveBeenCalled();
    expect(() => captured.createStore!()).toThrow(/data property/i); expect(reads).toBe(0); expect(factory).toHaveBeenCalledOnce();
  });

  it("agrees on the same original backing across separate captures and the base", async () => {
    const original = backing();
    const [first] = await prepare(original, "first-assets"), [second] = await prepare(original, "second-assets");
    expect(first!.applicationDocuments!.assetBacking).not.toBe(second!.applicationDocuments!.assetBacking);
    const composed = composeSynCloudOSHostContributions([first!, second!], { applicationDocuments: { assetBacking: original } });
    expect(composed.applicationDocuments!.assetBacking!.scopeForDocument("same").documentId).toBe("same");
    const recomposed = composeSynCloudOSHostContributions([first!], { applicationDocuments: composed.applicationDocuments });
    expect(recomposed.applicationDocuments!.assetBacking).toBe(composed.applicationDocuments!.assetBacking);
  });

  it.each(["contribution", "base"] as const)("rejects a distinct %s backing even with identical capability members", async path => {
    const original = backing(), distinct = { ...original };
    const [first] = await prepare(original, "first-assets"), [second] = await prepare(distinct, "second-assets");
    expect(() => path === "base"
      ? composeSynCloudOSHostContributions([first!], { applicationDocuments: { assetBacking: distinct } })
      : composeSynCloudOSHostContributions([first!, second!])).toThrow(/Conflicting application document asset backing/i);
  });

  it.each(["contribution", "base"] as const)("rejects nested accessors without executing them on the %s path", async path => {
    const cases = ["scopeForDocument", "manifest.enumerateReferences", "manifest.nativeDurability", "store.read", "store.capabilities", "capabilities.maximumAssetBytes"];
    for (const key of cases) {
      const value = backing(); let reads = 0;
      const [group, property] = key.split(".");
      const target = group === "manifest" ? value.manifest : group === "store" ? value.store : group === "capabilities" ? value.store.capabilities : value;
      Object.defineProperty(target, property ?? group!, { enumerable: true, get() { reads += 1; throw new Error("getter executed"); } });
      await expect(normalize(value, path)).rejects.toThrow(/data property|accessor/i); expect(reads).toBe(0);
    }
  });

  it("rejects base applicationDocuments and nested assetBacking accessors without executing them", async () => {
    let reads = 0;
    const input = Object.defineProperty({}, "applicationDocuments", { enumerable: true, get() { reads += 1; return { assetBacking: backing() }; } });
    expect(() => composeSynCloudOSHostContributions([], input as SynCloudOSHostCompositionInput)).toThrow(/data property/i);
    const documents = Object.defineProperty({}, "assetBacking", { enumerable: true, get() { reads += 1; return backing(); } });
    expect(() => composeSynCloudOSHostContributions([], { applicationDocuments: documents })).toThrow(/data property/i);
    expect(reads).toBe(0);
  });

  it("rejects hidden and symbol options rather than retaining uncaptured configuration", async () => {
    const hidden = Object.defineProperty(backing(), "hidden", { value: true });
    const symbol = { ...backing(), [Symbol("store")]: store() };
    await expect(normalize(hidden, "contribution")).rejects.toThrow(/assetBacking/i);
    await expect(normalize(symbol, "base")).rejects.toThrow(/symbol/i);
    const value = backing(); Object.defineProperty(value.manifest, "hash", { enumerable: false, value: value.manifest.hash });
    await expect(normalize(value, "base")).rejects.toThrow(/enumerable data property/i);
  });

  it.each([
    ["neither store nor factory", () => ({ scopeForDocument: backing().scopeForDocument })],
    ["both store and factory", () => ({ ...backing(), createStore: () => store() })],
    ["missing scope callback", () => ({ store: store() })],
    ["invalid scope callback", () => ({ ...backing(), scopeForDocument: 1 })],
    ["invalid factory", () => ({ createStore: 1, scopeForDocument: backing().scopeForDocument })],
    ["unknown backing option", () => ({ ...backing(), rawStore: store() })],
    ["invalid store operation", () => ({ ...backing(), store: { ...store(), release: 1 } })],
    ["invalid quota", () => { const value = backing(); value.store.capabilities.maximumTotalBytes = -1; return value; }],
    ["invalid manifest", () => ({ ...backing(), manifest: [] })],
    ["missing manifest callback", () => ({ ...backing(), manifest: { enumerateReferences: () => [] } })],
    ["invalid native durability", () => ({ ...backing(), manifest: { ...backing().manifest, nativeDurability: "inferred" } })],
    ["invalid hash callback", () => ({ ...backing(), manifest: { ...backing().manifest, hash: 1 } })],
    ["unknown manifest option", () => ({ ...backing(), manifest: { ...backing().manifest, rawStore: store() } })],
  ] as const)("rejects the current typed shape violation: %s", async (_label, input) => {
    await expect(normalize(input(), "contribution")).rejects.toThrow(/assetBacking/i);
    await expect(normalize(input(), "base")).rejects.toThrow(/assetBacking/i);
  });

  it("captures dynamic native durability without invoking it during preparation", async () => {
    const original = backing(); const durability = vi.fn((_adapterId: string) => "durable" as const);
    const input = { ...original, manifest: { ...original.manifest, nativeDurability: durability } };
    const captured = await normalize(input, "contribution"); expect(durability).not.toHaveBeenCalled();
    input.manifest.nativeDurability = vi.fn(() => { throw new Error("replacement durability"); });
    const resolve = captured.manifest!.nativeDurability;
    if (typeof resolve !== "function") throw new Error("The dynamic durability callback was lost.");
    expect(resolve("provider")).toBe("durable"); expect(durability).toHaveBeenCalledExactlyOnceWith("provider");
  });

  it.each(["supplied", "owned"] as const)("forwards %s backing through a real browser host into the runtime", async ownership => {
    const original = backing(); const dispose = vi.fn(original.store.dispose); original.store.dispose = dispose;
    const createStore = vi.fn(() => original.store);
    const scopeForDocument = vi.fn(original.scopeForDocument);
    const assetBacking = { ...(ownership === "supplied" ? { store: original.store } : { createStore }), scopeForDocument, manifest: original.manifest };
    const contribution = createSynCloudOSHostContribution(`browser-assets-${ownership}`, "tests/browser-assets", () => ({
      applicationDocuments: { assetBacking, initialTypes: [noteType] },
    }));
    const shell = defineWebspring({
      manifest: { schemaVersion: 1, id: `com.example.assets-${ownership}`, version: "1.0.0", title: "Assets",
        webspringShell: { views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
          defaults: { desktop: "site", tablet: "site", mobile: "site" }, homeRoute: "/", branding: { name: { key: "site.name", fallback: "Assets" } } } },
      components: { site: () => null },
    });
    const element = document.createElement("div"); document.body.append(element);
    let mounted: MountedSynCloudOSHost | undefined;
    try {
      await act(async () => { mounted = await mountSynCloudOS({ element, shell, contributions: [contribution] }); });
      const call = vi.mocked(createSynCloudOS).mock.calls.at(-1)!, result = vi.mocked(createSynCloudOS).mock.results.at(-1)!;
      expect(call[0].applicationDocuments!.assetBacking).toBeDefined(); expect(result.type).toBe("return");
      if (result.type !== "return") throw new Error("No actual runtime.");
      const runtime = result.value;
      expect(runtime.documentAssets).toBeDefined();
      const document = await runtime.documents.newDocument({ documentId: `browser-${ownership}`, typeId: noteType.id });
      await runtime.documentAssets!.whenReady(document.id); expect(scopeForDocument).toHaveBeenCalledWith(document.id);
      expect(original.manifest.enumerateReferences).toHaveBeenCalled();
      runtime.documents.registerCloseReviewer({ review: async () => "discard" });
      await act(async () => { await mounted!.dispose("asset host test"); }); mounted = undefined;
      expect(createStore).toHaveBeenCalledTimes(ownership === "owned" ? 1 : 0);
      expect(dispose).toHaveBeenCalledTimes(ownership === "owned" ? 1 : 0);
    } finally {
      if (mounted) await act(async () => { await mounted!.dispose("asset host failure cleanup"); });
      element.remove();
    }
  });
});
