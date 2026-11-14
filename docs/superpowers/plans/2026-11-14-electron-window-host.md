# Electron Window Host Implementation Plan

> Written design only. This phase does not install Electron, add an adapter, package an application, or approve native acceptance. A later implementation request starts execution after the production browser gate below passes.

**Goal:** Present existing SynCloudOS windows in native host surfaces without duplicating application, document, controller, command or close authority.

**Architecture:** One SynCloudOS runtime in the trusted application renderer remains the logical authority. Electron's main process owns native handles and validates a narrow host protocol; same-site child documents are candidate rendering destinations, not additional runtimes. A separate renderer protocol is a different design if the shared-authority experiment fails.

**Tech stack:** Existing TypeScript/React/NSE runtime; a separate Electron host package with main, preload and renderer modules. Select and record a supported Electron version when this plan is executed, including its Chromium version and the tested OS versions.

## Evidence and production prerequisite

The [amended window-management plan](2026-11-14-window-management.md) records Phase 0b's four passing Chromium tests. A stable portal target retained a class window through two fixture slots and a same-origin child document; the fixture checked draft, ID, load counts, toolbar/accessory state, selection/undo, attached-sheet Escape, child closure, early destination loss and quit veto. A child-document popover Escape failure was reproduced and repaired with document-local listeners and realm-safe node checks. The [evidence receipt](../evidence/2026-11-14-window-management/README.md) explicitly limits these results to the prototype.

Those fixture slots are not the production Webspring stage and floating layer. Before any Electron implementation:

- [ ] Run the real application host through stage → floating → stage and stage → child document → floating → stage. Observe one window ID, one controller/root, one live mount and unchanged draft, selection, undo, toolbar and accessories.
- [ ] Exercise an inspector, another application's document, a parent sheet, an application-modal window and a workspace modal. Key/main and focus must agree; unrelated windows remain usable when their domain permits it.
- [ ] Repeat interrupted transfers, two competing transfers, a stale destination activation, close before destination readiness, source loss, destination loss and an application quit veto. Every failed move restores its source or reports a retained unavailable surface; no accidental close or duplicate mount is acceptable.
- [ ] Verify menu/popover Tab, Escape, dismissal and focus return in both documents, including after returning to the opener.
- [ ] Pin framework/site HEADs, dependency receipts and browser version. Capture event order and identity counts alongside the rendered evidence. A unit-test or prototype pass cannot replace this gate.

The current `src/SynCloudOS/Windows/WindowHostEnvironment.ts` has capabilities, fullscreen requests and events, but no acknowledged bind/unbind operation or surface generation. Its shape must be extended only after these tests establish the production ownership contract.

## Constraints and authority

- Keep Electron imports in the host package. `WindowManager`, `ApplicationSession`, documents, responder registration and close leases remain framework-owned.
- The main process maps validated window IDs to native handles; it does not create a second document/window model or change records in response to raw renderer messages.
- A child renderer receives no broad IPC sender, filesystem primitive or arbitrary native method invocation. Its preload exposes named host operations and data-only events.
- Check sender `webContents`, frame identity, the permitted origin, runtime epoch and current binding for every message. Reject unknown fields, invalid bounds, unsupported operations and stale generations before invoking a native API.
- Bundle the trusted UI locally. Keep `nodeIntegration: false`, `contextIsolation: true` and sandboxing enabled consistently in opener/child configurations; do not weaken isolation merely to make transfer succeed. Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security) supports isolated renderers and validating IPC senders.
- Treat toolbar React nodes, controller objects and DOM as renderer-owned objects. They do not cross IPC by serialization. Native menu IPC carries identifiers, labels, enabled/checked state and typed command payloads only.
- Keep the owner's menu decision: no application-icon trigger. Preserve the application's menu portal context when the host draws menus, and native command routing when it supplies them.
- `titlebarPresentation` is `attached` or `floating`; floating applies only to Cumulus, with every toolbar style. Metal remains attached; native exclusion geometry must still hold when a floating bar is centred and constrained to its maximum width.

## Protocol and transfer transaction

Proposed data envelope, to be reconciled with the production browser contract before implementation:

```ts
type HostMessage<T> = {
  runtimeEpoch: string;
  windowId: string;
  surfaceId: string;
  surfaceGeneration: number;
  requestId: string;
  sequence: number;
  payload: T;
};

type NativeRequest =
  | { kind: "prepareSurface"; bounds: { x: number; y: number; width: number; height: number } }
  | { kind: "commitSurface" }
  | { kind: "rollbackSurface" }
  | { kind: "requestFullScreen"; enter: boolean }
  | { kind: "commitClose"; closeOperationId: string };

type NativeEvent =
  | { kind: "surfaceReady" }
  | { kind: "activated" | "deactivated" | "closeRequested" | "surfaceLost" }
  | { kind: "fullScreenChanged"; state: "entering" | "on" | "exiting" | "off" | "refused" }
  | { kind: "titlebarAreaChanged"; available: { x: number; y: number; width: number; height: number } | null };
```

`surfaceGeneration` advances for each attempted transfer and is never reused. `requestId` deduplicates retries; `sequence` orders events within a binding. The native handle is not an IPC capability: the main process obtains it from its own sender-and-binding table. Every reply echoes the validated envelope. Close tokens remain private to the framework; `closeOperationId` correlates an already-committed close, and only the authority renderer may send it.

Transfer order:

1. Reserve a new generation while keeping the source window/controller and live view authority intact.
2. Prepare a hidden native destination and authenticate its document. `ready-to-show` alone is insufficient: require the framework's destination readiness acknowledgement, local event/overlay bindings, titlebar geometry and first usable rendered frame.
3. Move the stable portal target using the proven cross-document transaction. Reacquire document-local observers/listeners and focus ownership; preserve controller/model/undo identity.
4. Commit the destination generation once. Only then retire source-specific listeners and the old native surface, preserving any opener that still owns the runtime.
5. On refusal, timeout, cancellation or destination loss, reverse prepared resources and restore the source binding/focus. If both surfaces are gone, retain the logical record and expose a recoverable unavailable state; never fabricate a successful transfer.

Electron documents that same-site `window.open()` children can share the opener's process, while incompatible process-level preferences can remove the opener relationship. Therefore the first native experiment must prove the configured behavior rather than infer it from URL equality. See [renderer-created windows](https://www.electronjs.org/docs/latest/api/window-open).

## Fullscreen, close and loss

| Trigger | Required authority behavior | Required native behavior |
| --- | --- | --- |
| Enter/exit request | Record intent; preserve normal bounds and zoom state | Request native transition; wait for its event |
| Enter/exit confirmation | Accept only the current generation; emit delegate completion once | Publish confirmed state, including OS-initiated changes |
| Refusal or timeout | Settle to last confirmed state; emit the matching failure callback; process last queued intent | Report failure without inventing a confirmation |
| Re-toggle during transition | Last intent wins after the current transition settles | Do not create concurrent uncontrolled transitions |
| Native close button | Run existing `WindowManager` prepare/commit/rollback and application/document review | Prevent immediate destruction; close only after accepted commit |
| Quit veto | Keep all records, native windows, documents and command authority live | Do not close any member early |
| Renderer/destination loss | Emit `surfaceLost`, invalidate that binding, retain logical window | Clean only native resources belonging to the lost generation |
| Authority renderer loss | Recover from the last durable checkpoint into a new runtime epoch | Do not claim in-memory controller identity survived the process crash |

On macOS, native fullscreen is asynchronous and completion is reported by fullscreen events. Electron's [BrowserWindow documentation](https://www.electronjs.org/docs/latest/api/browser-window) also distinguishes preventable close requests from final closure. Native handlers must preserve those distinctions.

## Implementation packets for a later request

Proposed host package location: `hosts/electron-window-host/`, with its own dependency manifest and no Electron dependency added to the browser SDK.

1. **Protocol and main-process registry.** Create `src/protocol.ts`, `src/main/windowRegistry.ts` and `tests/window-registry.test.ts` in that package. First test wrong sender/frame/origin, stale epoch/generation, replayed requests and non-finite geometry; then implement validation and exact native-handle ownership. Gate: every denied message performs zero native calls, and retries acknowledge the same result without repeating side effects.
2. **Preload and renderer host port.** Create `src/preload.ts`, `src/renderer/ElectronWindowHost.ts` and `tests/window-host.test.ts`. Expose only the named operations above. Extend framework `WindowHostEnvironment.ts` with the production-approved transfer contract and tests under `tests/runtime/window-host-environment.test.ts`; retain the stage adapter. Gate: stale events cannot activate, close or rebind a current window.
3. **Actual child-surface transfer.** Create `src/main/childWindows.ts` and `tests/e2e/window-transfer.spec.ts`. Port the production editor/inspector fixture, keep a single runtime and record creation/load/disposal counters. Gate: all transfer and failure scenarios in the prerequisite matrix pass in Electron; otherwise stop and write a separate renderer-protocol proposal.
4. **Fullscreen and transactional native close.** Create `src/main/windowEvents.ts`, `tests/e2e/fullscreen.spec.ts` and `tests/e2e/window-close.spec.ts`. Test event confirmations, refusal, queued intents, close mid-transition, document save/discard/cancel, window veto, application veto and asynchronous close leases. Gate: no native destruction precedes the logical close commit, and no stale completion changes a closed/rebound window.
5. **Native chrome and menus.** Create `src/main/applicationMenu.ts` and `tests/e2e/native-chrome.spec.ts`. Translate application menu snapshots into native menu items, route selections to the current responder context and revalidate before dispatch. Project the host's available titlebar area into the shared titlebar's exclusion geometry; do not treat that available rectangle as the buttons' occupied rectangle. Gate: one titlebar, no overlapping interactive regions, working keyboard menus and distinct key/main behavior.
6. **Recovery and platform receipt.** Create `tests/e2e/surface-loss.spec.ts` and `docs/acceptance.md`. Test child crash, authority crash, opener closure, reconnect and restoration into a new epoch. Gate: preserved durable data is distinguishable from unrecoverable unsaved state, there are no duplicate controllers within the surviving epoch, and every platform check below has a receipt.

Each packet starts with a failing test, ends with its focused suite plus the framework's affected lifecycle/window tests, and is reviewed before the next packet. Commit only the selected packet; no publishing or auto-updater work belongs to this plan.

## Native acceptance matrix

| Platform | Required checks |
| --- | --- |
| macOS, physical desktop | Traffic-light exclusion in regular/fullscreen states; green-button and menu fullscreen; Escape/OS exit; Spaces transitions; fullscreen auxiliary inspector; key panel with main document retained; app menu retargeting; Cmd-W versus Cmd-Q; dock reopen; close/quit veto; DPR 1 and 2 where hardware permits |
| Windows, physical desktop | Caption-button exclusion at 100%, 150% and 200% scaling; native move/resize; maximise versus fullscreen; restore bounds across displays; Alt-F4 close review; taskbar activation; keyboard menus; child closure and renderer crash; no duplicate custom/native caption controls |
| Both | Three transfer cycles with draft/selection/undo preserved; two concurrent transfers; stale activation after rebinding; sheet scope versus unrelated app; popup ownership and focus return; timeout/refusal; shutdown with pending save; multi-display geometry; reduced motion; dark/light chrome |

Record exact OS build, Electron/Chromium versions, display scales, selected fullscreen capabilities and known platform limitations. Browser/jsdom success is not native acceptance; a captured screenshot alone is not proof of focus, transition ordering or controller identity.

## Verification commands and stop conditions

From the framework checkout, before and after each framework-facing contract change:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --pretty false
node node_modules/vitest/vitest.mjs run tests/runtime --reporter=dot
node node_modules/playwright/cli.js test tests/e2e/window-management.spec.ts tests/e2e/window-titlebar-layout.spec.ts --project=chromium --workers=1
git diff --check
```

The future host package must supply `npm.cmd test` for protocol/unit tests and `npm.cmd run test:e2e` for launching its packaged-development Electron harness. Those scripts are packet deliverables, not existing commands claimed by this document. Native platform receipts are required in addition to green automation.

Stop implementation and return to design if the configured child cannot share authority, the production browser gate fails, focus/modality require a second logical owner, or native close cannot respect the existing transaction. Do not resolve these failures with duplicated runtimes, serialized React objects, compatibility aliases or silent best-effort transitions.
