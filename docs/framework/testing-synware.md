# Testing a SynWare

`@syndromatic/syncloudos/sdk/testing` provides a deterministic host for unit and integration tests. The host mounts your application exactly as production does, on an isolated runtime with a controllable clock, in-memory storage and fakes for the browser capabilities your code may call. Tests that use it run without a browser, a network or a real device.

## A first test

```tsx
import { useCommands } from "@syndromatic/syncloudos/sdk";
import { createSynWare, createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

const Notes = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.example.notes",
    version: "1.0.0",
    title: "Notes",
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
