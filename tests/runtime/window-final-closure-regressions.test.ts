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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryDocumentAdapter,
  type DocumentLocation,
  type DocumentStorageAdapter,
} from "../../src/SynCloudOS/Documents";
import type {
  WindowContentController,
  WindowContentDescriptor,
  WindowRestorationSnapshot,
} from "../../src/SynCloudOS/Windows";
import {
  createWindowTestDependencies,
  standardWindow,
} from "../fixtures/windowTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function readyContent(
  descriptor: WindowContentDescriptor,
  id: string,
  overrides: Partial<WindowContentController> = {},
): WindowContentController {
  return {
    mountKey: `closure:${id}`,
    responderId: `control:${id}:closure`,
    load: vi.fn(async () => undefined),
    prepareClose: vi.fn(async () => ({
      status: "ready" as const,
      token: `close:${id}`,
      commit: vi.fn(),
      rollback: vi.fn(),
    })),
    unload: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function throwingFrameCancellationEnvironment() {
  const environment = createTestRuntimeEnvironment();
  return {
    ...environment,
    requestAnimationFrame: vi.fn(() => "held-frame"),
    cancelAnimationFrame: vi.fn(() => { throw new Error("frame cancellation failed"); }),
  };
}

function rejectingDiscardAdapter(
  fixture: ReturnType<typeof createWindowTestDependencies>,
  rejectedKey: string,
): DocumentStorageAdapter {
  const backing = new InMemoryDocumentAdapter(fixture.runtime.environment);
  return {
    id: "selected-close-memory",
    capabilities: backing.capabilities,
    supports: (location) => backing.supports(location),
    read: (location, options) => backing.read(location, options),
    write: (request) => backing.write(request),
    remove: (location, version, options) => backing.remove(location, version, options),
    list: (query) => backing.list(query),
    listVersions: (location, options) => backing.listVersions(location, options),
    readVersion: (location, version, options) => backing.readVersion(location, version, options),
    beginCloseTransaction: (location, options) => backing.beginCloseTransaction(location, options),
    isSynchronisationPending: () => true,
    discardPendingSynchronisation: vi.fn(async (location: DocumentLocation) => {
      if (location.kind === "memory" && location.key === rejectedKey) {
        throw new Error("second discard failed");
      }
    }),
  };
}

describe("selected document-set close authority", () => {
  it("refuses presentation roots that do not cover every selected document association", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const document = await fixture.runtime.documents.newDocument({
      documentId: "coverage-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    });
    const associated = fixture.manager.create(standardWindow("coverage-associated", {
      documentId: document.id,
      documentAssociationRole: "primary",
    }));
    const unrelated = fixture.manager.create(standardWindow("coverage-unrelated"));
    await fixture.manager.open(associated.id);
    await fixture.manager.open(unrelated.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });

    await expect(fixture.runtime.documents.prepareCloseDocuments(
      [document.id],
      "application-quit",
      undefined,
      [unrelated.id],
    )).resolves.toMatchObject({ status: "cancelled" });
    expect(fixture.runtime.documents.getDocument(document.id)).toBe(document);
    expect(fixture.manager.list().map(({ id }) => id)).toEqual([associated.id, unrelated.id]);
  });

  it("keeps every document and window live when the second synchronisation discard rejects", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    fixture.runtime.documents.registerAdapter(rejectingDiscardAdapter(fixture, "second"));
    const firstLocation = { kind: "memory", namespace: "selected-close", key: "first" } as const;
    const secondLocation = { kind: "memory", namespace: "selected-close", key: "second" } as const;
    const firstDocument = await fixture.runtime.documents.newDocument({
      documentId: "selected-first-document",
      typeId: noteType.id,
      location: firstLocation,
      applicationId: "com.syndromatic.Notes",
    });
    const secondDocument = await fixture.runtime.documents.newDocument({
      documentId: "selected-second-document",
      typeId: noteType.id,
      location: secondLocation,
      applicationId: "com.syndromatic.Notes",
    });
    firstDocument.update((model) => ({ ...model, body: "first dirty" }), { actionName: "Type" });
    secondDocument.update((model) => ({ ...model, body: "second dirty" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    const firstWindow = fixture.manager.create(standardWindow("selected-first-window", {
      documentId: firstDocument.id,
      documentAssociationRole: "primary",
    }));
    const secondWindow = fixture.manager.create(standardWindow("selected-second-window", {
      documentId: secondDocument.id,
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(firstWindow.id);
    await fixture.manager.open(secondWindow.id);

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).rejects.toThrow("second discard failed");

    expect(fixture.runtime.documents.getDocument(firstDocument.id)).toBe(firstDocument);
    expect(fixture.runtime.documents.getDocument(secondDocument.id)).toBe(secondDocument);
    expect(fixture.manager.list({ applicationId: "com.syndromatic.Notes" }).map(({ id }) => id)).toEqual([
      firstWindow.id,
      secondWindow.id,
    ]);
  });

  it("reserves the application forest before document review and refuses a late cross-document child", async () => {
    const reviewEntered = deferred<void>();
    const finishReview = deferred<"cancel">();
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const firstDocument = await fixture.runtime.documents.newDocument({
      documentId: "reserved-first-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    });
    const secondDocument = await fixture.runtime.documents.newDocument({
      documentId: "reserved-second-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    });
    firstDocument.update((model) => ({ ...model, body: "review me" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({
      review: vi.fn(async () => {
        reviewEntered.resolve();
        return finishReview.promise;
      }),
    });
    const root = fixture.manager.create(standardWindow("reserved-document-root", {
      documentId: firstDocument.id,
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(root.id);

    const closing = fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    });
    await reviewEntered.promise;
    let lateError: unknown = null;
    try {
      fixture.manager.create(standardWindow("late-other-document-child", {
        parentWindowControllerId: root.id,
        documentId: secondDocument.id,
        documentAssociationRole: "primary",
      }));
    } catch (error) {
      lateError = error;
    }
    finishReview.resolve("cancel");
    await expect(closing).resolves.toMatchObject({ outcome: "cancelled" });
    expect(lateError).toBeInstanceOf(Error);
    expect(String(lateError)).toMatch(/closing|reserved|transition/i);
  });

  it("closes a mixed non-document root and final-document child without colliding with its own reservation", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("mixed-child-document");
    const root = fixture.manager.create(standardWindow("mixed-root"));
    const child = fixture.manager.create(standardWindow("mixed-document-child", {
      parentWindowControllerId: root.id,
      documentId: "mixed-child-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(root.id);
    await fixture.manager.open(child.id);
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.manager.list()).toEqual([]);
    expect(fixture.runtime.documents.getDocument("mixed-child-document")).toBeNull();
  });

  it("prevalidates a stale window token before removing any selected document or window", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("stale-first-document");
    await fixture.createDocument("stale-second-document");
    const first = fixture.manager.create(standardWindow("stale-first-window", {
      documentId: "stale-first-document",
      documentAssociationRole: "primary",
    }));
    const second = fixture.manager.create(standardWindow("stale-second-window", {
      documentId: "stale-second-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    const originalValidate = fixture.manager.validateClose.bind(fixture.manager);
    let validations = 0;
    vi.spyOn(fixture.manager, "validateClose").mockImplementation((token) => {
      originalValidate(token);
      validations += 1;
      if (validations === 2) fixture.manager.rollbackClose(token);
    });

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).rejects.toThrow(/stale|invalid|preparation/i);
    expect(fixture.manager.list().map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(fixture.runtime.documents.getDocument("stale-first-document")).not.toBeNull();
    expect(fixture.runtime.documents.getDocument("stale-second-document")).not.toBeNull();
  });

  it("closes a nested cross-document forest exactly once through one selected-set token", async () => {
    const contents = new Map<string, WindowContentController>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => {
        const content = readyContent(descriptor, id);
        contents.set(id, content);
        return content;
      },
    });
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("nested-parent-document");
    await fixture.createDocument("nested-child-document");
    const parent = fixture.manager.create(standardWindow("nested-parent-window", {
      documentId: "nested-parent-document",
      documentAssociationRole: "primary",
    }));
    const child = fixture.manager.create(standardWindow("nested-child-window", {
      parentWindowControllerId: parent.id,
      documentId: "nested-child-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(child.id);
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.manager.list()).toEqual([]);
    expect(fixture.runtime.documents.getDocument("nested-parent-document")).toBeNull();
    expect(fixture.runtime.documents.getDocument("nested-child-document")).toBeNull();
    expect(contents.get(parent.id)?.dispose).toHaveBeenCalledOnce();
    expect(contents.get(child.id)?.dispose).toHaveBeenCalledOnce();
  });

  it("isolates a second structural undo cleanup failure and still closes the exact set", async () => {
    const observed: string[] = [];
    const fixture = createWindowTestDependencies({
      observeError: (error, context) => observed.push(`${context}:${String(error)}`),
    });
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("cleanup-first-document");
    await fixture.createDocument("cleanup-second-document");
    const first = fixture.manager.create(standardWindow("cleanup-first-window", {
      documentId: "cleanup-first-document",
      documentAssociationRole: "primary",
    }));
    const second = fixture.manager.create(standardWindow("cleanup-second-window", {
      documentId: "cleanup-second-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    const originalRemove = fixture.undo.remove.bind(fixture.undo);
    vi.spyOn(fixture.undo, "remove").mockImplementation((owner) => {
      if (owner.kind === "window" && owner.id === second.id) throw new Error("second window undo exploded");
      return originalRemove(owner);
    });

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.manager.list()).toEqual([]);
    expect(fixture.runtime.documents.openDocuments).toEqual([]);
    expect(observed).toContainEqual(expect.stringContaining("second window undo exploded"));
  });

  it("dissociates only uncovered records and preserves a non-final document presentation", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("selected-final-document");
    await fixture.createDocument("retained-shared-document");
    const selected = fixture.manager.create(standardWindow("selected-final-window", {
      applicationId: "com.example.selected",
      applicationSessionId: "session-selected",
      documentId: "selected-final-document",
      documentAssociationRole: "primary",
    }));
    const insideShared = fixture.manager.create(standardWindow("inside-shared-window", {
      applicationId: "com.example.selected",
      applicationSessionId: "session-selected",
      documentId: "retained-shared-document",
      documentAssociationRole: "primary",
    }));
    const outsideShared = fixture.manager.create(standardWindow("outside-shared-window", {
      applicationId: "com.example.other",
      applicationSessionId: "session-other",
      documentId: "retained-shared-document",
      documentAssociationRole: "inspector",
    }));
    await fixture.manager.open(selected.id);
    await fixture.manager.open(insideShared.id);
    await fixture.manager.open(outsideShared.id);
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });

    await expect(fixture.manager.requestCloseApplication("com.example.selected", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.manager.list().map(({ id }) => id)).toEqual([outsideShared.id]);
    expect(fixture.runtime.documents.getDocument("selected-final-document")).toBeNull();
    expect(fixture.runtime.documents.getDocument("retained-shared-document")?.windowAssociations).toEqual([
      { windowControllerId: outsideShared.id, role: "inspector" },
    ]);
  });

  it("normalises overlapping explicit roots before preparing the selected forest", async () => {
    const contents = new Map<string, WindowContentController>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => {
        const content = readyContent(descriptor, id);
        contents.set(id, content);
        return content;
      },
    });
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("overlapping-roots-document");
    const parent = fixture.manager.create(standardWindow("overlapping-roots-parent", {
      documentId: "overlapping-roots-document",
      documentAssociationRole: "primary",
    }));
    const child = fixture.manager.create(standardWindow("overlapping-roots-child", {
      parentWindowControllerId: parent.id,
      documentId: "overlapping-roots-document",
      documentAssociationRole: "inspector",
    }));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(child.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const preparation = await fixture.runtime.documents.prepareCloseDocuments(
      ["overlapping-roots-document"],
      "application-quit",
      undefined,
      [parent.id, child.id],
    );
    if (preparation.status !== "ready") throw new Error("Expected selected close readiness.");

    expect(() => fixture.runtime.documents.commitCloseDocuments(preparation)).not.toThrow();
    expect(fixture.manager.list()).toEqual([]);
    expect(contents.get(parent.id)?.dispose).toHaveBeenCalledOnce();
    expect(contents.get(child.id)?.dispose).toHaveBeenCalledOnce();
  });

  it("uses collision-proof document/window tuples for exact dissociation coverage", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("a");
    await fixture.createDocument("a\u0000b");
    const selected = fixture.manager.create(standardWindow("b\u0000c", {
      documentId: "a",
      documentAssociationRole: "primary",
    }));
    const closingShared = fixture.manager.create(standardWindow("c", {
      parentWindowControllerId: selected.id,
      documentId: "a\u0000b",
      documentAssociationRole: "primary",
    }));
    const retainedShared = fixture.manager.create(standardWindow("nul-retained-window", {
      applicationId: "com.example.retained",
      applicationSessionId: "session-retained",
      documentId: "a\u0000b",
      documentAssociationRole: "inspector",
    }));
    await fixture.manager.open(selected.id);
    await fixture.manager.open(closingShared.id);
    await fixture.manager.open(retainedShared.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const preparation = await fixture.runtime.documents.prepareCloseDocuments(
      ["a"],
      "application-quit",
      undefined,
      [selected.id],
    );
    if (preparation.status !== "ready") throw new Error("Expected selected close readiness.");

    fixture.runtime.documents.commitCloseDocuments(preparation);
    expect(fixture.runtime.documents.getDocument("a\u0000b")?.windowAssociations).toEqual([
      { windowControllerId: retainedShared.id, role: "inspector" },
    ]);
  });

  it("isolates injected frame-cancellation failure during selected structural close", async () => {
    const environment = throwingFrameCancellationEnvironment();
    const observed: string[] = [];
    const fixture = createWindowTestDependencies({
      environment,
      observeError: (error, context) => observed.push(`${context}:${String(error)}`),
    });
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("frame-close-first-document");
    await fixture.createDocument("frame-close-second-document");
    const first = fixture.manager.create(standardWindow("frame-close-first-window", {
      documentId: "frame-close-first-document",
      documentAssociationRole: "primary",
    }));
    const second = fixture.manager.create(standardWindow("frame-close-second-window", {
      documentId: "frame-close-second-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    for (const id of [first.id, second.id]) {
      fixture.manager.scheduleBoundsChange(id, {
        kind: "delta",
        delta: { x: 1, y: 0, width: 0, height: 0 },
        reason: "keyboard-move",
      });
    }

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.manager.list()).toEqual([]);
    expect(fixture.runtime.documents.openDocuments).toEqual([]);
    expect(observed).toContainEqual(expect.stringContaining("frame cancellation failed"));
  });

  it("publishes selected document and window closure only after both structures agree", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("publication-first-document");
    await fixture.createDocument("publication-second-document");
    const firstDocument = fixture.runtime.documents.getDocument("publication-first-document");
    const secondDocument = fixture.runtime.documents.getDocument("publication-second-document");
    if (!firstDocument || !secondDocument) throw new Error("Expected both selected documents.");
    const first = fixture.manager.create(standardWindow("publication-first-window", {
      documentId: "publication-first-document",
      documentAssociationRole: "primary",
    }));
    const second = fixture.manager.create(standardWindow("publication-second-window", {
      documentId: "publication-second-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    fixture.runtime.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    const observations: Array<{
      readonly source: "first-document" | "second-document" | "documents" | "windows";
      readonly documents: number;
      readonly windows: number;
      readonly firstState: string;
      readonly secondState: string;
    }> = [];
    const capture = (source: "first-document" | "second-document" | "documents" | "windows") => observations.push({
      source,
      documents: fixture.runtime.documents.openDocuments.length,
      windows: fixture.manager.snapshot().windowControllerIds.length,
      firstState: firstDocument.state,
      secondState: secondDocument.state,
    });
    const unsubscribeFirst = firstDocument.subscribe(() => capture("first-document"));
    const unsubscribeSecond = secondDocument.subscribe(() => capture("second-document"));
    const unsubscribeDocuments = fixture.runtime.documents.subscribe(() => capture("documents"));
    const unsubscribeWindows = fixture.manager.subscribe(() => capture("windows"));

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    unsubscribeFirst();
    unsubscribeSecond();
    unsubscribeDocuments();
    unsubscribeWindows();

    expect(observations).toEqual([
      { source: "windows", documents: 0, windows: 0, firstState: "closed", secondState: "closed" },
      { source: "first-document", documents: 0, windows: 0, firstState: "closed", secondState: "closed" },
      { source: "second-document", documents: 0, windows: 0, firstState: "closed", secondState: "closed" },
      { source: "documents", documents: 0, windows: 0, firstState: "closed", secondState: "closed" },
    ]);
  });
});

describe("window resource ownership and restoration rollback", () => {
  it("removes and disposes every controller when injected frame cancellation throws", async () => {
    const environment = throwingFrameCancellationEnvironment();
    const observed: string[] = [];
    let content: WindowContentController | null = null;
    const fixture = createWindowTestDependencies({
      environment,
      observeError: (error, context) => observed.push(`${context}:${String(error)}`),
      contentFactory: (descriptor, id) => {
        content = readyContent(descriptor, id);
        return content;
      },
    });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("frame-disposal-window"));
    await fixture.manager.open(controller.id);
    fixture.manager.scheduleBoundsChange(controller.id, {
      kind: "delta",
      delta: { x: 1, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });

    expect(() => fixture.manager.dispose()).not.toThrow();
    expect(fixture.manager.diagnostics().controllerCount).toBe(0);
    expect(content?.dispose).toHaveBeenCalledOnce();
    expect(observed).toContainEqual(expect.stringContaining("frame cancellation failed"));
  });

  it("does not let a stale deferred-open cleanup retire a live sibling application", async () => {
    const heldLoad = deferred<void>();
    const loadEntered = deferred<void>();
    const contentById = new Map<string, WindowContentController>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => {
        const content = readyContent(descriptor, id, id === "deferred-owned-b" ? {
          load: vi.fn(async () => {
            loadEntered.resolve();
            await heldLoad.promise;
          }),
        } : {});
        contentById.set(id, content);
        return content;
      },
    });
    cleanups.push(fixture.cleanup);
    const first = fixture.manager.create(standardWindow("deferred-owned-a"));
    const second = fixture.manager.create(standardWindow("deferred-owned-b"));
    await fixture.manager.open(first.id);
    const opening = fixture.manager.open(second.id);
    await loadEntered.promise;
    await expect(fixture.manager.requestClose(second.id, { reason: "command" })).resolves.toMatchObject({ outcome: "closed" });
    heldLoad.resolve();
    await expect(opening).rejects.toThrow(/stale|closed|transition/i);

    expect(second.record.state).toBe("closed");
    expect(second.contentState.status).toBe("disposed");
    expect(fixture.responders.has("application:session-notes")).toBe(true);
    expect(fixture.undo.get({ kind: "application", id: "com.syndromatic.Notes" })).not.toBeNull();
    expect(fixture.responders.resolveChain(first.windowResponderId).map(({ id }) => id))
      .toContain("application:session-notes");
    expect(contentById.get(second.id)?.unload).toHaveBeenCalledOnce();
    expect(contentById.get(second.id)?.dispose).toHaveBeenCalledOnce();
  });

  it("finishes every controller disposal when application undo cleanup throws", async () => {
    const observed: string[] = [];
    const contents: WindowContentController[] = [];
    const fixture = createWindowTestDependencies({
      observeError: (error, context) => observed.push(`${context}:${String(error)}`),
      contentFactory: (descriptor, id) => {
        const content = readyContent(descriptor, id);
        contents.push(content);
        return content;
      },
    });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("throwing-application-undo"));
    await fixture.manager.open(controller.id);
    const originalRemove = fixture.undo.remove.bind(fixture.undo);
    vi.spyOn(fixture.undo, "remove").mockImplementation((owner) => {
      if (owner.kind === "application") throw new Error("application undo exploded");
      return originalRemove(owner);
    });

    expect(() => fixture.manager.dispose()).not.toThrow();
    expect(fixture.manager.diagnostics().controllerCount).toBe(0);
    expect(controller.contentState.status).toBe("disposed");
    expect(contents[0]?.unload).toHaveBeenCalledOnce();
    expect(contents[0]?.dispose).toHaveBeenCalledOnce();
    expect(observed).toContainEqual(expect.stringContaining("application undo exploded"));
  });

  it("rejects invalid restored factory state before creating authority and genuinely retries", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.invalid-state", installationId: "invalid-state-installation" });
    cleanups.push(source.cleanup);
    source.manager.create(standardWindow("invalid-state-window"));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot())) as WindowRestorationSnapshot;
    let attempts = 0;
    const target = createWindowTestDependencies({
      namespace: "tests.invalid-state",
      installationId: "invalid-state-installation",
      contentRestore: vi.fn(async ({ descriptor }) => ({
        descriptor,
        state: ++attempts === 1 ? -0 : { restored: true },
      })),
    });
    cleanups.push(target.cleanup);

    const first = await target.manager.restoreWorkspace(snapshot);
    expect(first.failures).toEqual([expect.objectContaining({
      windowControllerId: "invalid-state-window",
      reason: "content-restore-failed",
    })]);
    expect(target.manager.diagnostics().controllerCount).toBe(0);
    expect(() => target.manager.select("invalid-state-window")).toThrow();

    const second = await target.manager.restoreWorkspace(snapshot);
    expect(second.failures).toEqual([]);
    expect(second.restoredWindowControllerIds).toEqual(["invalid-state-window"]);
    expect(second.reusedWindowControllerIds).toEqual([]);
    expect(attempts).toBe(2);
  });

  it.each(["", "null"])("treats present raw workspace bytes %j as corrupt, not missing", (raw) => {
    const environment = createTestRuntimeEnvironment();
    environment.localStorage!.setItem("syncloudos:windows.workspace-v1", raw);

    expect(() => createTestRuntime({ environment })).toThrow(/window restoration|persisted workspace|JSON|snapshot/i);
    expect(environment.localStorage!.getItem("syncloudos:windows.workspace-v1")).toBe(raw);
    expect(environment.localStorage!.getItem("syncloudos:windows.installation-id")).toBeNull();
  });

  it.each(["", "null"])("preserves present corrupt installation identity bytes %j without minting", (raw) => {
    const environment = createTestRuntimeEnvironment();
    environment.localStorage!.setItem("syncloudos:windows.installation-id", raw);

    expect(() => createTestRuntime({ environment })).toThrow(/window restoration|persisted window|JSON|null/i);
    expect(environment.localStorage!.getItem("syncloudos:windows.installation-id")).toBe(raw);
    expect(environment.localStorage!.getItem("syncloudos:windows.workspace-v1")).toBeNull();
  });
});
