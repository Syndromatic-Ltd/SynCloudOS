# Document assets

Document assets let a document store images and other binary resources alongside its model. Your model saves a stable `DocumentAssetReference`, and you get a temporary descriptor from it whenever you need to show the image. A reference holds the authorisation and document scope, the asset's ID, its SHA-256 hash, MIME type, length in bytes and, optionally, its intrinsic size. It never holds an object URL, a live lease, a runtime generation or a store. Identical bytes can share storage within one authorisation scope and still be separate assets.

## Host configuration

`@syndromatic/syncloudos/browser` exports two store factories, `createInMemoryDocumentAssetStore` and `createIndexedDBDocumentAssetStore`. Stores belong to the host; an application only gets its scoped `SCOS.documents.documentResources` client. Configure `applicationDocuments.assetBacking` with either a `store` or a `createStore` factory, a `scopeForDocument` function, and optionally a `manifest` policy:

```ts
const assetBacking = {
  createStore: () => createIndexedDBDocumentAssetStore({
    databaseName: "my-site-document-assets",
  }),
  scopeForDocument: documentId => hostScopeForDocument(documentId),
  manifest: {
    enumerateReferences: (content, context) => nativeTypes.assets(content, context),
    scopeForLocation: location => hostScopeForLocation(location),
    nativeDurability: "durable",
  },
};
```

Finding the references in a model is your codec's job; the framework never walks your model or imposes a structure on it. A scope mapping must give the same document the same scope every time the runtime is created, so don't base it on a temporary runtime ID. Set `nativeDurability: "durable"` only if your document provider really stores records durably.

A store you pass in stays yours. A `createStore` factory creates one store that the runtime owns; when the runtime shuts down, it releases live retention and leases and then disposes the store. Retention for saved versions and recovery outlives the runtime. Without any backing, documents without assets work as before, and persistent asset operations report that they're unsupported.

## Guarantees and limits

| Capability | Meaning |
| --- | --- |
| Memory store | Immutable, verified bytes, retained for the store's lifetime |
| IndexedDB store | Persistent, verified bytes and retention, surviving a new store and runtime |
| Saving a document with assets | The bytes it needs are verified and pinned before the conditional record and its asset manifest are published |
| Atomicity across stores | Not provided when records and bytes are in separate stores; staging may leave orphaned pins, never missing bytes |
| Showing an image | The supported image MIME types, up to 8 MiB, whatever the storage quota |
| Durability | Reported separately for the record and the assets; durable bytes don't make an in-memory document provider durable |

The store copies bytes when it receives and returns them, checks hashes, lengths and metadata limits, and reports typed errors for missing, corrupt, over-quota, unavailable and unsupported cases. Its quotas limit the size of each asset, the total size and the number of persistent retention roots. The IndexedDB store reads its state inside each transaction, which suits these limits but isn't designed for an unlimited media library.

## Scoped application use

`documentResources.persist` turns a live resource into a stable reference, and `acquireAsset` verifies a reference and gives you a new live descriptor for it. Copying a descriptor's data doesn't copy its lease. Release descriptors when the view that shows them goes away. A reference on its own keeps nothing alive; the bytes are retained only once a committed model or undo history refers to them.

To change a document's assets, prepare the edit asynchronously, then commit one document transaction against the prepared revision:

```ts
const before = documents.getDocument<MyNativeModel>(documentId);
if (!before) throw new Error("Document unavailable");
const after = appModel.insertAsset(before.model, reference);
const prepared = await resources.prepareEdit(documentId, before.model, after, { signal });
try {
  const result = documents.transactDocument<MyNativeModel>(
    documentId, () => after,
    { expectedRevision: prepared.expectedRevision, actionName: "Insert Image",
      retainResources: prepared.retainResources },
  );
  if (result.status === "rejected") presentEditFailure(result.error);
} finally {
  await prepared.release();
}
```

`prepareEdit` pins exactly the assets the before and after models need, and refuses if the document has changed since. Once the edit is in the undo history, the history keeps those assets until the entry is dropped; `release()` frees only what went unused. Both the preparation and the commit stop if the application or document closes. A synchronous edit that adds assets without a completed preparation is refused.

## Retention and native lifecycle

Current content, staged transactions, undo history, saved versions, recovery and output each retain assets separately, so removing an image from the current content can't delete bytes that undo, a saved version or recovery still needs. When a new model is adopted, the new retention is taken before the old is released. If adoption fails or is out of date, the staged resources are dropped and the current content stays.

Saving verifies every referenced asset before the provider writes the record. An edit made while a save is uploading leaves the document edited after that save returns. A conflict, or a failure known to happen before the write, keeps the previous record. If a write was sent but its outcome is unknown, the staged pins stay until the provider confirms what happened; cancelling can't pretend the write never took place.

Retention for a saved version is keyed on the provider's verified version identity, so writing the same version again doesn't add more. Release it only once the provider's listing, the current record and a direct read of the old version all show the version is gone. Deleting the current record doesn't mean its old versions were deleted. Providers decide when to prune versions.

Recovery stores a committed model with its asset manifest and retention. Replacing or removing a recovery record releases that record's retention. Restoring, adopting a remote change and reading a version all check that the needed assets exist before the model is used. Duplicate and Save As need your codec to map references into the destination's scope, and bytes are shared only where that scope allows. Moving a document to another provider can report that transfer is unsupported instead of copying a live lease.

## Output and diagnostics

Output preparation (printing and export) retains the assets of the revision it captured, separately from views and history. Your engine declares what to retain and how to draw, and the framework manages how long the preparation lives. A synchronous release callback can schedule cleanup, but whoever owns it must watch the resulting promise and report a later failure, because a receipt that's already been issued can't change.

The framework's browser tests save through a real runtime, provider and store, reload the page, create new instances, acquire a new lease and decode the retained image, and also test concurrent quota use and deliberate corruption. They show that persistence works in the browser, not that a remote provider is durable.

## Foundation byte values

A store's `put` accepts `NSEDataConvertible`, and `read` returns `Promise<NSEData>`. A hash callback you inject receives `NSEData`, so pass `data.bytes.buffer` to Web Crypto. When acquiring a resource, the metadata stays separate from the bytes:

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";

const data = await NSEData.read(file);
const resources = SCOS.documents.documentResources;
const descriptor = await resources.acquire(documentId, {
  type: file.type, size: data.count, data: async () => data,
});
const live = resources.resolve(documentId, descriptor); // NSEData | null
```

Bytes are copied when the store receives them and are immutable from then on. The IndexedDB store keeps plain buffers internally and never stores an `NSEData` instance.
