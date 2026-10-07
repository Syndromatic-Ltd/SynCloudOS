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

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationDocument,
  DocumentUnavailableError,
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
} from "../../src/SynCloudOS/Documents";
import { createUndoManager } from "../../src/SynCloudOS/Undo";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const environment = createTestRuntimeEnvironment();
const runtime = createTestRuntime({ id: "runtime:application-document-autosave", environment });
afterEach(() => vi.useRealTimers());
afterAll(() => runtime.dispose("test"));

function makeDocument(adapter = new InMemoryDocumentAdapter(environment), onWillSave?: (body: string) => void) {
  const id = environment.randomUUID();
  return ApplicationDocument.create({
    id,
    type: { ...noteType, autosave: { mode: "debounced", delayMs: 500 } },
    location: { kind: "memory", namespace: "autosave", key: id },
    adapter,
    recovery: new InMemoryDocumentRecoveryStore(),
    persistenceNamespace: "tests:autosave",
    environment,
    undoManager: createUndoManager({
      runtimeId: runtime.runtimeId,
      owner: { kind: "document", id },
      maxEntries: 100,
      randomUUID: environment.randomUUID,
    }),
    onWillSave: ({ content }) => onWillSave?.(content.body),
  });
}

describe("ApplicationDocument autosave", () => {
  it("debounces to the latest revision and suppresses saves while conflicted", async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const document = makeDocument(undefined, (body) => writes.push(body));
    document.update((model) => ({ ...model, body: "A" }), { actionName: "Type", coalescingKey: "body" });
    document.update((model) => ({ ...model, body: "AB" }), { actionName: "Type", coalescingKey: "body" });
    await vi.advanceTimersByTimeAsync(500);
    expect(writes).toEqual(["AB"]);

    document.enterConflict({
      base: document.lastSavedRecord,
      localModel: { ...document.model, body: "Local" },
      remote: { ...document.lastSavedRecord!, content: { ...document.model, body: "Remote" } },
    });
    document.update((model) => ({ ...model, title: "Still local" }), { actionName: "Rename" });
    await vi.advanceTimersByTimeAsync(500);
    expect(writes).toEqual(["AB"]);
  });

  it("keeps a newer edit dirty when an earlier serial save completes", async () => {
    const adapter = new InMemoryDocumentAdapter(environment);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalWrite = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write").mockImplementation(async (request) => {
      await gate;
      return originalWrite(request);
    });
    const document = makeDocument(adapter);
    document.update((model) => ({ ...model, body: "A" }), { actionName: "Type" });
    const saving = document.save({ reason: "explicit" });
    await vi.waitFor(() => expect(document.state).toBe("saving"));
    document.update((model) => ({ ...model, body: "AB" }), { actionName: "Type" });
    release();
    await saving;
    expect(document.model.body).toBe("AB");
    expect(document.state).toBe("dirty");
    expect(document.currentVersion?.sequence).toBe(1);
  });

  it("observes autosave failure without poisoning a later explicit save", async () => {
    vi.useFakeTimers();
    const adapter = new InMemoryDocumentAdapter(environment);
    const originalWrite = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write")
      .mockRejectedValueOnce(new DocumentUnavailableError("offline"))
      .mockImplementation(originalWrite);
    const document = makeDocument(adapter);
    document.update((model) => ({ ...model, body: "Retry me" }), { actionName: "Type" });
    await vi.advanceTimersByTimeAsync(500);
    expect(document.state).toBe("dirty");
    expect(document.lastError).toMatchObject({ code: "document-unavailable" });
    await document.save({ reason: "explicit" });
    expect(document.state).toBe("clean");
    expect(document.lastError).toBeNull();
  });

  it("recovers its serial save queue after a save observer throws", async () => {
    let invocation = 0;
    const id = environment.randomUUID();
    const document = ApplicationDocument.create({
      id,
      type: noteType,
      location: { kind: "memory", namespace: "autosave", key: id },
      adapter: new InMemoryDocumentAdapter(environment),
      recovery: new InMemoryDocumentRecoveryStore(),
      persistenceNamespace: "tests:autosave",
      environment,
      undoManager: createUndoManager({ runtimeId: runtime.runtimeId, owner: { kind: "document", id }, maxEntries: 100 }),
      onWillSave: () => {
        invocation += 1;
        if (invocation === 1) throw new Error("observer failed");
      },
    });
    document.update((model) => ({ ...model, body: "Safe" }), { actionName: "Type" });
    await expect(document.save({ reason: "explicit" })).rejects.toThrow("observer failed");
    expect(document.state).toBe("dirty");
    await expect(document.save({ reason: "explicit" })).resolves.toBeUndefined();
    expect(document.state).toBe("clean");
  });

  it("adopts a non-cooperating write that committed after cancellation", async () => {
    const adapter = new InMemoryDocumentAdapter(environment);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalWrite = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write").mockImplementation(async (request) => {
      await gate;
      return originalWrite({ ...request, signal: undefined });
    });
    const document = makeDocument(adapter);
    document.update((model) => ({ ...model, body: "Cancelled" }), { actionName: "Type" });
    const controller = new AbortController();
    const save = document.save({ reason: "explicit", signal: controller.signal });
    await vi.waitFor(() => expect(document.state).toBe("saving"));
    controller.abort("cancelled by test");
    release();
    await expect(save).resolves.toBeUndefined();
    expect(document.state).toBe("clean");
    expect(document.currentVersion?.sequence).toBe(1);
  });
});
