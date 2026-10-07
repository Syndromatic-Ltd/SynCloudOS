# Document assets

Applications serialize stable references in their native model and acquire temporary descriptors when presenting images. A stable `DocumentAssetReference` contains authorization/document scope, semantic asset ID, SHA-256 hash, MIME type, byte length and optional intrinsic metrics. It contains no object URL, live lease, runtime generation or store. Equal bytes can share storage within an authorization scope while retaining distinct semantic identities.

## Host configuration

The browser entry exports in-memory and IndexedDB store factories. An application receives the existing scoped `documentResources` client; raw stores remain host capabilities. Configure `applicationDocuments.assetBacking` with either a supplied `store` or a `createStore` factory, `scopeForDocument`, and an optional native manifest policy:

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

Reference enumeration belongs to the application's native type/codec policy. The framework does not walk arbitrary native models or impose a page/object grammar. Scope mappings must preserve the same authorized native document identity across runtime recreation; a temporary runtime ID is unsuitable. Assert native durability only when the configured native provider actually provides it.

A supplied store is host owned. A factory creates one runtime-owned store; runtime teardown releases live roots/leases before disposing it. Durable saved-version and recovery roots survive the live runtime. Without backing, existing asset-free document workflows remain valid and persistent asset operations report unsupported capability.

## Guarantees and limits

| Capability | Meaning |
| --- | --- |
| Memory store | Immutable verified bytes and retention during that store's lifetime |
| IndexedDB store | Persistent verified bytes and roots, including fresh store/runtime reopen |
| Native asset save | Required bytes verified/pinned before a conditional native record plus manifest is published |
| Cross-store atomicity | Explicitly false when native records and bytes use separate stores; staging can conservatively leave orphan pins |
| Live image acquisition | Existing supported image MIME types and 8 MiB limit; independent of larger native storage quotas |
| Native/asset durability | Separate receipt fields; durable bytes do not make a memory native provider durable |

The store copies bytes on admission and read, validates hash/length and bounded metadata, and reports typed missing/corrupt/quota/unavailable/unsupported errors. Its quotas bound asset bytes, total bytes and persistent roots. The current IndexedDB backing snapshots bounded store state inside its transactions; it is suitable for these declared limits, without claiming an unbounded media library.

## Scoped application use

`documentResources.persist` converts an admitted live resource into a stable reference. `acquireAsset` verifies and reacquires that reference as a new live descriptor; copying a descriptor's data does not grant its lease authority. Release presentation leases when the view ends. A persistent reference alone is not a committed model or history retention root.

Prepare asset-bearing changes asynchronously, then publish one canonical document transaction against the prepared revision:

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

Preflight pins exact before/after dependencies and refuses a changed base. An admitted history entry owns its retention until actual truncation/eviction; abandoning preflight releases only the unused reservation. The mount/document lifetime fences both the preparation and its synchronous commitment. New asset-bearing synchronous edits without completed admission are refused before publication.

## Retention and native lifecycle

Committed content, transaction staging, undo history, saved versions, recovery and output retain separate roots. Removing an image from current content cannot collect bytes still reachable through undo, a saved version or recovery. Canonical model adoption switches committed ownership before previous roots are released. Failed or stale adoption abandons staged resources and preserves current content.

Native Save verifies the captured reference set before provider publication. An edit made during upload remains dirty after the earlier receipt returns. Conditional conflict or proven precommit failure preserves the previous valid record. An unknown sent-write outcome keeps staged pins until provider reconciliation establishes the actual result; cancellation cannot pretend a provider write did not happen.

Saved-version roots use verified provider identity. Repeated idempotent writes must not create a growing set of roots for one version. Release a version root only after provider listings, current-record state and a direct historical read establish that the version was evicted. Deleting a current record does not imply historical versions were deleted. Providers own pruning policy.

Recovery stores a committed native model with its manifest and exact retention root. Replacing or removing recovery releases the previous record's own root. Restore, remote adoption and version reads validate required dependencies before canonical adoption. Duplicate/Save As need application-native reference remapping into the destination's authorized scope; sharing immutable bytes is permitted only when that authority allows it. Moving providers can return unsupported transfer rather than copy a source live lease.

## Output and diagnostics

Output preparation retains resources for its captured native revision independently from views/history. The application engine declares dependency retention and drawing; the framework manages the preparation's lifetime. A synchronous output/history release callback can schedule durable cleanup, but its owner must observe the resulting promise and report later failures. An already-issued immutable terminal receipt cannot report a future asynchronous cleanup error.

Browser tests save through a real runtime, provider and store, reload the page, create fresh instances, reacquire a new lease and decode the retained image bytes, and also exercise concurrent quota and deliberate corruption. They establish browser persistence behaviour; they do not imply remote-provider durability or platform-native parity.
