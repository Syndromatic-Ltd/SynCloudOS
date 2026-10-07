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

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { GFXColour } from "../../src/FX/GraphicsFX/GFXColour";
import { GFXPath } from "../../src/FX/GraphicsFX/GFXPath";
import type { GFXPDFContext } from "../../src/FX/GraphicsFX/pdf/GFXPDFContext";
import type { DocumentOutputDependencies, DocumentOutputEngine, DocumentOutputLease } from "../../src/SynCloudOS/Documents/documentOutputTypes";

async function preparation() {
  const module = await import("../../src/SynCloudOS/Documents/DocumentOutputPreparation").catch(() => null);
  expect(module?.createDocumentOutputPreparation, "C07 must provide real settled snapshot output preparation").toBeTypeOf("function");
  return module!.createDocumentOutputPreparation;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

type Model = { text: string; nested: { title: string } };
const snapshot = () => ({ documentId: "doc:output", revision: 7, model: { text: "captured", nested: { title: "original" } } });
const dependencies = (): DocumentOutputDependencies<Model> => ({ settle: () => ({ status: "settled" }), capture: snapshot });
const engine: DocumentOutputEngine<Model> = () => ({
  pages: [{ geometry: { width: 72, height: 144 }, draw(context) {
    context.fill(GFXPath.rect({ x: 5, y: 6, width: 10, height: 12 }), GFXColour.rgba(1, 0, 0));
  } }],
});

describe("DocumentOutputPreparation", () => {
  it("enforces read-only retained dependencies at runtime across pages without exposing leases", async () => {
    const create = await preparation();
    let releases = 0, blocked = 0;
    const value = Object.freeze({ image: "retained original" });
    const prepared = await create(dependencies()).prepare({ engine: () => ({ dependencies: [
      { id: "asset", kind: "resource", retain: () => ({ status: "retained", lease: { value, release() { releases++; } } }) },
    ], pages: [
      { geometry: { width: 10, height: 20 }, draw(_context, { dependencies: retained }) {
        const unsafe = retained as Map<string, unknown>;
        const mutations = [
          () => unsafe.set("asset", "replacement"), () => unsafe.delete("asset"), () => unsafe.clear(),
          () => Map.prototype.set.call(retained, "asset", "prototype replacement"),
          () => Object.defineProperty(retained, "get", { value: () => "replacement" }),
        ];
        for (const mutate of mutations) { try { mutate(); } catch { blocked++; } }
        retained.forEach((_value, _key, map) => {
          try { (map as Map<string, unknown>).clear(); } catch { blocked++; }
        });
      } },
      { geometry: { width: 10, height: 20 }, draw(_context, { dependencies: retained }) {
        expect(retained.get("asset")).toBe(value);
        expect(retained.size).toBe(1); expect(retained.has("asset")).toBe(true);
        expect([...retained.entries()]).toEqual([["asset", value]]);
        expect([...retained.keys()]).toEqual(["asset"]); expect([...retained.values()]).toEqual([value]);
        expect([...retained]).toEqual([["asset", value]]);
        expect(Object.isFrozen(retained)).toBe(true); expect(Object.isFrozen(retained.get)).toBe(true);
        expect(Reflect.get(retained, "set")).toBeUndefined();
      } },
    ] }) });
    if (prepared.status !== "prepared") throw new Error("Fixture preparation failed");
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe("exported"); expect(blocked).toBe(6);
    prepared.output.release(); expect(releases).toBe(1);
  });
  it("captures after settlement and isolates a deeply frozen model from edits during drawing", async () => {
    const create = await preparation();
    const canonical = snapshot();
    const order: string[] = [];
    const drawing = deferred<void>();
    const entered = deferred<void>();
    const service = create<Model>({
      settle: async () => { order.push("settle"); canonical.model.text = "committed draft"; return { status: "settled" }; },
      capture: () => { order.push("capture"); return canonical; },
    });
    const prepared = await service.prepare({ purpose: "export", configurationId: "fixed-private-engine", engine: captured => {
      expect(captured.model.text).toBe("committed draft");
      expect(Object.isFrozen(captured.model.nested)).toBe(true);
      return { pages: [{ geometry: { width: 200, height: 300, rotation: 90 }, async draw(context, { snapshot: drawn }) {
        entered.resolve();
        await drawing.promise;
        expect(drawn.model.nested.title).toBe("original");
        expect(drawn.revision).toBe(7);
        context.fill(GFXPath.rect({ x: 1, y: 1, width: 2, height: 2 }));
      } }] };
    } });
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    const exporting = prepared.output.exportPDF();
    await entered.promise;
    canonical.revision = 8;
    canonical.model.nested.title = "later canonical edit";
    drawing.resolve();
    const result = await exporting;
    expect(result.status).toBe("exported");
    expect(order).toEqual(["settle", "capture"]);
    expect(result.receipt).toMatchObject({ revision: 7, configurationId: "fixed-private-engine", readiness: "complete", pageUnit: "pt", pages: [{ width: 200, height: 300, rotation: 90 }] });
    if (result.status !== "exported") return;
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 200, height: 300 });
    expect(pdf.getPage(0).getRotation().angle).toBe(90);
  });

  it("refuses settlement before capture or retaining anything", async () => {
    const create = await preparation();
    let captures = 0;
    const result = await create<Model>({ settle: () => ({ status: "refused", reason: "IME draft refused" }), capture: () => { captures++; return snapshot(); } })
      .prepare({ engine });
    expect(result.status).toBe("refused");
    if (result.status === "prepared") throw new Error("Unexpected prepared output");
    expect(result.receipt.revision).toBeNull();
    expect(captures).toBe(0);
  });

  it.each([
    { status: "refused" as const, expected: "refused", detail: "IME participant refused" },
    { status: "revoked" as const, expected: "canceled", detail: "document-revoked" },
  ])("uses the shared editing barrier's $status detail", async ({ status, expected, detail }) => {
    const create = await preparation();
    const result = await create<Model>({ capture: snapshot, settle: () => status === "refused" ? {
      status, documentId: "doc:output", reason: "export", participantId: "ime", refusalReason: detail, issues: [], settledParticipantIds: [],
    } : { status, documentId: "doc:output", reason: "export", revocationReason: "document-revoked", settledParticipantIds: [] } })
      .prepare({ engine });
    expect(result.status).toBe(expected);
    if (result.status === "prepared") throw new Error("Unexpected prepared output");
    expect(result.receipt.reason).toBe(detail);
  });

  it.each(["pending", "missing", "unsupported"] as const)("reports required %s resources and releases earlier leases", async status => {
    const create = await preparation();
    let releases = 0;
    const result = await create(dependencies()).prepare({ engine: () => ({ pages: [], dependencies: [
      { id: "font:ready", kind: "font", retain: () => ({ status: "retained", lease: { value: {}, release: () => { releases++; } } }) },
      { id: "image:required", kind: "resource", retain: () => ({ status, reason: "not ready" }) },
    ] }) });
    expect(result.status).toBe(status === "unsupported" ? status : `${status}-resources`);
    if (result.status === "prepared") throw new Error("Unexpected prepared output");
    expect(result.receipt.dependencies).toContainEqual({ id: "image:required", kind: "resource", status, reason: "not ready" });
    expect(releases).toBe(1);
  });

  it("releases every acquired lease exactly once after a later retain throws", async () => {
    const create = await preparation();
    const releases: string[] = [];
    const result = await create(dependencies()).prepare({ engine: () => ({ pages: [], dependencies: [
      { id: "font", kind: "font", retain: () => ({ status: "retained", lease: { value: {}, release: () => { releases.push("font"); } } }) },
      { id: "image", kind: "resource", retain: () => { throw new Error("injected retain failure"); } },
    ] }) });
    expect(result.status).toBe("failed");
    if (result.status === "prepared") throw new Error("Unexpected prepared output");
    expect(result.receipt.reason).toContain("injected retain failure");
    expect(releases).toEqual(["font"]);
  });

  it("requires explicit fallback acceptance and identifies the requested and actual font", async () => {
    const create = await preparation();
    let releases = 0;
    const fallbackEngine: DocumentOutputEngine<Model> = () => ({ pages: [{ geometry: { width: 10, height: 20 }, draw() {} }], dependencies: [
      { id: "font", kind: "font", retain: () => ({ status: "retained", lease: { value: {}, release: () => { releases++; } }, fallback: { requested: "Requested family", actual: "Noto Sans", reason: "requested font absent" } }) },
    ] });
    const rejected = await create(dependencies()).prepare({ engine: fallbackEngine });
    expect(rejected.status).toBe("unsupported");
    expect(releases).toBe(1);
    const accepted = await create(dependencies()).prepare({ engine: fallbackEngine, acceptFallbacks: true });
    expect(accepted.status).toBe("prepared");
    if (accepted.status !== "prepared") return;
    expect(accepted.output.receipt.readiness).toBe("accepted-fallback");
    expect(accepted.output.receipt.fallbacks).toEqual([{ dependencyId: "font", requested: "Requested family", actual: "Noto Sans", reason: "requested font absent" }]);
    expect((await accepted.output.exportPDF()).status).toBe("exported");
    accepted.output.release();
    expect(releases).toBe(2);
  });

  it("cancels a hung retain promptly and releases its late lease once", async () => {
    const create = await preparation();
    const controller = new AbortController();
    const entered = deferred<void>();
    const late = deferred<{ status: "retained"; lease: DocumentOutputLease }>();
    const releases: string[] = [];
    const work = create(dependencies()).prepare({ signal: controller.signal, engine: () => ({ pages: [], dependencies: [
      { id: "first", kind: "resource", retain: () => ({ status: "retained", lease: { value: {}, release: () => { releases.push("first"); } } }) },
      { id: "late", kind: "font", retain: () => { entered.resolve(); return late.promise; } },
    ] }) });
    await entered.promise;
    controller.abort();
    expect((await work).status).toBe("canceled");
    expect(releases).toEqual(["first"]);
    late.resolve({ status: "retained", lease: { value: {}, release: () => { releases.push("late"); } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(releases).toEqual(["first", "late"]);
  });

  it.each(["success", "drawing-failure", "cancel", "release"] as const)("drops prepared resource leases once on %s", async ending => {
    const create = await preparation();
    const controller = new AbortController();
    let releases = 0;
    const prepared = await create(dependencies()).prepare({ signal: controller.signal, engine: () => ({ dependencies: [
      { id: "asset", kind: "resource", retain: () => ({ status: "retained", lease: { value: "owned image", release: () => { releases++; } } }) },
    ], pages: [{ geometry: { width: 10, height: 20 }, draw(_context, { dependencies: retained }) {
      expect(retained.get("asset")).toBe("owned image");
      if (ending === "drawing-failure") throw new Error("draw failed");
    } }] }) });
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    if (ending === "cancel") controller.abort();
    if (ending === "release") prepared.output.release();
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe(ending === "success" ? "exported" : ending === "drawing-failure" ? "failed" : "canceled");
    prepared.output.release();
    prepared.output.release();
    expect(releases).toBe(1);
    expect(await prepared.output.exportPDF()).toBe(result);
  });

  it("freezes engine metadata and dependency identity before asynchronous retain", async () => {
    const create = await preparation();
    const entered = deferred<void>(), waiting = deferred<void>();
    let releases = 0;
    const metadata = { title: "captured output metadata" };
    const geometry = { width: 100, height: 200 };
    const dependency = { id: "original-font", kind: "font" as const, async retain() {
      entered.resolve(); await waiting.promise;
      return { status: "retained" as const, lease: { value: "font value", release() { releases++; } } };
    } };
    const pending = create(dependencies()).prepare({ engine: () => ({ metadata, dependencies: [dependency], pages: [{ geometry, draw(_context, drawing) {
      expect(drawing.dependencies.get("original-font")).toBe("font value");
    } }] }) });
    await entered.promise;
    metadata.title = "mutated engine metadata";
    geometry.width = 999;
    dependency.id = "changed-font";
    waiting.resolve();
    const prepared = await pending;
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.output.receipt.dependencies[0].id).toBe("original-font");
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe("exported");
    if (result.status !== "exported") return;
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getTitle()).toBe("captured output metadata");
    expect(pdf.getPage(0).getWidth()).toBe(100);
    expect(releases).toBe(1);
  });

  it("cancels hung drawing without waiting and drops leases before late drawing completes", async () => {
    const create = await preparation();
    const entered = deferred<void>(), waiting = deferred<void>();
    const controller = new AbortController();
    let releases = 0;
    const prepared = await create(dependencies()).prepare({ signal: controller.signal, engine: () => ({ dependencies: [
      { id: "resource", kind: "resource", retain: () => ({ status: "retained", lease: { value: {}, release() { releases++; } } }) },
    ], pages: [{ geometry: { width: 10, height: 20 }, async draw(context) {
      entered.resolve(); await waiting.promise;
      context.fill(GFXPath.rect({ x: 1, y: 1, width: 1, height: 1 }));
    } }] }) });
    if (prepared.status !== "prepared") throw new Error("Fixture preparation failed");
    const work = prepared.output.exportPDF();
    await entered.promise;
    controller.abort();
    expect((await work).status).toBe("canceled");
    expect(releases).toBe(1);
    waiting.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(releases).toBe(1);
  });

  it("continues cleanup after a lease release throws and reports the failure", async () => {
    const create = await preparation();
    const released: string[] = [];
    const prepared = await create(dependencies()).prepare({ engine: () => ({ dependencies: [
      { id: "first", kind: "resource", retain: () => ({ status: "retained", lease: { value: {}, release() { released.push("first"); } } }) },
      { id: "throws", kind: "font", retain: () => ({ status: "retained", lease: { value: {}, release() { released.push("throws"); throw new Error("release injected failure"); } } }) },
    ], pages: [{ geometry: { width: 10, height: 20 }, draw() {} }] }) });
    if (prepared.status !== "prepared") throw new Error("Fixture preparation failed");
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe("failed");
    expect(result.receipt.cleanupErrors).toEqual(["release injected failure"]);
    expect(released).toEqual(["throws", "first"]);
    expect(prepared.output.release()).toEqual(["release injected failure"]);
    expect(released).toHaveLength(2);
  });

  it("joins a reentrant export request made during drawing", async () => {
    const create = await preparation();
    let draws = 0;
    let joined: ReturnType<import("../../src/SynCloudOS/Documents/documentOutputTypes").PreparedDocumentOutput<Model>["exportPDF"]> | undefined;
    const prepared = await create(dependencies()).prepare({ engine: () => ({ pages: [{ geometry: { width: 10, height: 20 }, draw() {
      draws++;
      if (draws === 1 && prepared.status === "prepared") joined = prepared.output.exportPDF();
    } }] }) });
    if (prepared.status !== "prepared") throw new Error("Fixture failed");
    const exporting = prepared.output.exportPDF();
    const result = await exporting;
    expect(result.status).toBe("exported");
    expect(draws).toBe(1);
    expect(joined).toBe(exporting);
  });

  it("rejects engine page lifecycle changes that would falsify the geometry receipt", async () => {
    const create = await preparation();
    const prepared = await create(dependencies()).prepare({ engine: () => ({ pages: [{ geometry: { width: 10, height: 20 }, draw(context) {
      const unsafe = context as GFXPDFContext;
      unsafe.endPage();
      unsafe.beginPage({ width: 99, height: 77 });
    } }] }) });
    if (prepared.status !== "prepared") throw new Error("Fixture failed");
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe("failed");
    expect(result.receipt.reason).toContain("page lifecycle");
  });
});
