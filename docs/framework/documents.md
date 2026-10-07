# Documents

A document is a live editing session for content the user owns. It keeps a stable identity while its storage location, saved version and windows change, and it tracks whether it has unsaved changes. The runtime supplies the mechanics: autosave, recovery after a crash, version history, conflict detection and undo. Your application supplies the model.

SynWare reach documents through `useSynWareDocument()`, which returns a client scoped to your application. The client exposes the document mechanics under `workspaceDocuments`.

## Declare a document type

List each kind of document your application edits in the manifest.

```ts
export default {
  schemaVersion: 1,
  id: "com.example.notes",
  version: "1.0.0",
  title: "Notes",
  documentTypes: [
    { id: "com.example.notes.note", extensions: ["note"], displayName: "Note" },
  ],
} as const;
```

The `id` is the `typeId` you pass when you open or create documents. An application can open only the types it declares.

## Models

A document model is plain JSON: objects, dense arrays, strings, finite numbers, booleans and `null`. Dates, Maps, Sets, Blobs, class instances and cyclic structures are rejected with a typed error before anything is stored. Store dates as ISO strings and binary data as document resources. Snapshots are immutable, and you change a model by asking the client to transform it.

## Create, open and edit

```tsx
import { useSynWareDocument } from "@syndromatic/syncloudos/sdk";

interface Note {
  readonly title: string;
  readonly body: string;
}

const typeId = "com.example.notes.note";

export function useNoteActions() {
  const { workspaceDocuments } = useSynWareDocument();

  return {
    async create() {
      const snapshot = await workspaceDocuments.newDocument<Note>({
        typeId,
        initialModel: { title: "Untitled", body: "" },
      });
      return snapshot.id;
    },

    rename(documentId: string, title: string) {
      workspaceDocuments.updateDocument<Note>(
        documentId,
        (current) => ({ ...current, title }),
        { actionName: "Rename Note", coalescingKey: "title" },
      );
    },

    save(documentId: string) {
      return workspaceDocuments.saveDocument(documentId, { reason: "explicit" });
    },
  };
}
```

`newDocument` returns a document with a stable identifier before it has a location, so several untitled documents can coexist. `openDocument` takes a `location` and returns the document stored there. A location is one of:

| Kind | Fields | Meaning |
| --- | --- | --- |
| `memory` | `namespace`, `key` | Transient storage, useful for tests and scratch work. |
| `indexed-db` | `database`, `store`, `key` | Durable browser storage. |
| `document-store` | `documentId` | The host's document store. |
| `remote` | `url` | A remote endpoint. |

Opening a location that is already open returns the existing document.

`updateDocument` applies a transform to the current model and records an undo step named by `actionName`. Set a `coalescingKey` so a burst of edits such as typing merges into one step, or `recordUndo: false` for changes that should not be undoable.

## Observe a document

`getDocument(id)` returns a snapshot and `subscribeDocument(id, listener)` reports changes. A snapshot carries:

| Field | Meaning |
| --- | --- |
| `id`, `typeId`, `location` | Identity and where the document is stored. |
| `model` | The current immutable model. |
| `state` | `"new"`, `"clean"`, `"dirty"`, `"saving"`, `"error"`, `"conflicted"` or `"closed"`. |
| `readOnly`, `documentKind` | Whether edits are allowed. A `"projection"` document is a read-only view derived from other data. |
| `currentVersion`, `dirtyRevision` | The saved version and a monotonic model revision used for admission and asynchronous fences. |
| `conflict`, `lastError` | Details when the state is `"conflicted"` or `"error"`. |

Use `retainDocument(id)` to hold a document open while a component depends on it, and `releaseDocument(id)` when the component finishes.

## Saving

`saveDocument` writes the document conditionally, against the version it last saw. A document with no location asks the host to choose a destination. Autosave uses the same path, so an application that opts into autosave and an application that saves on demand share their guarantees. If a newer edit arrives while a save runs, the saved revision becomes the new base and the newer content stays dirty.

Configured recovery stores capture committed content at recovery checkpoints. Active field drafts and IME text require their own explicit draft policy; recovery cannot guarantee preservation of edits that have not reached a checkpoint. A saved version never changes because of recovery.

## Versions and conflicts

`listDocumentVersions(id)` returns the saved history, and `restoreDocumentVersion(id, version)` adopts that version's content. Native dirtiness compares serialized content identity with the saved identity: adopting the current saved content is clean; different older content remains dirty. The revision continues to advance for both cases.

Two writers can change the same document. A save that finds a newer remote version puts the document in the `"conflicted"` state, and the snapshot's `conflict` holds the base, the local model and the remote record. Resolve it with `resolveDocumentConflict`:

| Resolution | Effect |
| --- | --- |
| `{ kind: "use-local", expectedRemoteVersion }` | Overwrite the remote with the local model. |
| `{ kind: "use-remote" }` | Discard local changes and adopt the remote. |
| `{ kind: "merge", model, expectedRemoteVersion }` | Save a merged model. |
| `{ kind: "recreate" }` | Create the document again after the remote was deleted. |

Every write names the version it expects, so a conflict always surfaces as a state you can present. Nothing overwrites silently.

## Closing

`closeDocument(id)` resolves to a result that says whether the document closed. A dirty document asks the host to review the change first, and the user can save, discard or cancel. Application code treats a cancelled close as a normal outcome.

## Undo

Each document has its own undo history, and `getUndoManager(documentId)` returns it. The history follows the responder that has focus, so pressing undo in one document never reverses another. See [commands, responders and undo](commands-responders-undo.md).

## Document resources

Binary content such as images and audio lives beside the model as document resources. `documentResources.acquire`, `resolve` and `release` manage each resource's lifetime, and `subscribeInvalidation` reports when a resource changes. Keep large assets here so the model stays small enough to save quickly.

## Documents and windows

A document can appear in one or more windows. `useSynWareWindow().client.openDocumentWindow({ documentId, title, restorationKey })` opens one. The [windows guide](windows.md) covers presentation, restoration and close behaviour.

## Accessibility

Keep the dirty state readable. Announce a conflict with a clear description of the choices, give the review prompt a labelled default action, and return focus to the document surface when a sheet or prompt closes.

## Atomic model edits

Use `transactDocument` when an edit needs an explicit revision, validation, selection bookmark or resource retention. Its synchronous transform stages the complete immutable native model before admission and records one entry in the existing document history. A rejected transaction publishes neither a model nor a history entry.

```ts
const before = workspaceDocuments.getDocument<Note>(documentId);
if (!before) throw new Error("Document unavailable");
const result = workspaceDocuments.transactDocument<Note>(
  documentId,
  model => ({ ...model, title: "Revised" }),
  { expectedRevision: before.dirtyRevision, actionName: "Rename Note" },
);
if (result.status === "rejected") presentEditFailure(result.error);
```

Transforms and validators are synchronous; do asynchronous work first, then submit against the captured revision. `validateModel` checks app invariants. Optional selection bookmarks are immutable plain data; `restoreSelection` resolves them in currently live sessions. History replay changes the canonical model even when the original view has unmounted. A coalescing key should include the flow, input session and formatting lineage rather than one global application typing key.

For text fields within a native model, [the text owner adapter](text-and-editing.md) reads and writes a specified flow through this transaction. Two windows can share canonical content while their selections, typing attributes and marked text remain independent. The native document has one history; neither a text view nor an application engine creates a competing content history.

## Editing participants and lifecycle barriers

Register an editing participant for a field or private engine that can hold uncommitted changes. Its `settle(context)` either commits valid data through the context's admitted transaction, returns a refusal that preserves its draft, or reports revocation. The context expires after the barrier; retaining it does not authorize a later asynchronous edit. Dispose registration when its session or view ends.

Explicit Save, Save As, Revert, Export, Print and Close settle participants before capturing content or deciding whether changes need review. An active IME composition refuses settlement and remains available to the user. A participant that committed successfully before another participant refused keeps its legitimate commit. Explicit discard has a separate callback. Autosave and recovery capture already committed content without forcing native composition to finish.

`closeDocument(id, { reason, signal })` forwards both options through the scoped client. Canceling close preserves the document and drafts. Close preparation retains the existing conditional storage and rollback semantics; field settlement occurs before that mutation-protected preparation.

## Application document workflows

`registerWorkflowProvider` supplies application-level New/Open choices, so these commands work before any document exists. Its validation callback reports availability without opening a panel. The framework returns an explicit unsupported/disabled result when a required provider or adapter capability is absent.

The same scoped client exposes `saveAsDocument`, `duplicateDocument`, `moveDocument` and `revertDocument`. Destination conflict policies and adapter version checks remain explicit. Native save does not publish a provider projection such as a journal article; that orchestration belongs to the application.

## Persistent assets and derived output

Stable asset references are native data; live image descriptors and object URLs are temporary leases. See [document assets](document-assets.md) for storage guarantees, preflight, retention and fresh-runtime reopen, and [custom document engines](custom-document-engines.md) for immutable output preparation. PDF/print output captures a settled revision and retains its dependencies without changing document history or saved identity.
