# Testing a SynWare

`@syndromatic/syncloudos/sdk/testing` gives you a deterministic host for unit and integration tests. It mounts your application the same way production does, on an isolated runtime with a clock you control, in-memory storage and fakes for the browser capabilities your code calls. Tests that use it need no browser, network or real device.

## Prerequisites

The examples run under Vitest 5.1 with a DOM. The SDK doesn't bundle test tools, so install them as dev dependencies:

```sh
npm install --save-dev vitest jsdom @testing-library/react
```

Mark DOM tests with `// @vitest-environment jsdom` (or set `environment: "jsdom"` in the Vitest config) and pass that environment's `document` to the host.

In a framework checkout, `npm test` runs the suite in two Vitest projects, one after the other: `heavy` (CPU-heavy source scanners, counterpart checks and timing budgets) and then `unit` (everything else). Tests that install the packed SDK archive into a temporary project run separately: `npm run sdk:build`, then `npm run test:packaging`.

## A first test

```tsx
import { useCommands } from "@syndromatic/syncloudos/sdk";
import { createSynWare, createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

const Notes = createSynWare({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.example.notes",
    version: "1.0.0",
    displayName: "Notes",
    routes: [{ path: "/notes", primary: true }],
  },
  root() {
    useCommands([{ id: "com.example.notes.add", title: "Add Note", execute: () => undefined }]);
    return <button type="button">Add Note</button>;
  },
});

export async function renderNotes(document: Document) {
  const host = createSynWareTestHost({ app: Notes, document });
  const view = await host.render();
  view.getByRole("button", { name: "Add Note" });

  const report = await host.dispose();
  return report.leaked; // empty when the application released everything it acquired
}
```

Pass the `document` your test environment provides, such as the one from jsdom or happy-dom. The test host never reads a global `document`.

## What the host controls

| Member | Use |
| --- | --- |
| `application` | The launched `NSEApplication` for a class application, or `null`. |
| `clock` | `now()`, `set(date)`, `advance(ms)` and `runAll()` drive every timer the application schedules. |
| `mediaClock` | `nowSeconds()` and `advanceSeconds(seconds)` drive media time for MediaFX and AudioFX tests. |
| `persistence` | `getPreference` and `setPreference` read and write the application's preferences. |
| `lifecycle` | `launch()`, `activate()`, `suspend()` and `close()` move the application through its lifecycle, and `state()` reports where it is. |
| `commands`, `documents` | Inspect the commands registered and the documents open. |
| `resources` | Lists live resources so a test can assert that teardown released them. |
| `navigation` | Opens a route the way the shell would. |
| `settlement` | `settled({ timeoutMs })` waits until pending work such as loaders, transitions and tracked promises has finished. |
| `mediaQueries` | `setMatches(query, matches)` sets what a media query reports. See [Media queries and controller traits](#media-queries-and-controller-traits). |
| `diagnostics` | `replace(provider)` and `revoke()` change the trusted diagnostics client. See [Trusted diagnostics provision](#trusted-diagnostics-provision). |
| `appContext` | The low-level mounted context behind the facade returned by `useSCOS()`. |
| `adapters` | Fakes for storage, clipboard, drag, windows, location, MIDI, video and the other host capabilities. |

`createSynWareTestHost` accepts `app` (or `application` and `manifest`), `document`, `container`, `now`, `entitlements`, `locale`, `timeZone`, `branding`, `strictMode`, `services`, `diagnostics`, `applicationDocuments`, `loadGate` and `surface` (`"stage"` or `"window"`). Set `strictMode: true` to render under React StrictMode and catch effects that don't clean up. Supply your `DocumentType` codecs through `applicationDocuments.initialTypes`: a manifest declares which types an application uses, but doesn't install their codecs.

For a class application, pass `{ application: NotesApp, manifest }` instead of `app`. After `await host.render()`, `host.application` is the live `NSEApplication`, and its `.windows` holds the real window controllers. It's `null` before launch, after close, and for function-component applications. `host.persistence` uses the application's own preference store, including values written before launch, not a separate test map.

Both surfaces use the production keyboard routing. To test key bindings and class actions, focus an element in the rendered application and dispatch a bubbling, cancellable `KeyboardEvent`; you don't need a special key driver. Disposing the host removes the routing.

Supply typed service clients with `services: [[notesToken, notesClient]]`. They're registered the ordinary way, so the manifest must still declare the service, and token version and contract checks still apply. Call `host.adapters.services.allow()`, `host.adapters.permissions.allow()` and `host.adapters.policy.allow()` before a controller calls `SCOS.services.require(notesToken)`.

Sensitive storage stays denied to the application until the test allows storage and credentials, even though the host itself can seed preferences. If a class application's launch callback throws, `host.render()` rejects.

## Trusted document provision

`applicationDocuments` is a `SynWareTestApplicationDocumentsConfiguration`. Its `initialTypes`, `initialAdapters`, `recoveryStore` and `assetBacking` configure the real document runtime, and it adds `trustedDocumentKinds` and an optional `install` callback for seeding documents. There's no top-level `documentTypes` option on the test host.

Use the application's real codec and class instead of injecting a document client into its constructor:

```tsx
import { createSynWareTestHost, type SynWareTestApplicationDocumentsConfiguration } from "@syndromatic/syncloudos/sdk/testing";
import { NotesApp } from "./NotesApp";
import { noteDocumentType } from "./NoteDocumentType";

const applicationDocuments: SynWareTestApplicationDocumentsConfiguration = {
  initialTypes: [noteDocumentType],
  trustedDocumentKinds: [
    { kind: "application.document", version: 1, displayName: "Application document" },
  ],
  async install({ documents, seed, signal }) {
    documents.registerDocumentStoreAdapter({
      id: "notes.documents",
      documentIdPrefix: "notes:",
    });
    await seed.saveDraft({
      id: "notes:first",
      kind: "application.document",
      version: 1,
      ownership: { kind: "system" },
      title: "First note",
      publishState: "draft",
      body: {
        typeId: noteDocumentType.id,
        schemaVersion: noteDocumentType.schemaVersion,
        content: { title: "First note", body: "Seeded before launch" },
        metadata: {},
      },
    }, { signal });
  },
};

export async function renderSeededNotes(document: Document) {
  const host = createSynWareTestHost({
    application: NotesApp,
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.notes",
      displayName: "Notes",
      version: "1.0.0",
      documentTypes: [{ id: noteDocumentType.id, displayName: noteDocumentType.displayName }],
      entitlements: ["documentStore.drafts.read", "documentStore.draft.write"],
    },
    applicationDocuments,
    document,
  });
  host.adapters.storage.local.allow();
  try {
    await host.render();
  } finally {
    await host.dispose();
  }
}
```

Here `noteDocumentType` encodes `{ title, body }`. The application opens `{ kind: "document-store", documentId: "notes:first" }` through its normal `SCOS.documents.workspaceDocuments` client. The registered adapter and `seed` write to the same private store, and neither exposes the runtime or an application client.

If the test needs durable drafts or conditional saves, allow the backing storage before rendering. The host provides real exclusive locking for that store. If storage is denied, a record that `seed` returned still isn't durable.

Documents saved through a document store adapter are owned by the system, and the codec's declared owners decide which applications can open them, so don't put an application ID on them. Kinds specific to one application, such as published notes, keep their own declared owner.

The `install` callback receives a `SynWareTestDocumentInstallContext` with `documents`, `seed`, `environment` and `signal`, and finishes before the application launches or renders. `seed` can write only the kinds listed in `trustedDocumentKinds`, for the application's own bundle and for the owners named by `initialTypes[].creatingApplicationId`. List `application.document` explicitly to seed adapter documents.

Seeding doesn't grant service access or skip the manifest's document types, codec validation or application policy. The default draft policy still needs `documentStore.drafts.read` and `documentStore.draft.write` before the application can read or save drafts, whatever the seed wrote.

`install` can return a cleanup function, synchronous or asynchronous. Disposing the host, or a failure while creating it, aborts the signal, runs the cleanup and revokes the context, including its adapter registrations and seeding rights. Keeping a reference to a port doesn't keep it alive.

## Portable action payloads

Test class actions by clicking controls or calling `useAction(...).perform(payload)`, not by calling the action method directly. The test host checks payloads exactly as production does. Plain records and arrays are rejected, without running their getters or proxy traps, because the host can't prove they aren't proxies. Don't work around this in a test.

Send primitives, or build immutable payloads through the running application's command client:

```tsx
import { act, fireEvent, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { NSEApplication, NSEWindowController, action, useAction, useSCOS } from "@syndromatic/syncloudos";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

function NotesView() {
  const scos = useSCOS();
  const select = useAction("selectNote");
  return <button onClick={() => {
    void select.perform(scos.commands.createPayload("id", "note-1"));
  }}>Select note</button>;
}
class NotesWindow extends NSEWindowController { static view = NotesView; }
class NotesApp extends NSEApplication {
  static mainWindow = NotesWindow;
  selectedId = "";
  @action selectNote(payload: { readonly id: string }) { this.selectedId = payload.id; }
}

export async function selectNote(document: Document) {
  const host = createSynWareTestHost({
    application: NotesApp,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.notes", displayName: "Notes", version: "1.0.0" },
    document,
  });
  try {
    const view = await host.render();
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "Select note" })); });
    const application = host.application;
    if (!(application instanceof NotesApp)) throw new Error("Notes application did not launch.");
    await waitFor(() => expect(application.selectedId).toBe("note-1"));
  } finally {
    await host.dispose();
  }
}
```

The view calls `useSCOS()` so the example also works outside an application folder. For nested data, build each record with `commands.createPayload("id", id)` and each array with `commands.createPayloadArray(...)`, all from the same mounted application. The builders reject duplicate or non-string keys, missing values and plain nested objects. Pass `File[]`, DOM nodes and functions through outlets or your own callbacks, or send primitive descriptors instead. Serialising, cloning, spreading or enumerating an arbitrary object won't turn it into a valid payload.

## Trusted diagnostics provision

To test a class application that reads `SCOS.trusted.diagnostics`, use the host's `diagnostics` option. Don't pass a diagnostics client into its constructor; the application should reach it the normal way.

```tsx
const host = createSynWareTestHost({
  application: DiagnosticsApp,
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.example.diagnostics",
    displayName: "Diagnostics",
    version: "1.0.0",
    entitlements: ["diagnostics.view"],
  },
  document,
  diagnostics: {
    async refreshConformanceSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      return { checks: [] };
    },
    exportConformanceSnapshot(snapshot) {
      return JSON.stringify(snapshot);
    },
  },
});
await host.render();
host.diagnostics.revoke();
host.diagnostics.replace(nextDiagnosticsProvider);
await host.dispose();
```

`diagnostics` takes an `AppTrustedDiagnosticsClient`, with `refreshConformanceSnapshot({ signal? }?) => Promise<unknown>` and `exportConformanceSnapshot(snapshot) => unknown`. The manifest must still declare `diagnostics.view`; without both a provider and that entitlement, `SCOS.trusted.diagnostics` is absent. A host created without a provider can add one later with `host.diagnostics.replace(provider)`. The application can't reach `host.diagnostics` or the host itself.

Replacing or revoking a provider aborts the previous provider's work in progress. The signal a provider receives is also aborted when the caller cancels or the application ends, and a provider that ignores it still can't deliver a late result. A client the application kept from an earlier provider rejects further calls, even after a new provider is installed, and revoking never falls back to another source.

Replacing or revoking also revalidates actions, so a `validateRefreshSnapshot()` that reads `SCOS.trusted.diagnostics` updates `useAction` availability on its own. In React tests, make these changes inside `act()` before asserting on the controls.

## Media queries and controller traits

To choose the starting environment, set media query matches before rendering:

```tsx
host.mediaQueries.setMatches("(prefers-reduced-motion: reduce)", true);
await host.render();
```

The initial match applies as soon as the application renders, without advancing the clock. After rendering, change the match and advance the host clock by one frame inside `act()`:

```tsx
await act(async () => {
  host.mediaQueries.setMatches("(prefers-reduced-motion: reduce)", false);
  host.clock.advance(16);
});
await waitFor(() => expect(panel.traitCollection.reducedMotion).toBe(false));
```

Media query subscriptions receive the change immediately, but trait collections update on the next animation frame, and `waitFor()` on its own doesn't advance the host clock. Once the frame runs, a mounted view controller's `traitCollection.reducedMotion` changes, its view re-renders and `traitCollectionDidChange(previous)` receives the old traits, with no need to inject traits by hand. Setting a match to the value it already has does nothing.

## Fakes

Each adapter is a port with four modes: `allow()` lets operations succeed, `deny(reason)` refuses them, `fail(error)` makes them throw and `interrupt(reason)` aborts them part-way. Every port records its calls, so a test can assert what the application asked for.

Fakes for sensitive capabilities, including the clipboard, storage and device access, start denied, and a test opts in explicitly:

```tsx
import type { SynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

export function admitDevices(host: SynWareTestHost) {
  host.adapters.clipboard.allow();
  host.adapters.location.allow();
  host.adapters.location.setAuthorizationStatus("granted");
}

export function clipboardCalls(host: SynWareTestHost) {
  return host.adapters.clipboard.calls();
}
```

Test the denied path as well as the allowed one: leave a fake denied and check that your interface explains what happened.

## Waiting for work

Applications load routes, fetch data and animate transitions. `createSynWareTesting` wraps a host in a driver that waits for all of it:

```tsx
import { createSynWareTesting, type SynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

export async function openNotes(host: SynWareTestHost) {
  const testing = createSynWareTesting(host);
  await testing.visit("/notes");
  await testing.settled({ timeoutMs: 2_000 });
}
```

`track(label, promise)` registers your own promise with the settlement tracker, and `waiter(label)` returns a handle you finish with `end()`, `cancel()` or `fail()`.

## Disposal

Call `host.dispose()` at the end of every test. It resolves to a report with `runtimeDisposed`, `remaining` and `leaked`. A non-empty `leaked` list names resources the application acquired and never released, which usually means a handle that was never disposed or an effect without a cleanup function.

## Standalone fakes

For tests that don't need a full host, the entry also exports the building blocks: `createDeterministicScheduler`, `createDeterministicRuntimeEnvironment`, `createFakeCapabilityPort`, `createFakeClipboardAdapter`, `createFakeStorageAdapter`, `createFakeWindowClient` and `createDeniedFakeServiceClient`. Use the last one to check how a component renders when a host service is unavailable.

## Guidelines

- Query by role and accessible name, the way users and assistive technology find controls.
- Exercise the compact layout by changing the presentation traits, and the reduced motion path by injecting the setting, instead of editing global browser state.
- Cover the lifecycle: launch, suspend, resume and close each deserve an assertion when your application keeps state.
- Run each test that registers commands, observers or handles once under `strictMode: true`.
