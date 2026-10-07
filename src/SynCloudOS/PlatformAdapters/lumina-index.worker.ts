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

import { assertLuminaEligibilityRestriction, IndexedDBLuminaBackend, luminaRestrictionMatcher } from "../LuminaFX/platformAdapterIndexBackend";
import { LUFXSearchableItem, type LUFXSearchableItemJSON } from "../../FX/LuminaFX/LUFXSearchableItem";
import { LUFXQueryPlanner } from "../../FX/LuminaFX/LUFXQueryPlanner";
import { prepareLUFXItems } from "../../FX/LuminaFX/LUFXRanker";
import type { LUFXIndexSnapshot } from "../../FX/LuminaFX/LUFXIndex";
import type { LUFXSuggestionResult } from "../../FX/LuminaFX/LUFXSuggestions";
import type {
  LuminaIndexMaintenanceDiagnostics,
  LuminaWorkerQueryResultPage,
  LuminaWorkerRequest,
  LuminaWorkerResponse,
  LuminaWorkerValue,
} from "../HostServices/PlatformAdapterRuntimePorts";

const scope = globalThis as unknown as {
  indexedDB: IDBFactory;
  postMessage(message: LuminaWorkerResponse): void;
  onmessage: ((event: MessageEvent<LuminaWorkerRequest>) => void) | null;
};
const backends = new Map<string, IndexedDBLuminaBackend>();
const operations = new Map<number, AbortController>();
const querySnapshots = new Map<string, LUFXIndexSnapshot>();
const ownerEpochs = new Map<string, number>();
const replacementBatches = new Map<string, Readonly<{
  identity: string;
  epoch: number;
  metadata: Extract<LuminaWorkerRequest, { operation: "replace-all-begin" }>["metadata"];
  items: LUFXSearchableItemJSON[];
}>>();

function key(databaseName: string, ownerKey: string): string { return `${databaseName}\u0000${ownerKey}`; }
function batchKey(identity: string, batchId: number): string { return `${identity}\u0000${batchId}`; }

function epoch(identity: string): number { return ownerEpochs.get(identity) ?? 0; }

function invalidateReplacementBatches(identity: string): void {
  ownerEpochs.set(identity, epoch(identity) + 1);
  for (const [batch, value] of replacementBatches) if (value.identity === identity) replacementBatches.delete(batch);
}

function backend(databaseName: string, ownerKey: string): IndexedDBLuminaBackend {
  const identity = key(databaseName, ownerKey);
  const existing = backends.get(identity);
  if (existing) return existing;
  const created = new IndexedDBLuminaBackend({ indexedDB: scope.indexedDB, databaseName, ownerKey });
  backends.set(identity, created);
  return created;
}

function errorPayload(error: unknown): Readonly<{ name: string; message: string }> {
  if (error instanceof Error) return Object.freeze({ name: error.name || "Error", message: error.message });
  return Object.freeze({ name: "Error", message: String(error) });
}

/** The owner's index hydrated at its current checkpoint, reused by queries
 * and suggestions until a mutation, replacement or erasure moves it. */
async function hydratedSnapshot(ownerBackend: IndexedDBLuminaBackend, identity: string, signal: AbortSignal, purpose: string): Promise<LUFXIndexSnapshot> {
  const checkpoint = await ownerBackend.checkpoint(signal);
  if (checkpoint.state !== "ready") throw new DOMException(`Lumina index requires rebuilding before ${purpose}.`, "InvalidStateError");
  let hydrated = querySnapshots.get(identity);
  if (!hydrated
    || hydrated.checkpoint.generation !== checkpoint.checkpoint.generation
    || hydrated.checkpoint.revision !== checkpoint.checkpoint.revision) {
    const snapshot = await ownerBackend.snapshot(signal);
    hydrated = Object.freeze({
      ...snapshot,
      items: Object.freeze(snapshot.items.map((item) => LUFXSearchableItem.fromJSON(item))),
    });
    querySnapshots.set(identity, hydrated);
  }
  return hydrated;
}

async function suggestBackend(
  ownerBackend: IndexedDBLuminaBackend,
  identity: string,
  request: Extract<LuminaWorkerRequest, { operation: "suggest" }>,
  signal: AbortSignal,
): Promise<LUFXSuggestionResult> {
  const hydrated = await hydratedSnapshot(ownerBackend, identity, signal, "suggestions");
  const result = new LUFXQueryPlanner().suggest(hydrated, request.query, { signal, limit: request.limit, maximumBytes: request.maximumBytes });
  return Object.freeze({ suggestions: Object.freeze([...result.suggestions]) });
}

async function queryBackend(
  ownerBackend: IndexedDBLuminaBackend,
  identity: string,
  request: Extract<LuminaWorkerRequest, { operation: "query" }>,
  signal: AbortSignal,
): Promise<LuminaWorkerQueryResultPage> {
  let hydrated = await hydratedSnapshot(ownerBackend, identity, signal, "query");
  if (request.restriction !== undefined) {
    // An eligible query plans over the eligible items only, exactly as the
    // main thread would after filtering a snapshot.
    assertLuminaEligibilityRestriction(request.restriction);
    const matches = luminaRestrictionMatcher(request.restriction);
    hydrated = Object.freeze({ ...hydrated, items: Object.freeze(hydrated.items.filter(matches)) });
  }
  const result = new LUFXQueryPlanner().execute(hydrated, request.query, {
    signal,
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
  });
  return Object.freeze({
    checkpoint: Object.freeze({ ...result.checkpoint }),
    tokenizerVersion: result.tokenizerVersion,
    rankerVersion: result.rankerVersion,
    results: Object.freeze(result.results.map((entry) => Object.freeze({
      item: entry.item.toJSON(),
      score: entry.score,
      snippet: entry.snippet,
    }))),
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
  });
}

async function replaceAllBackend(
  ownerBackend: IndexedDBLuminaBackend,
  identity: string,
  items: readonly LUFXSearchableItemJSON[],
  metadata: Extract<LuminaWorkerRequest, { operation: "replace-all" }>["metadata"],
  signal: AbortSignal,
): Promise<LuminaIndexMaintenanceDiagnostics> {
  const value = await ownerBackend.replaceAll(items, metadata, signal);
  const snapshot = Object.freeze({
    state: "ready" as const,
    schemaVersion: value.schemaVersion,
    checkpoint: Object.freeze({ ...value.checkpoint }),
    items: Object.freeze(items.map((item) => LUFXSearchableItem.fromJSON(item))),
  });
  prepareLUFXItems(snapshot.items, "en");
  querySnapshots.set(identity, snapshot);
  return value;
}

scope.onmessage = (event) => {
  const request = event.data;
  if (request.operation === "cancel") {
    operations.get(request.id)?.abort(new DOMException("Lumina worker operation cancelled.", "AbortError"));
    return;
  }
  if (request.operation === "dispose-owner") {
    const identity = key(request.databaseName, request.ownerKey);
    backends.get(identity)?.dispose();
    backends.delete(identity);
    querySnapshots.delete(identity);
    invalidateReplacementBatches(identity);
    scope.postMessage({ id: request.id, ok: true, value: null });
    return;
  }
  const controller = new AbortController();
  operations.set(request.id, controller);
  const identity = key(request.databaseName, request.ownerKey);
  const ownerBackend = backend(request.databaseName, request.ownerKey);
  let action: Promise<LuminaWorkerValue>;
  switch (request.operation) {
    case "mutate":
      action = ownerBackend.mutate(request.mutation, controller.signal).then((value) => {
        querySnapshots.delete(identity);
        return value;
      });
      break;
    case "snapshot":
      action = ownerBackend.snapshot(controller.signal);
      break;
    case "replace-all":
      action = replaceAllBackend(ownerBackend, identity, request.items, request.metadata, controller.signal);
      break;
    case "replace-all-begin": {
      const key = batchKey(identity, request.batchId);
      const expectedEpoch = epoch(identity);
      replacementBatches.set(key, Object.freeze({ identity, epoch: expectedEpoch, metadata: request.metadata, items: [] }));
      action = Promise.resolve(null);
      break;
    }
    case "replace-all-chunk": {
      const key = batchKey(identity, request.batchId);
      const batch = replacementBatches.get(key);
      if (!batch || batch.epoch !== epoch(identity)) {
        action = Promise.reject(new DOMException("Lumina replacement batch is stale.", "InvalidStateError"));
        break;
      }
      if (batch.items.length + request.items.length > 100_000) {
        replacementBatches.delete(key);
        action = Promise.reject(new RangeError("Lumina replacement batch exceeds 100000 items."));
        break;
      }
      batch.items.push(...request.items);
      action = Promise.resolve(null);
      break;
    }
    case "replace-all-commit": {
      const key = batchKey(identity, request.batchId);
      const batch = replacementBatches.get(key);
      replacementBatches.delete(key);
      if (!batch || batch.epoch !== epoch(identity)) {
        action = Promise.reject(new DOMException("Lumina replacement batch is stale.", "InvalidStateError"));
        break;
      }
      action = replaceAllBackend(ownerBackend, identity, batch.items, batch.metadata, controller.signal);
      break;
    }
    case "replace-all-abort":
      replacementBatches.delete(batchKey(identity, request.batchId));
      action = Promise.resolve(null);
      break;
    case "erase-owner":
      invalidateReplacementBatches(identity);
      action = ownerBackend.eraseOwner(controller.signal).then((value) => {
        querySnapshots.delete(identity);
        return value;
      });
      break;
    case "diagnostics":
      action = ownerBackend.diagnostics(controller.signal);
      break;
    case "query":
      action = queryBackend(ownerBackend, identity, request, controller.signal);
      break;
    case "suggest":
      action = suggestBackend(ownerBackend, identity, request, controller.signal);
      break;
  }
  void action.then(
    (value) => scope.postMessage({ id: request.id, ok: true, value }),
    (error) => scope.postMessage({ id: request.id, ok: false, error: errorPayload(error) }),
  ).finally(() => operations.delete(request.id));
};
