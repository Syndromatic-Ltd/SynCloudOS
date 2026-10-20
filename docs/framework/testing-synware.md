# Testing a SynWare

`@syndromatic/syncloudos/sdk/testing` provides a deterministic host for unit and integration tests. The host mounts your application exactly as production does, on an isolated runtime with a controllable clock, in-memory storage and fakes for the browser capabilities your code may call. Tests that use it run without a browser, a network or a real device.

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

Pass the `document` your test environment provides, such as the one from jsdom or happy-dom. The kit never reads an ambient global.

## What the host controls

| Member | Use |
| --- | --- |
| `clock` | `now()`, `set(date)`, `advance(ms)` and `runAll()` drive every timer the application schedules. |
| `mediaClock` | Advances media time for MediaFX and AudioFX tests. |
| `persistence` | Reads and writes the application's preferences, and lists what it stored. |
| `lifecycle` | `launch()`, `activate()`, `suspend()` and `close()` move the application through its lifecycle. |
| `commands`, `documents` | Inspect the commands registered and the documents open. |
| `resources` | Lists live resources so a test can assert that teardown released them. |
| `navigation` | Opens a route the way the shell would. |
| `settlement` | `settled({ timeoutMs })` waits until pending work such as loaders, transitions and tracked promises has finished. |
| `appContext` | The low-level mounted context behind the facade returned by `useSCOS()`. |
| `adapters` | Fakes for storage, clipboard, drag, windows, location, MIDI, video and the other host capabilities. |

`createSynWareTestHost` accepts `app`, `document`, `container`, `now`, `permissions`, `locale`, `timeZone`, `branding`, `strictMode`, `documentTypes` and `surface` (`"stage"` or `"window"`). Set `strictMode: true` to render under React StrictMode and catch effects that fail to clean up. Supply native `DocumentType` codecs through trusted `documentTypes` provision; an application's manifest declares the types it may use but does not install their codecs.

For a class application pass `{ application: NotesApp, manifest }` instead of `app`. After
`await host.render()`, `host.application` is the live `NSEApplication` and `.windows` contains its
real window controllers. It is `null` before launch, after close, and for function-component apps.
`host.persistence` shares the app's own namespaced preference store, including values written
before launch; it is not a separate test map.

Both surfaces mount the production `RuntimeInputBoundary`. Focus an element in the rendered app
and dispatch a bubbling, cancellable native `KeyboardEvent` to exercise declared key bindings and
class actions through normal routing. Disposing the host removes that routing; no private key
driver is needed.

Supply typed service clients with `services: [[notesToken, notesClient]]`. These are registered
through the ordinary app-service boundary, so the manifest must still declare the service and
token version/contract checks still apply. Allow the service, permission and policy test adapters
with `host.adapters.services.allow()`, `host.adapters.permissions.allow()` and
`host.adapters.policy.allow()` before a controller calls `SCOS.services.require(notesToken)`.
Sensitive storage remains denied to the app until the test allows storage and credentials, even
though the trusted host can seed preferences. A class launch callback failure rejects `host.render()`.

## Portable action payloads

Exercise class actions with normal control clicks or `useAction(...).perform(eventPayload)`,
not by calling the action method directly. The test host keeps the production command boundary:
an event callback does not make arbitrary objects safe. Without a host-native `isProxy` identity
probe, raw records and arrays fail closed without evaluating their getters or proxy traps.
Do not inject a proxy probe to make a portable test pass.

Use primitives or construct immutable values through the running app's commands client:

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

The view uses `useSCOS()` so the example also works outside an app folder. For nested data,
build each record with `commands.createPayload("id", id)` and each array with
`commands.createPayloadArray(...)`,
using the same mounted scope throughout. Builders reject duplicate/non-string keys, missing
values and raw nested objects. Keep `File[]`, DOM nodes and transformation functions in outlets
or domain callbacks, or send primitive descriptors instead. Serialising, cloning, spreading or
enumerating unknown objects is not a supported payload conversion.

## Trusted diagnostics provision

Use the diagnostics-specific host option to test a real class application that reads
`SCOS.trusted.diagnostics`. Do not pass a diagnostics client into its constructor:
the application must use its normal trusted-client boundary.

```tsx
const host = createSynWareTestHost({
  application: DiagnosticsApp,
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.example.diagnostics",
    displayName: "Diagnostics",
    version: "1.0.0",
    permissions: ["diagnostics.view"],
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

`diagnostics` accepts an `AppTrustedDiagnosticsClient`: its operations are
`refreshConformanceSnapshot({ signal? }?) => Promise<unknown>` and
`exportConformanceSnapshot(snapshot) => unknown`. The host mints diagnostics-only
provenance; the canonical application manifest must still declare `diagnostics.view`.
Without either a live provider or that declaration, `SCOS.trusted.diagnostics` is absent.
An initially unconfigured host may provide a client later with `host.diagnostics.replace(provider)`.
Neither the provider setter nor the host object is available to the application.

Replacement and revocation abort the previous provider's in-flight work. The signal
passed to a provider also observes caller cancellation and the application's lifetime.
A non-cooperative provider cannot publish a late result after its authority expires.
Retained clients from an earlier provision reject further refreshes and exports, even
after another provider is installed. Revocation never falls back to the runtime inspector.
The framework revalidates action presentation on host replacement or revocation, so a
`validateRefreshSnapshot()` that reads `SCOS.trusted.diagnostics` updates `useAction`
availability without an application hook bridge. In React tests, make host changes
inside `act()` before asserting the updated controls.

## Media queries and controller traits

Set host-owned media matches before rendering to choose the initial environment:

```tsx
host.mediaQueries.setMatches("(prefers-reduced-motion: reduce)", true);
await host.render();
```

Rendering starts the ordinary responsive observer, so the initial match applies
without advancing the clock. After rendering, change the query and advance the
host's deterministic clock by one frame inside `act()`:

```tsx
await act(async () => {
  host.mediaQueries.setMatches("(prefers-reduced-motion: reduce)", false);
  host.clock.advance(16);
});
await waitFor(() => expect(panel.traitCollection.reducedMotion).toBe(false));
```

Matching runtime media-query subscriptions receive changes immediately, while
the responsive observer publishes them on the next animation frame. `waitFor()`
alone does not advance the host clock. The normal presentation bridge updates a
mounted view controller's observable `traitCollection.reducedMotion`. Its view
re-renders and `traitCollectionDidChange(previous)` receives the prior traits;
tests need no internal controller symbols or manual trait injection. Setting an
unchanged match does not emit another change.

## Fakes

Each adapter is a port with four modes. `allow()` lets operations succeed, `deny(reason)` refuses them, `fail(error)` makes them throw and `interrupt(reason)` aborts them mid-flight. Every port records its calls, so a test can assert what the application asked for.

Fakes for sensitive capabilities, including the clipboard, storage and device access, start denied. A test opts in explicitly:

```tsx
import type { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

export function admitDevices(host: ReturnType<typeof createSynWareTestHost>) {
  host.adapters.clipboard.allow();
  host.adapters.location.allow();
  host.adapters.location.setAuthorizationStatus("granted");
}

export function clipboardCalls(host: ReturnType<typeof createSynWareTestHost>) {
  return host.adapters.clipboard.calls();
}
```

Testing the denied path matters as much as the allowed one. Leave a fake denied and assert that your interface explains the situation.

## Waiting for work

Applications load routes, fetch data and animate transitions. `createSynWareTesting` wraps a host with a driver that waits for all of it:

```tsx
import { createSynWareTesting, type createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

export async function openNotes(host: ReturnType<typeof createSynWareTestHost>) {
  const testing = createSynWareTesting(host);
  await testing.visit("/notes");
  await testing.settled({ timeoutMs: 2_000 });
}
```

`track(label, promise)` registers your own promise with the settlement tracker, and `waiter(label)` returns a handle you finish with `end()`, `cancel()` or `fail()`.

## Disposal

Call `host.dispose()` at the end of every test. It resolves to a report with `runtimeDisposed`, `remaining` and `leaked`. A non-empty `leaked` list names resources the application acquired and forgot to release, which usually means a missing `dispose()` on a handle or an effect without a cleanup function.

## Standalone fakes

The entry also exports the building blocks for tests that do not need a full host: `createDeterministicScheduler`, `createDeterministicRuntimeEnvironment`, `createFakeCapabilityPort`, `createFakeClipboardAdapter`, `createFakeStorageAdapter`, `createFakeWindowClient` and `createDeniedFakeServiceClient`. The last one is convenient for asserting how a component renders when a host service is unavailable.

## Guidelines

- Query by role and accessible name. That mirrors how users and assistive technology find controls.
- Exercise the compact layout by changing the presentation traits, and the reduced motion path by injecting the setting, instead of editing global browser state.
- Cover the lifecycle: launch, suspend, resume and close each deserve an assertion when your application keeps state.
- Run each test that registers commands, observers or handles once under `strictMode: true`.
