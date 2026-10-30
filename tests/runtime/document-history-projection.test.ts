import { afterEach, describe, expect, it, vi } from "vitest";
import { editDocumentFixture } from "../fixtures/documentEditFixture";
import { noteType } from "../fixtures/noteDocumentType";
import { DocumentTypeRegistry } from "../../src/SynCloudOS/Documents/DocumentTypeRegistry";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo/undoTypes";

interface Model { content: string; provider: { etag: string; pending: boolean } }
const initial: Model = { content: "before", provider: { etag: "v1", pending: false } };
const history = {
  captureContent: (model: Readonly<Model>) => ({ content: model.content }),
  restoreContent: (historical: Readonly<Model>, current: Readonly<Model>): Model => ({ ...current, content: historical.content }),
};
function typeWith(projection = history): DocumentType<Model> {
  return { ...noteType, id: "test.projected", create: () => initial, read: value => value, write: value => value,
    validate: (value): value is Model => Boolean(value && typeof value === "object" && typeof (value as Model).content === "string" && typeof (value as Model).provider?.etag === "string"),
    history: projection };
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture(type = typeWith()) { const result = editDocumentFixture(type); cleanups.push(result.cleanup); return result; }
function edit(document: ReturnType<typeof fixture>["document"], content: string, coalescingKey?: string) {
  document.update(current => ({ ...current, content }), { actionName: "Edit", coalescingKey });
}
function ack(document: ReturnType<typeof fixture>["document"], etag: string) {
  document.update(current => ({ ...current, provider: { etag, pending: false } }), { actionName: "Acknowledge", recordUndo: false });
}

describe("document history content projection", () => {
  it("retains canonical undo across acknowledgements and merges current provider metadata on undo/redo", async () => {
    const { document } = fixture(); edit(document, "edited"); ack(document, "v2");
    expect(document.undoManager.canUndo).toBe(true);
    expect(await document.undoManager.undo()).toMatchObject({ status: "completed" });
    expect(document.model).toEqual({ content: "before", provider: { etag: "v2", pending: false } });
    ack(document, "v3");
    expect(await document.undoManager.redo()).toMatchObject({ status: "completed" });
    expect(document.model).toEqual({ content: "edited", provider: { etag: "v3", pending: false } });
  });

  it("snapshots the projection callbacks with the registered document type", () => {
    const type = typeWith(); const registry = new DocumentTypeRegistry(); registry.register(type);
    expect(registry.require(type.id).history).toEqual(history);
    expect(Object.isFrozen(registry.require(type.id).history)).toBe(true);
  });

  it("preserves the original whole-model policy when no projection is declared", () => {
    const { history: _history, ...type } = typeWith();
    const { document } = fixture(type); edit(document, "edited"); ack(document, "v2");
    expect(document.undoManager.canUndo).toBe(false);
  });

  it("replays multiple entries while retaining metadata adopted between both directions", async () => {
    const { document } = fixture(); edit(document, "one"); edit(document, "two"); ack(document, "v2");
    await document.undoManager.undo(); expect(document.model.content).toBe("one");
    ack(document, "v3"); await document.undoManager.undo();
    expect(document.model).toEqual({ ...initial, provider: { etag: "v3", pending: false } });
    await document.undoManager.redo(); await document.undoManager.redo();
    expect(document.model).toEqual({ content: "two", provider: { etag: "v3", pending: false } });
  });

  it("closes typing coalescing on a metadata adoption", async () => {
    const { document } = fixture(); edit(document, "one", "typing"); ack(document, "v2"); edit(document, "two", "typing");
    expect(document.undoManager.inspect().entries).toHaveLength(2);
    await document.undoManager.undo(); expect(document.model.content).toBe("one");
  });

  it("clears obsolete undo and redo on external authored-content replacement", async () => {
    const { document } = fixture(); edit(document, "one"); edit(document, "two"); await document.undoManager.undo();
    document.update(current => ({ ...current, content: "remote" }), { actionName: "Remote", recordUndo: false });
    expect(document.undoManager.canUndo).toBe(false); expect(document.undoManager.canRedo).toBe(false);
    expect(document.model.content).toBe("remote");
  });

  it.each(["throw", "async", "invalid-json", "reenter"])("does not admit an invalid %s capture", failure => {
    const { document } = fixture(typeWith({ ...history, captureContent: model => {
      if (failure === "throw") throw new Error("capture failed");
      if (failure === "async") return Promise.reject(new Error("late capture")) as never;
      if (failure === "invalid-json") return new Map() as never;
      edit(document, "reentrant"); return history.captureContent(model);
    } }));
    const before = document.snapshot();
    expect(() => edit(document, "edited")).toThrow();
    expect(document.snapshot()).toBe(before); expect(document.undoManager.canUndo).toBe(false);
  });

  it.each(["throw", "async", "wrong-content", "invalid-model", "reenter"])("keeps model, revision, selection and history position on %s replay", async failure => {
    let document!: ReturnType<typeof fixture>["document"];
    ({ document } = fixture(typeWith({ ...history, restoreContent: (historical, current) => {
      expect(Object.isFrozen(historical)).toBe(true); expect(Object.isFrozen(current.provider)).toBe(true);
      if (failure === "throw") throw new Error("restore failed");
      if (failure === "async") return Promise.reject(new Error("late restore")) as never;
      if (failure === "wrong-content") return { ...current };
      if (failure === "invalid-model") return { ...current, content: 7 } as never;
      edit(document, "reentrant"); return history.restoreContent(historical, current);
    } })));
    const restoreSelection = vi.fn();
    document.update(current => ({ ...current, content: "edited" }), { actionName: "Edit", selection: { before: { offset: 0 }, after: { offset: 1 } }, restoreSelection });
    ack(document, "v2"); const before = document.snapshot(); const cursor = document.undoManager.inspect().cursor;
    expect(await document.undoManager.undo()).toMatchObject({ status: "failed" });
    expect(document.snapshot()).toBe(before); expect(document.undoManager.inspect().cursor).toBe(cursor);
    expect(restoreSelection).not.toHaveBeenCalled();
    if (failure === "async") expect(document.undoManager.canUndo).toBe(false);
  });

  it("retains historical resources through metadata adoption and restores selections after publication", async () => {
    const { document } = fixture(); const release = vi.fn(), restoreSelection = vi.fn();
    document.update(current => ({ ...current, content: "asset" }), {
      actionName: "Asset", retainResources: () => ({ resourceIds: ["historical-asset"], release }),
      selection: { before: { offset: 0 }, after: { offset: 1 } }, restoreSelection,
    });
    ack(document, "v2"); expect(release).not.toHaveBeenCalled();
    await document.undoManager.undo();
    expect(restoreSelection).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "undo", revision: document.dirtyRevision, bookmark: { offset: 0 } }));
    await document.undoManager.redo();
    expect(restoreSelection).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "redo", bookmark: { offset: 1 } }));
    document.undoManager.clear(); expect(release).toHaveBeenCalledOnce();
  });

  it("does not publish after a projection closes its document", async () => {
    let document!: ReturnType<typeof fixture>["document"];
    ({ document } = fixture(typeWith({ ...history, restoreContent: (historical, current) => {
      void document.markClosed(); return history.restoreContent(historical, current);
    } })));
    edit(document, "edited"); const revision = document.dirtyRevision;
    expect(await document.undoManager.undo()).toMatchObject({ status: "failed" });
    expect(document.model.content).toBe("edited"); expect(document.state).toBe("closed"); expect(document.dirtyRevision).toBe(revision);
  });

  it.each(["undo", "redo"] as const)("allows retry after a synchronous %s projection refusal", async direction => {
    let fault: "none" | "restore" | "capture" | "content" = "none";
    const { document } = fixture(typeWith({
      captureContent: model => { if (fault === "capture") throw new Error("capture unavailable"); return history.captureContent(model); },
      restoreContent: (historical, current) => {
        if (fault === "restore") throw new Error("restore unavailable");
        return fault === "content" ? { ...current } : history.restoreContent(historical, current);
      },
    }));
    edit(document, "edited"); ack(document, "v2");
    if (direction === "redo") await document.undoManager.undo();
    for (const failure of ["restore", "capture", "content"] as const) {
      fault = failure; const before = document.snapshot(), cursor = document.undoManager.inspect().cursor;
      expect(await document.undoManager[direction]()).toMatchObject({ status: "failed" });
      expect(document.snapshot()).toBe(before); expect(document.undoManager.inspect().cursor).toBe(cursor);
      expect(document.undoManager.inspect().entries.every(entry => !entry.poisoned)).toBe(true);
      expect(direction === "undo" ? document.undoManager.canUndo : document.undoManager.canRedo).toBe(true);
    }
    fault = "none";
    ack(document, "v3");
    expect(await document.undoManager[direction]()).toMatchObject({ status: "completed" });
    expect(document.model).toEqual({ content: direction === "undo" ? "before" : "edited", provider: { etag: "v3", pending: false } });
    expect(() => edit(document, "further editing")).not.toThrow();
  });

  it.each(["undo", "redo"] as const)("compensates completed grouped siblings before allowing a refused %s retry", async direction => {
    let refuse = false;
    const { document } = fixture(typeWith({ ...history, restoreContent: (historical, current) => {
      if (refuse && historical.content === (direction === "undo" ? "before" : "two")) throw new Error("temporarily unavailable");
      return history.restoreContent(historical, current);
    } }));
    document.undoManager.beginGroup("Two edits"); edit(document, "one"); edit(document, "two"); document.undoManager.endGroup();
    ack(document, "v2"); if (direction === "redo") await document.undoManager.undo();
    const before = document.model, cursor = document.undoManager.inspect().cursor; refuse = true;
    expect(await document.undoManager[direction]()).toMatchObject({ status: "failed" });
    expect(document.model).toEqual(before); expect(document.undoManager.inspect().cursor).toBe(cursor);
    expect(direction === "undo" ? document.undoManager.canUndo : document.undoManager.canRedo).toBe(true);
    refuse = false; expect(await document.undoManager[direction]()).toMatchObject({ status: "completed" });
    expect(document.model.content).toBe(direction === "undo" ? "before" : "two"); expect(document.model.provider.etag).toBe("v2");
  });

  it("poisons grouped replay when compensation also fails", async () => {
    let refuse = false;
    const { document } = fixture(typeWith({ ...history, restoreContent: (historical, current) => {
      if (refuse && historical.content !== "one") throw new Error("projection unavailable");
      return history.restoreContent(historical, current);
    } }));
    document.undoManager.beginGroup("Two edits"); edit(document, "one"); edit(document, "two"); document.undoManager.endGroup();
    refuse = true;
    expect(await document.undoManager.undo()).toMatchObject({ status: "failed", code: "undo-compensation-failed" });
    expect(document.undoManager.canUndo).toBe(false); expect(document.undoManager.canRedo).toBe(false);
  });

  it("does not trust a public failure error rethrown by an arbitrary unsafe action", async () => {
    let refuse = false;
    const { document } = fixture(typeWith({ ...history, restoreContent: (historical, current) => {
      if (refuse) throw new Error("projection unavailable"); return history.restoreContent(historical, current);
    } }));
    edit(document, "edited"); refuse = true;
    const result = await document.undoManager.undo(); if (result.status !== "failed") throw new Error("Expected refusal.");
    expect(document.undoManager.canUndo).toBe(true);
    let external = 0;
    document.undoManager.register(defineSyncUndoAction({ name: "Unsafe", asyncPolicy: "forbid", undo: () => { external++; throw result.error; }, redo: () => {} }));
    expect(await document.undoManager.undo()).toMatchObject({ status: "failed" });
    expect(external).toBe(1); expect(document.undoManager.canUndo).toBe(false);
  });

  it.each(["write", "validate"] as const)("rejects and observes an async schema %s without trusting replay as unchanged", async callback => {
    let async = false;
    const type = typeWith();
    const write = type.write, validate = type.validate;
    type.write = (model, context) => async && callback === "write" ? Promise.reject(new Error("late writer")) as never : write(model, context);
    type.validate = ((value: unknown) => async && callback === "validate" ? Promise.reject(new Error("late schema validation")) : validate(value)) as typeof type.validate;
    const { document } = fixture(type); edit(document, "edited"); const before = document.snapshot(); async = true;
    expect(await document.undoManager.undo()).toMatchObject({ status: "failed" });
    expect(document.snapshot()).toBe(before); expect(document.undoManager.canUndo).toBe(false);
    await Promise.resolve(); // Vitest also asserts absence of unhandled promise rejection.
  });

  it("does not evaluate a thrown value while minting the private refusal proof", async () => {
    let refuse = false;
    let document!: ReturnType<typeof fixture>["document"];
    const readMessage = vi.fn(() => { void document.markClosed(); return "revoked"; });
    const cause = Object.create(Error.prototype, { message: { get: readMessage } });
    ({ document } = fixture(typeWith({ ...history, restoreContent: (historical, current) => {
      if (refuse) throw cause; return history.restoreContent(historical, current);
    } })));
    edit(document, "edited"); refuse = true;
    expect(await document.undoManager.undo()).toMatchObject({ status: "failed" });
    expect(readMessage).not.toHaveBeenCalled(); expect(document.state).not.toBe("closed"); expect(document.undoManager.canUndo).toBe(true);
  });
});
