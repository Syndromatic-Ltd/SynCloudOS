# Command/controller and authentication hardening implementation plan

> **For agentic workers:** Execute bounded fixes against existing contracts; preserve concurrent work and use failing regressions before implementation.

**Goal:** Make standard class-app actions, controls and menus reliable through focus, validation, ownership and authentication transitions; fix login followed by app launch without a page reload.

**Architecture:** Preserve 6C's application/window/view-controller hierarchy and 6B's app-bound SCOS conventions. Standard controls own activation validation and presentation plumbing. Runtime identity owns authorization and revocation. Use the 6E research as design evidence, without treating its proposed decorators, tasks, binding descriptors or APIs as implemented/approved.

**Tech Stack:** Existing TypeScript 6.0.3, React 19, Vitest, Playwright and installed SynCloudOS SDK archive.

## Constraints and acceptance

- Keep the exact paired webspring-folders framework/site worktrees and all prior dirty repairs.
- No source aliases, weakened authorization/validation fences, page reload workaround, silent command success, API compatibility shims, new public authoring API, commit/push or deployment.
- Reproduce each concrete issue. Fix its authoritative framework owner and add regression coverage for ordinary app declarations.
- Live login must publish authorization before apps can launch; logout/expiry/supersession must still revoke existing authority.
- Inspect 6A/6B/6C and the 6E research/design alongside current commands/responders/controllers/authentication docs. Record adopted contracts separately from proposals.

## Packet A — authentication transition (main agent)

Files: `src/SynCloudOS/Authentication/createHttpAuthentication.ts`, `src/SynCloudOS/Identity/IdentitySessionService.ts`, `src/SynCloudOS/Runtime/createSynCloudOS.ts`, browser host wiring and the narrow authoritative source found by tracing.

- [x] Reproduce anonymous → login → Journal launch, without navigation/reload restoring authority.
- [x] Trace server/auth-service/identity-session/login/statechart/route ownership and add a failing regression at the broken boundary.
- [x] Fix publication ordering and stale-work handling while retaining logout/expiry and cross-session fences.
- [x] Cover repeat login/logout, delayed validation and post-login ordinary app launch in unit/browser checks.

## Packet B — command/controller contract audit

Files: `src/SynCloudOS/AppSDK/actions.ts`, action hosting/ownership, `src/NSE/Controls/Core/useNSEControlCommand.tsx`, menus/toolbars/pickers/segmented and overflow controls, command clients and relevant tests.

- [x] Inventory standard activation paths, cached presentations, handler registration, controller lifetimes, explicit/default target selection and error/cancellation propagation.
- [x] Review existing code and earlier repairs against the research and identify concrete reproducible footguns, with target files and tests.
- [x] Add minimal failing regressions and harden shared owners; keep direct stale-controller calls fail-closed and preserve command/payload/target/owner/session authority.
- [x] Audit controller construction/disposal and action metadata/validator mistakes for deterministic diagnostics rather than silent partially bound states.
- [x] Record findings fixed, already protected, and any proposed API work deferred for a separate decision.

## Packet C — review, installed SDK and acceptance

- [x] Independently review shared-authority changes and resolve concrete findings.
- [x] Run affected focused suites and broader shared-command/auth/lifecycle checks appropriate to the changes.
- [x] Build/package framework once source is stable; sync checksum-verified archive into site, restart exact local preview, run site checks and existing Publisher regressions.
- [x] Verify anonymous/login/app launch and standard command surfaces in a real browser without reload workarounds, including errors and actual rendered outcomes.
- [x] Save audit evidence and current provenance, run diff checks, and leave preview running. Keep production OIDC/device validation distinct from local acceptance.

## Bounded controller ownership packet — 27 October 2026

Scope: the exact `webspring-folders/framework` worktree. Changes are limited to
`src/NSE/Application/{objectLifetime,NSEViewController,NSEWindowController}.ts`,
`src/NSE/Controllers/ownership.ts`,
`tests/runtime/nse-controller-ownership-hardening.test.tsx`, and two missing-view
fixtures in `tests/runtime/nse-ownership.test.tsx`. No changes to application
hosting, actions, authentication, shared controls, or public barrels belong to
this packet. `applicationSession.ts` needed no edit: the shared construction
boundary now handles rollback for applications, windows, and `addChild(Class)`.

Implemented existing 6C contracts:

- Released/disposal-started scopes reject new controllers before derived field
  initializers, including explicit `owner` and known `ownerSignal` during
  `didDispose`. Teardown still releases adopted children before the owner and
  aborts resource signals afterward.
- Window content adoption validates before changing the content pointer or
  snapshot. A view root cannot belong to two windows or simultaneously become a
  contained child. Moving an already-owned root into its same window keeps the
  original disposal registration.
- Framework-controlled constructor failure disposes the partially initialized
  object, adopted descendants and resource scope, restores the ambient owner,
  and rethrows the original value even when cleanup throws. Application rollback
  retains `application-closed`; window/child construction rollback uses the
  existing `explicit` reason. No new disposal reason was introduced.
- View/window disposal publishes a single observer change even when
  `didDispose` throws. Production-host regressions verify rendered content is
  removed. A committed root replacement also publishes if previous-root
  cleanup throws; a rejected adoption publishes nothing.
- Internal direct export `getNSEObjectOwners(target): readonly object[]` lives
  in `src/NSE/Application/objectLifetime.ts`. It returns target, then recorded
  view/window/application owners, nearest first, with cycle fencing. Private
  WeakMaps record object scopes, current adoption and signal ownership. A
  framework-created window obtains application ancestry from the framework's
  construction-context data property, without evaluating `target.app`, other
  app-defined getters, or arbitrary object properties. Unknown targets/signals
  have no inferred ancestors. The result is a snapshot for main's action
  observation wiring, not a public API or a subscription. Adoption updates
  subsequent snapshots; main owns observation cleanup/rebinding.

### Exact ambient-construction limitation and recommendation for main

Given `HostWindow` constructed in a framework scope, `new Root()` inside its
constructor is adopted by that window, but an implicit
`Root.rows = new NSEArrayController(...)` still sees the **window's** ambient
scope. Replacing/removing Root disposes Root but leaves those rows alive until
the window closes. The regression
`records the ambient limit for raw nested constructors without changing later window fields`
records both that behavior and correct ownership of fields constructed after
the nested `new Root()` returns.

The base constructor cannot observe the return/throw boundary of an arbitrary
derived JavaScript constructor. Changing the ambient owner in `super()` would
silently steal later outer-window field constructions; microtask restoration
would also miss the synchronous boundary. No constructor wrapping, public
factory, stack inspection, or heuristic diagnostic is added. The same boundary
limits rollback of raw direct `new` calls whose errors are caught by app code;
rollback here is guaranteed at existing framework-controlled construction
boundaries.

Use the existing explicit contract inside directly nested view controllers:

```ts
class Root extends NSEViewController {
  readonly rows = new NSEArrayController<Row>({
    owner: this, id: "rows", getId: row => row.id,
  });
}
```

The companion regression verifies rows dispose with Root while window-owned
rows remain alive. `addChild(ControllerClass)` already establishes a bounded
child construction scope and retains automatic ownership. Passing an owner to
the **Root constructor alone** does not retarget its implicit fields; put
`owner: this` on the fields that Root must own. Main should carry this precise
recommendation into broader authoring docs; proposed 6E factories/decorators
remain unimplemented and provide no authority for this packet.

### Verification record

- Initial test-first run: 16 failures / 1 pass, reproducing all five requested
  failure categories and the missing internal ownership helper. Later failing
  regressions caught application rollback reason drift, signal-owned ancestry,
  and signal-only construction during teardown before their respective fixes.
- Self-review checked same-scope adoption, failure atomicity, preserved original
  construction errors, disposal publication, ancestry cycles, ambient restoration,
  public export boundaries, and untouched concurrent files.
- Focused Vitest command: `vitest run` with
  `nse-controller-ownership-hardening`, `nse-ownership`,
  `nse-window-controller-class`, `nse-view-controller`,
  `nse-control-controller-ownership`, `nse-controller-lifecycle`,
  `nse-application`, `application-actions`, and
  `application-action-registration-order` under `tests/runtime/`.
- Final run: **9 files / 166 tests passed**, including **23** tests in the new
  ownership-hardening suite and main's automatic application-state action
  invalidation regression. The modal ancestry action test emits React's
  `useInsertionEffect must not schedule updates` warning; that main-owned host
  integration is outside this packet. No missing-static-view fixture diagnostics
  remain in the focused ownership suite.
- Changed-file whitespace checks passed, honoring the existing CRLF ownership
  fixture with `core.whitespace=cr-at-eol`; the new test and plan have no trailing
  whitespace. Existing concurrent modifications were retained.
- Packaging, builds, browser/device/human acceptance, commits, pushes and
  subagents are outside this packet and were not run.

## Integration follow-up

The ownership packet above is historical evidence from its bounded worker run.
The main integration subsequently fixed the overlay teardown insertion-effect warning;
the 26-suite shared run passed 472 tests without it. Framework and site builds and
the site's 8 Node/218 Vitest tests passed against archive `ea7eba098379...`.

The two-cycle browser test then exposed retained application sessions on explicit
logout. The runtime now closes all open apps (including suspended apps) through
their canonical lifecycle before locking identity. New tests cover disposal/fresh
construction, termination veto, save failure and suspended-app cleanup. The final
operation-cancellation review and replacement installed archive/browser run passed;
the earlier receipt is historical rather than acceptance of that follow-up.

## Final integration acceptance

- Framework: 28 shared suites / **491 tests**, TypeScript check and SDK build passed.
- Site: **8 Node + 219 Vitest tests**, TypeScript check and production build passed.
- Final combined browser run: **6/6 passed** in 99.5 s. Two ordinary login/logout
  cycles launched Journal and Publisher with the original `performance.timeOrigin`;
  light/dark settings, row Open/Duplicate/Delete, Versions restore/reload and full
  authoring/image/preview/persistence flows passed. Page-error assertions passed.
- Independent reviews found no remaining concrete blocker after correcting
  commit-notification cleanup, hidden-at-preparation, nested modal ancestry,
  obsolete React subscriptions and Publisher's delayed title selection.
- The first combined run exposed an intermittent post-creation menu failure.
  Four isolated dark runs and a combined rerun passed, then a deterministic clock
  regression reproduced the unguarded 60 ms title-selection call. Replaced that
  timer with a post/session-bound, one-time canvas layout intent respecting newer
  focus. The final 6/6 browser run and 219 site tests include this repair. The
  timer race is reproduced; attribution of that earlier browser failure remains
  an inference, not a captured original stack.
- Installed framework commit: `e0e1300a41491e51f28f32cfe297c8db5a399ef8`, dirty.
- Archive SHA-256: `eef0bb5b33e5ded70328df8fa06ca2fc6b286f6987f2f18c14150e16cb9a6a52`.
- Source SHA-256: `d7258f4972abd20a443a3ef93a105f49fd39046daf4f6f4e2d733655f6abcf77`.
- Receipt, vendored archive and installed dependency agree; archive checksum
  independently verified. Framework/site diff checks passed. Dirty provenance
  remains explicit; no commit, push or deployment was performed.
- Exact paired-site Vite remains running at `http://127.0.0.1:5210/` with the
  external local-auth config. `/__dev/login` and normal founder sign-in work.
  The user's original Untitled Post route was restored without clearing data.
- Final preview follow-up prebundles the SDK browser entries used by this site,
  preventing Gallery's first lazy import from triggering a Vite dependency reload.
  After that config-only restart, the ordinary two-cycle login test passed again
  in 24.4 s with unchanged document time origin. Gallery cold-launched and its real
  text input/Undo/Redo/Undo changed 89 -> 103 -> 89 -> 103 -> 89 characters without
  new console errors, leaving the sample restored. Its temporary tab was closed.
- Logs and screenshots: `integration/webspring-folders-preview/command-hardening-*`
  and `publisher-final-running.png` / `gallery-final-running.png`, outside both repositories.

See [the consolidated audit](2026-10-27-command-controller-audit.md) for adopted
existing contracts, inspected surfaces and the raw nested-construction limitation.
