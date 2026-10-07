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
import { LUFXSearchableItem } from "../../../src/FX/LuminaFX/LUFXSearchableItem";
import { LUFX_TOKENIZER_VERSION } from "../../../src/FX/LuminaFX/LUFXTokenizer";
import {
  LuminaIndexMaintenance,
  type LuminaIndexMaintenanceBackend,
  type LuminaIndexMaintenanceDiagnostics,
} from "../../../src/SynCloudOS/LuminaFX/LuminaIndexMaintenance";
import { LuminaIndexService, type LuminaIndexBackendFactory } from "../../../src/SynCloudOS/LuminaFX/LuminaIndexService";
import { LuminaEligibilityRegistry } from "../../../src/SynCloudOS/LuminaFX/LuminaEligibility";
import { LUFXHostService } from "../../../src/SynCloudOS/LuminaFX/LUFXHostService";
import type { SynCloudOSPolicySubject } from "../../../src/SynCloudOS/PolicyKit/policyTypes";
import { createTestRuntime, createTestRuntimeEnvironment } from "../helpers";

function item(id: string, revision = "r1") {
  return new LUFXSearchableItem({
    id,
    domain: "notes",
    contentType: "note",
    title: `Title ${id}`,
    activation: { version: 1, kind: "named-route", routeName: "notes.item", parameters: { id } },
    revision,
  });
}

function backendFixture() {
  let diagnostics: LuminaIndexMaintenanceDiagnostics = Object.freeze({
    state: "ready",
    schemaVersion: 1,
    tokenizerVersion: LUFX_TOKENIZER_VERSION,
    checkpoint: Object.freeze({ generation: 2, revision: 3 }),
    itemCount: 1,
    approximateBytes: 128,
  });
  const calls: Array<{ operation: string; itemIds?: string[] }> = [];
  const backend: LuminaIndexMaintenanceBackend = {
    async replaceAll(items, metadata, signal) {
      signal?.throwIfAborted();
      calls.push({ operation: "replaceAll", itemIds: items.map((entry) => entry.id) });
      expect(metadata.tokenizerVersion).toBe(LUFX_TOKENIZER_VERSION);
      expect(metadata.expectedCheckpoint).toEqual(diagnostics.checkpoint);
      expect(metadata.expectedState).toBe(diagnostics.state);
      diagnostics = Object.freeze({
        state: "ready",
        schemaVersion: 1,
        tokenizerVersion: metadata.tokenizerVersion,
        checkpoint: Object.freeze({ generation: diagnostics.checkpoint.generation + 1, revision: diagnostics.checkpoint.revision + 1 }),
        itemCount: items.length,
        approximateBytes: items.length * 96,
      });
      return diagnostics;
    },
    async eraseOwner(signal) {
      signal?.throwIfAborted();
      calls.push({ operation: "eraseOwner" });
      diagnostics = Object.freeze({ ...diagnostics, state: "erased", checkpoint: Object.freeze({ generation: diagnostics.checkpoint.generation + 1, revision: diagnostics.checkpoint.revision + 1 }), itemCount: 0, approximateBytes: 0 });
      return diagnostics;
    },
    async diagnostics(signal) { signal?.throwIfAborted(); calls.push({ operation: "diagnostics" }); return diagnostics; },
    dispose: vi.fn(),
  };
  return { backend, calls };
}

describe("Lumina index maintenance", () => {
  it("rebuilds through one atomic backend replacement with the current tokenizer version", async () => {
    const fixture = backendFixture();
    const maintenance = new LuminaIndexMaintenance(fixture.backend);
    const result = await maintenance.rebuild([item("b"), item("a")]);
    expect(fixture.calls).toEqual([
      { operation: "diagnostics" },
      { operation: "replaceAll", itemIds: ["a", "b"] },
    ]);
    expect(result).toMatchObject({ state: "ready", tokenizerVersion: LUFX_TOKENIZER_VERSION, itemCount: 2 });
    expect(result.checkpoint).toEqual({ generation: 3, revision: 4 });
    maintenance.dispose();
    expect(fixture.backend.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate stable identities before backend side effects", async () => {
    const fixture = backendFixture();
    const maintenance = new LuminaIndexMaintenance(fixture.backend);
    await expect(maintenance.rebuild([item("same"), item("same", "r2")])).rejects.toThrow(/duplicate/i);
    expect(fixture.calls).toEqual([]);
    maintenance.dispose();
  });

  it("erases an owner through the backend tombstone and exposes host diagnostics", async () => {
    const fixture = backendFixture();
    const maintenance = new LuminaIndexMaintenance(fixture.backend);
    const erased = await maintenance.eraseOwner();
    expect(erased).toMatchObject({ state: "erased", itemCount: 0, approximateBytes: 0 });
    const diagnosed = await maintenance.diagnostics();
    expect(diagnosed.state).toBe("erased");
    expect(fixture.calls.map((entry) => entry.operation)).toEqual(["eraseOwner", "diagnostics"]);
    maintenance.dispose();
  });

  it("honours cancellation before maintenance reaches storage and rejects after disposal", async () => {
    const fixture = backendFixture();
    const maintenance = new LuminaIndexMaintenance(fixture.backend);
    const cancelled = new AbortController();
    cancelled.abort(new DOMException("cancelled", "AbortError"));
    await expect(maintenance.rebuild([item("a")], { signal: cancelled.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.calls).toEqual([]);
    maintenance.dispose();
    await expect(maintenance.diagnostics()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps maintenance owner identity host-bound through LuminaIndexService", async () => {
    const fixture = backendFixture();
    const owners: string[] = [];
    const backend = Object.assign(fixture.backend, {
      mutate: vi.fn(),
      snapshot: vi.fn(),
    });
    const service = new LuminaIndexService({
      create(ownerKey) {
        owners.push(ownerKey);
        return backend;
      },
    } satisfies LuminaIndexBackendFactory);
    const owner = new AbortController();
    const maintenance = service.createMaintenance("com.syndromatic.notes", owner.signal);
    await maintenance.diagnostics();
    expect(owners).toEqual(["com.syndromatic.notes"]);
    owner.abort(new DOMException("owner ended", "AbortError"));
    await expect(maintenance.diagnostics()).rejects.toMatchObject({ name: "AbortError" });
    service.dispose();
  });

  it("erases donation checkpoints, live eligibility and the durable owner partition through the host", async () => {
    const calls: string[] = [];
    const factory: LuminaIndexBackendFactory = {
      create() {
        return {
          async mutate() { throw new Error("not used"); },
          async snapshot() { return { state: "ready", schemaVersion: 1, checkpoint: { generation: 0, revision: 0 }, items: [] }; },
          async replaceAll() { throw new Error("not used"); },
          async eraseOwner() {
            calls.push("erase-owner");
            return { state: "erased", schemaVersion: 1, tokenizerVersion: LUFX_TOKENIZER_VERSION, checkpoint: { generation: 1, revision: 1 }, itemCount: 0, approximateBytes: 0 };
          },
          async diagnostics() { throw new Error("not used"); },
          dispose() {},
        };
      },
    };
    const indexes = new LuminaIndexService(factory);
    const eligibility = new LuminaEligibilityRegistry(() => 1_000);
    eligibility.registerProjection({ ownerAppId: "notes", domain: "notes", destinationAppId: "notes", routeName: "notes.item" });
    const subject: SynCloudOSPolicySubject = { user: { id: "tester", displayName: "Tester" }, role: "user", capabilities: [], isAuthenticated: true };
    const host = new LUFXHostService({
      runtimeId: "runtime",
      indexes,
      eligibility,
      policy: { getCurrentSubject: () => subject, authorise: () => ({ allowed: true }) },
      subscribeState: () => () => {},
      apps: { getApp: () => null },
      routes: { getAppForRoute: () => null, openRoute: () => null },
      presentationSettlements: { get: () => null },
      randomUUID: () => "uuid",
    });
    const clear = vi.fn();
    host.createDonationCoordinator({
      ownerAppId: "notes",
      domain: "notes",
      checkpointStore: { load: () => null, save: () => {}, clear },
      readSource: async () => [],
      project: () => { throw new Error("not used"); },
      now: () => 1_000,
    });

    await host.eraseOwner("notes");

    expect(clear).toHaveBeenCalledTimes(1);
    expect(eligibility.owners()).toEqual([]);
    expect(calls).toEqual(["erase-owner"]);
    host.dispose();
    indexes.dispose();
  });

  it("routes application uninstall through runtime-owned Lumina erasure", async () => {
    const erasedOwners: string[] = [];
    const environment = {
      ...createTestRuntimeEnvironment(),
      luminaIndex: {
        create(ownerKey: string) {
          return {
            async mutate() { throw new Error("not used"); },
            async snapshot() { return { state: "ready" as const, schemaVersion: 1, checkpoint: { generation: 0, revision: 0 }, items: [] }; },
            async replaceAll() { throw new Error("not used"); },
            async eraseOwner() {
              erasedOwners.push(ownerKey);
              return { state: "erased" as const, schemaVersion: 1, tokenizerVersion: LUFX_TOKENIZER_VERSION, checkpoint: { generation: 1, revision: 1 }, itemCount: 0, approximateBytes: 0 };
            },
            async diagnostics() { throw new Error("not used"); },
            dispose() {},
          };
        },
      } satisfies LuminaIndexBackendFactory,
    };
    const runtime = createTestRuntime({ id: "lumina-uninstall", environment });
    runtime.store.mutate((draft) => { draft.lifecycle.notes = "active"; });
    runtime.store.mutate((draft) => { delete draft.lifecycle.notes; });

    await vi.waitFor(() => expect(erasedOwners).toEqual(["notes"]));
    await runtime.dispose({ reason: "test complete", inFlight: "cancel" });
  });
});
