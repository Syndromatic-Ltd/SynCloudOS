# Documents

A document is a live editing session for content the user owns. It keeps a stable identity while its storage location, saved version and windows change, and it tracks whether it has unsaved changes. The runtime supplies autosave, crash recovery, version history, conflict detection and undo; your application supplies the model.

An application reaches documents through `SCOS.documents` (or `useDocument()` in a component), a client scoped to that application. The document operations are on its `workspaceDocuments` member, and binary resources on `documentResources`.

## Declare a document type

List each kind of document your application edits in the manifest.

```ts
export default {
  schemaVersion: 1,
  bundleIdentifier: "com.example.notes",
  version: "1.0.0",
  displayName: "Notes",
  documentTypes: [
    { id: "com.example.notes.note", extensions: ["note"], displayName: "Note" },
  ],
} as const;
```

The `id` is the `typeId` you pass when you open or create documents. An application can open only the types it declares.

## Models

A document model is plain JSON: objects, dense arrays, strings, finite numbers, booleans and `null`. Dates, Maps, Sets, Blobs, class instances and cyclic structures are rejected with a typed error before anything is stored. Store dates as ISO strings and binary data as document resources. Snapshots are immutable; to change a model, ask the client to transform it.

## Create, open and edit

```tsx
import { useDocument } from "@syndromatic/syncloudos/sdk";

interface Note {
  readonly title: string;
  readonly body: string;
}

const typeId = "com.example.notes.note";

export function useNoteActions() {
  const { workspaceDocuments } = useDocument();

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

`newDocument` returns a document with a stable identifier before it has a location, so several untitled documents can exist at once. `openDocument` takes a `location` and returns the document stored there. A location is one of:

| Kind | Fields | Meaning |
| --- | --- | --- |
| `memory` | `namespace`, `key` | Transient storage, useful for tests. |
| `indexed-db` | `database`, `store`, `key` | Durable browser storage. |
| `document-store` | `documentId` | The host's document store. |
| `remote` | `url` | A remote endpoint. |

A document adapter stores each kind of location. The browser host (`mountSynCloudOS`) provides `memory` and `indexed-db`: `memory` keeps documents for the life of the page, and `indexed-db` stores them in the browser under the location's `database`. `document-store` uses the host's document store. `remote` needs an adapter that the host registers, because only the host knows the endpoint and its credentials. A host registers adapters through `applicationDocuments.initialAdapters`, or with `registerAdapter` in a host contribution's `install`, and a registered adapter always takes precedence over a built-in one. If no adapter handles a location, opening or saving there fails with `document-adapter-unavailable`. A scratch document that is never saved needs no location: call `newDocument` without one.

Opening a location that is already open returns the existing document. Pass `initialModel` to open or create: if nothing is stored at the location yet, `openDocument` creates a document there from that model, written on its first save. A stored document always opens with its stored model. Without `initialModel`, a missing document rejects with code `document-not-found`. This makes the first launch work the same as every other:

```ts
async applicationWillFinishLaunching() {
  this.document = await SCOS.documents.workspaceDocuments.openDocument({
    typeId: "org.example.lab.simulation",
    location: { kind: "document-store", documentId: "lab.workspace" },
    initialModel: emptySimulation(),
  });
}
```

Document-store reads and writes are checked against the signed-in person's role as well as the application's manifest; see [Entitlements](synware-manifest.md#entitlements-privacy-and-services).

`updateDocument` applies a transform to the current model and records an undo step named by `actionName`. Set a `coalescingKey` so that a burst of edits, such as typing, merges into one step, or `recordUndo: false` for changes that shouldn't be undoable.

## Observe a document

`getDocument(id)` returns a snapshot and `subscribeDocument(id, listener)` reports changes. A snapshot carries:

| Field | Meaning |
| --- | --- |
| `id`, `typeId`, `location` | Identity and where the document is stored. |
| `model` | The current immutable model. |
| `state` | `"new"`, `"clean"`, `"dirty"`, `"saving"`, `"error"`, `"conflicted"` or `"closed"`. |
| `readOnly`, `documentKind` | Whether edits are allowed. A `"projection"` document is a read-only view derived from other data. |
| `currentVersion`, `dirtyRevision` | The saved version, and a model revision that only increases. Pass it as `expectedRevision` to make an edit conditional. |
| `conflict`, `lastError` | Details when the state is `"conflicted"` or `"error"`. |

Use `retainDocument(id)` to hold a document open while a component depends on it, and `releaseDocument(id)` when the component finishes.

## Saving

`saveDocument` writes the document only if the stored version is still the one it last saw. Saving a document with no location asks the host to choose a destination. Autosave uses the same path, so autosaving and saving on demand give the same guarantees. If an edit arrives while a save runs, the saved revision becomes the new base and the newer content stays dirty.

A configured recovery store captures committed content at recovery checkpoints. Field drafts in progress and IME text need their own draft policy, because recovery can't preserve edits that haven't reached a checkpoint. Recovery never changes a saved version.

## Versions and conflicts

`listDocumentVersions(id)` returns the saved history, `readDocumentVersion` reads one version, and `restoreDocumentVersion(id, version)` adopts that version's content. Whether the document is dirty depends on its content, not on how it got there: restoring the content that is currently saved leaves it clean, and restoring older content makes it dirty. The revision advances either way.

Two writers can change the same document. A save that finds a newer remote version puts the document in the `"conflicted"` state, and the snapshot's `conflict` holds the base, the local model and the remote record. Resolve it with `resolveDocumentConflict`:

| Resolution | Effect |
| --- | --- |
| `{ kind: "use-local", expectedRemoteVersion }` | Overwrite the remote with the local model. |
| `{ kind: "use-remote" }` | Discard local changes and adopt the remote. |
| `{ kind: "merge", model, expectedRemoteVersion }` | Save a merged model. |
| `{ kind: "recreate" }` | Create the document again after the remote was deleted. |

Every write names the version it expects, so a conflict always shows up as a state you can present, and nothing is overwritten silently.

## Closing

`closeDocument(id)` resolves to a result that says whether the document closed. For a dirty document the host asks the user to review the changes first, and they can save, discard or cancel. Treat a cancelled close as a normal outcome.

## Undo

Each document has its own undo history, and `getUndoManager(documentId)` returns it. The history follows the responder that has focus, so pressing undo in one document never reverses another. See [commands, responders and undo](commands-responders-undo.md).

If your model contains provider metadata such as ETags, declare a `history` policy on the document type:

```ts
history: {
  captureContent: model => ({ text: model.text }),
  restoreContent: (historical, current) => ({ ...current, text: historical.text }),
},
```

`captureContent` returns a JSON value (or a deterministic fingerprint) of the content the user wrote, and values are compared as canonical JSON. `restoreContent` merges historical content into the current model while keeping its current synchronisation metadata. Both callbacks are synchronous and pure, and receive immutable inputs. When undo or redo replays a step, the resulting model is validated, and its captured content must match the historical capture before it is published or the selection restored.

With this policy, an update with `recordUndo: false` keeps the existing Undo and Redo steps only when the captured content is unchanged (it still ends typing coalescing); if the content changed, the now-obsolete history is cleared. Without the policy, any such update clears history. Keep this policy on the document type instead of maintaining a separate undo stack in the application.

## Document resources

Binary content such as images and audio lives beside the model as document resources. `SCOS.documents.documentResources.acquire`, `resolve` and `release` manage each resource's lifetime, and `subscribeInvalidation` reports when a resource changes. `persist` and `acquireAsset` turn a resource into a stable asset reference and back; see [document assets](document-assets.md). Keep large content here so the model stays small enough to save quickly.

## Documents and windows

A document can appear in several windows. `SCOS.windows.openDocumentWindow({ documentId, title, restorationKey })` opens one. The [windows guide](windows.md) covers presentation, restoration and close behaviour.

## Accessibility

Make the unsaved state readable to assistive technology. Announce a conflict with a clear description of the choices, give the review prompt a labelled default action, and return focus to the document when a sheet or prompt closes.

## Atomic model edits

Use `transactDocument` when an edit needs an expected revision, validation, a selection bookmark or resource retention. Its synchronous transform produces the complete new model before anything is applied, and the edit records one entry in the document's history. A rejected transaction publishes neither a model nor a history entry.

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

Transforms and validators are synchronous, so do asynchronous work first and then submit against the revision you captured. `validateModel` checks your app's invariants. Selection bookmarks are optional immutable plain data that `restoreSelection` resolves in the sessions that are live at the time. Undo and redo change the model even when the view that made the edit has unmounted. Build a coalescing key from the text flow, the input session and the formatting, not one application-wide typing key.

For text inside a document model, [the text owner adapter](text-and-editing.md) reads and writes a given flow through this transaction. Two windows can share the same content while their selections, typing attributes and marked text stay independent. The document has one history; neither a text view nor an application engine keeps a competing one.

## Editing participants and lifecycle barriers

Register an editing participant with `registerEditingParticipant` for a field or private engine that can hold uncommitted changes. Its `settle(context)` does one of three things: commits valid data through the context's transaction, refuses (keeping its draft), or reports that it has been revoked. The context expires once settlement is over, and keeping it doesn't permit a later asynchronous edit. Dispose of the registration when its session or view ends.

Save, Save As, Revert, Export, Print and Close settle participants before they capture content or decide whether changes need review. An active IME composition refuses and stays available to the user. If one participant commits and a later one refuses, the first commit stands. Discarding has its own callback. Autosave and recovery capture only committed content and don't force a composition to finish.

`closeDocument(id, { reason, signal })` passes both options through. Cancelling a close keeps the document and its drafts. Participants settle before the close prepares storage, and that preparation still writes conditionally and rolls back on failure.

## Application document workflows

`registerWorkflowProvider` supplies the application's New and Open choices, so those commands work before any document exists. Its validation callback reports availability without opening a panel. When a required provider or adapter capability is missing, the framework returns an explicit unsupported or disabled result.

The same client has `saveAsDocument`, `duplicateDocument`, `moveDocument` and `revertDocument`, each with an explicit policy for an existing destination and adapter version checks. Saving a document doesn't publish anything derived from it, such as a journal article; that's up to the application.

## Persistent assets and derived output

Stable asset references belong in the model; live image descriptors and object URLs are temporary leases. See [document assets](document-assets.md) for storage guarantees, preflight checks, retention and reopening in a fresh runtime, and [custom document engines](custom-document-engines.md) for preparing output. PDF and print output capture a settled revision and keep its dependencies alive without changing the document's history or saved identity.

Binary import sources accept `NSEDataConvertible`. Document resource inputs expose `data(): Promise<NSEData>` with `type` and `size`, and `resolve` returns `NSEData | null`. PDF output returns `NSEData` inside its export result. Use `.count` for the byte length, `.bytes` for a copy as a `Uint8Array` and `.blob(mimeType)` only when calling a browser API. The model itself stays plain JSON and holds resource and asset references.
