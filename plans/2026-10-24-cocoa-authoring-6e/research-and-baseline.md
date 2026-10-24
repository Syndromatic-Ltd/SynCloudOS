# Apple references, original 6C and observed baseline

Research date: 24 October 2026. F and S mean the exact paired checkouts pinned in [README](README.md). All claims here distinguish inspected source, an executed test, a historical statement and a proposed contract.

Latest approved compiler decision: TypeScript 6.0.3 in both repositories and the packed tooling dependency manifests. Security remediation preceded this step. The original 5.9/source hashes and earlier test timings below remain historical evidence; they are not the current compiler baseline. Native TypeScript 7/API work is a deferred optional phase, and no compiler decision authorizes the proposed APIs or app rewrites.

The 6.0.3 migration removes baseUrl in favor of explicit relative path targets, declares app/example roots and environment-specific ambient types, and preserves SDK rootDir src. Production strict mode stays enabled. One deliberate untyped alias-cycle test fixture now explicitly selects its original non-strict mode because TypeScript 6 changes the default. An extra browser-host type fixture's stale rejection of folder discovery was reproduced under 5.9.3 before correction; it now accepts the established discovered-project mode while still rejecting a missing mount element and mutually exclusive modes. These are compiler/test-fixture changes, not new production APIs. Exact execution results and installed package provenance are retained in S's TypeScript 6 validation receipt.

## What the original documents actually say

The relevant originals are outside F, in the paired workspace's specs folder:

| Document | Relevant material |
| --- | --- |
| [6B conventions and SCOS](../../../specs/2026-10-19-6b-conventions-scos-design.md) | App-folder discovery, explicit bundle identity, per-app SCOS bindings, shared-code hooks, own FX imports. See lines 96-146, especially the per-app binding and shared-code rules. |
| [6C AppKit-style class layer](../../../specs/2026-10-19-6c-appkit-class-layer-design.md) | Lines 8-11 explicitly retain React views; section 5, lines 96-109, defines construction ownership and later explicit owners; sections 6-7 define actions and observation; sections 10-11 retain FX prefixes and function components. |
| [6D site migration](../../../specs/2026-10-19-6d-site-migration-design.md) | Application-specific behavior and migration boundaries. This is design history, not evidence every row was accepted. |
| [October 20 real class rewrite brief](../../../specs/2026-10-20-class-rewrite-brief.md) | Lines 3-5 reject a superficial first pass and explicitly exempt SynCal, MemoJournal and NSEControlGallery. Lines 8-25 distinguish controller behavior from permitted local visual React state. |

Short exact excerpts from 6C section 5:

> Outside construction (in a method, after `await`) there is no ambient owner: pass `owner: this` explicitly, or the constructor throws `NSE_CONTROLLER_UNOWNED` in a class-based app.

> **[review]** Throwing here prevents the "disposed controller" class of bugs from coming back.

The after-await rule was a chosen engineering defense, not an Apple API requirement. 6C did not claim every controller in Cocoa needs an explicit constructor owner. The original document's "Today" table records the pre-6C state; it must not be read as the current implementation.

## Is the quoted Sol advice bounded in reality?

Yes, as a direction, with the qualifications below. It correctly supports structural ownership, predictable teardown, explicit construction helpers and cancellation. Its React point agrees with the original retained React-view design and with the rewrite brief's allowance for purely presentational state. The stricter brief's rule against hook-owned application data is preserved; it is not expanded into a ban on every React effect.

| Quoted idea | Present evidence and refinement |
| --- | --- |
| A controller created after await can throw without an owner | Correct but narrower than the actual rule. `F/src/NSE/Controllers/ownership.ts:122-203` holds a synchronous ambient slot; the same rule applies to ordinary later callbacks/methods. `classApplicationsLive` is page-wide, so the presence of an unrelated class app can activate the check. |
| `this.own(...)` should make construction easier | Feasible only when ownership is established before the constructor runs. Use `own(factory)`. Eager `own(new X())` cannot prevent the constructor exception. Do not reuse `instantiateInOwnerScope(parentScope, factory)` naively: its `pendingSelf` protocol can hand a view controller its parent's scope as its own. P01 separates ambient owned factories from framework root construction. |
| Async work should receive cancellation signals automatically | Feasible. Existing `ownerSignal`, scoped SDK clients and view mount cancellation provide a foundation. Signals alone do not fence a late result from an operation that ignores cancellation; tasks also require generation checks and guarded publication. |
| Stale operations should not outlive owners | Implement this as revoked framework authority, cancelled task settlements and resource release. Arbitrary promise bodies can keep executing. External writes already committed cannot be undone by aborting a signal. Do not promise forced termination or full Swift task-group semantics. |
| Ordinary React should remain comfortable | Already partly true: function exports, `useObserve`, `useAction`, `useNSEArrayController`, `useNSETreeController`, refs and presentation hooks exist. Test them alongside class apps and multiple runtimes. Preserve local DOM measurement, IME, focus and animation adapters. |

Additional inspected implementation:

- `F/src/NSE/Application/objectLifetime.ts`: per-object scopes, adopted-child teardown, owner cleanup and aggregation of disposal failures.
- `F/src/NSE/Application/NSEViewController.ts:287-352`: StrictMode detach deferral, one-time `viewDidLoad`, appearance callbacks, mount signal and mount-bound layer acquisition.
- `F/src/NSE/Controllers/useNSEOwnedController.ts`: hook-owned controllers use explicit signals and defer real disposal across effect replay.
- `F/tests/runtime/nse-control-controller-ownership.test.ts:76-111`: existing tests already cover explicit owners after await, deliberate standalone ownership and aborted owners.
- `F/src/SynCloudOS/AppSDK/actions.ts:194-224`: action registration currently hardcodes no automatic undo policy and discards method results. This is a bounded convenience-layer limitation, not evidence document edits cannot be undoable.
- `F/src/SynCloudOS/AppSDK/rootPackageEntry.ts`: `observe` is already exported as an observation utility. The new method decorator is therefore named `observes`.

## Apple and language sources actually consulted

These references guide purpose and behavior. Archived Cocoa material is historical architectural evidence, not a claim about the newest recommended macOS application stack. No Apple code is copied into the framework.

| Source | What was read and what the design takes from it |
| --- | --- |
| [AppKit NSViewController, Objective-C language selection](https://developer.apple.com/documentation/appkit/nsviewcontroller?preferredLanguage=occ) | Controller lifecycle, child containment, represented objects and responder participation. Preserve those responsibilities without pretending a DOM-backed outlet is a full NSView. Search-index documentation was readable; the rendered page exposes a JavaScript shell. |
| [Objective-C: Working with Objects](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/WorkingwithObjects/WorkingwithObjects.html) | Object collaboration, methods, initialization and strong/weak relationships. Ownership concerns responsibility and lifetime; JavaScript GC does not provide deterministic release of subscriptions or devices. |
| [Cocoa object ownership](https://developer.apple.com/library/archive/documentation/General/Conceptual/DevPedia-CocoaCore/ObjectOwnership.html) | Containment versus convenient back references. Preserve one lifetime owner and explicit non-owning links; do not add an ARC emulation to TypeScript. |
| [Cocoa bindings: What Are Bindings?](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaBindings/Concepts/WhatAreBindings.html) | Mediated synchronization, controller selection, placeholders, transformers and editor participation. Bindings must support empty/mixed selections and commit/discard semantics, not merely property assignment. |
| [AppKit NSController](https://developer.apple.com/documentation/appkit/nscontroller) | Existing commit/discard editing responsibilities. Reuse SynCloudOS controller/document transactions rather than inventing another history authority. |
| [Cocoa target-action](https://developer.apple.com/library/archive/documentation/General/Conceptual/CocoaEncyclopedia/Target-Action/Target-Action.html) | Unbound targets resolve through responders. Typed action references identify declarations; they do not capture an instance or bypass command validation. Cocoa action methods are normally void; typed command results here are a SynCloudOS extension, not a Cocoa parity claim. |
| [Enabling Menu Items](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MenuList/Articles/EnablingMenuItems.html) | Availability follows the action target; shared UI validation can serve menus and toolbars. Keep per-command identities independent of translated titles. |
| [Nib files](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/LoadingResources/CocoaNibs/CocoaNibs.html) | Declarative object connections reduce setup. An outlet reference does not inherently own the view. TSX supplies composition; managed handles supply connections and mounting guarantees. |
| [Swift concurrency](https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html) and [TaskGroup](https://docs.swift.org/latest/documentation/swift/taskgroup/) | Parent-child cancellation and cooperative stopping. Swift task groups wait for children; owner-bound JS task descriptors cannot offer that guarantee for uncancellable promises. The proposal borrows scoped authority and cancellation discipline, not actors, compiler isolation or forced stopping. |
| [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/) | Clarity at use sites, consistent terminology and documented effects. Prefer a few recognizable operations over many annotation aliases or compressed strings. |
| [CATransaction](https://developer.apple.com/documentation/quartzcore/catransaction) and [Animating Layer Content](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CoreAnimation_guide/CreatingBasicAnimations/CreatingBasicAnimations.html) | Nested transaction grouping, implicit actions and explicit animations; model versus presentation values and layer-backed view qualifications. Preserve existing AFX semantics and surface-specific limits. |
| [React purity](https://react.dev/learn/keeping-components-pure) and [DOM refs](https://react.dev/learn/manipulating-the-dom-with-refs) | Render calculations stay pure. Use committed refs/effects for DOM work and preserve React's ownership of its tree. Framework-owned AFX styles need one declared authority. |
| [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html) and [JSX runtime configuration](https://www.typescriptlang.org/tsconfig/jsxImportSource.html) | Standard decorators operate on declarations; they do not recover arbitrary interface schemas or automatically change a decorated class's static type. TSX syntax and renderer choice are distinct. The present plan keeps React. |

## Fresh executed checks

Commands ran on the pinned pair using each checkout's own existing dependencies; no install, package refresh or build was performed.

Framework:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/runtime/nse-control-controller-ownership.test.ts tests/runtime/nse-controller-lifecycle.test.ts tests/runtime/nse-view-controller.test.tsx tests/runtime/application-actions.test.tsx --reporter=dot
```

Result: exit 0; **4 files / 94 tests passed**. This is focused existing-contract evidence, not evidence the proposed APIs work.

Site:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/runtime/journal-class-controller.test.tsx tests/runtime/publisher/publisher-class.test.tsx --reporter=dot
```

Result: exit 1; **2 failing files / 7 failed and 4 passed tests**. Repeated React `act` warnings were emitted. Record both harness and application causes during P00; do not suppress warnings globally as a repair.

| Existing failing case | Observed failure |
| --- | --- |
| Journal detached note from sidebar double-click | No matching detached window before polling deadline, `journal-class-controller.test.tsx:87`. |
| Journal detached note from yellow detach button | Same assertion and location. |
| Publisher real selection formatting/find/replace | `openPost` helper receives command status `unknown`, not `executed`, `publisher-class.test.tsx:70`. |
| Publisher smart punctuation/composition | Same `openPost` failure; downstream behavior not reached. |
| Publisher read-only preview session | Same `openPost` failure; downstream behavior not reached. |
| Publisher version-card session | Same `openPost` failure; downstream behavior not reached. |
| Publisher New Post controls and overlay reset | Expected template `white-page`, received `journal-paper`, line 214. |

`S/HANDOFF.md` records similar historical failures and separate browser evidence. Its old package provenance is stale relative to the current receipt. The fresh results above confirm failures still exist; they do not determine root cause. The previously mentioned Publisher ResizeObserver watchdog remains an unverified historical concern to check at P00/browser gates.

Not executed for planning: full suites, framework/site typechecks, SDK packaging, production builds, preview server/browser comparisons, installed clean-consumer tests or device/GPU benchmarks. These are future implementation gates, not silently assumed successes.

The later Node maintenance restarted existing previews and performed HTTP smoke checks as recorded below. It did not perform browser visual comparisons, rerun the test baseline or change the installed SDK.

## Migration completion is not a boolean based on the default export

Journal has real application, window and region classes. Publisher has real classes too, plus considerable forwarding getters/setters and manual view connections. Neither has complete current acceptance. `JournalBody.tsx` still creates a `TextEditingSession` in an effect; classify that resource's authority explicitly. Publisher's `PublisherCanvas.tsx` uses hooks for DOM measurements and local comment presentation, which may remain valid. Do not count every surviving hook as an incomplete migration, and do not call a class wrapper alone a completed migration.

## Modernization extension and separately authorized Node maintenance

The user added native TypeScript 7, Bun, coordinated dependency updates, security and significant complete-test optimization to the requested design. See [modernization design](toolchain-modernization.md) and [M00-M08 plan](modernization-implementation-plan.md). Repository source/config/dependency implementation is still prohibited during planning.

### Executed host maintenance, 24 October 2026

The user then explicitly instructed an immediate Node update. The host initially resolved `C:/Program Files/nodejs/node.exe` as 24.15.0; WinGet identified the installed package as `OpenJS.NodeJS.LTS` with 24.22.1 available. The first direct MSI execution attempt was rejected by automatic approval review before running. The supported Windows Package Manager alternative succeeded:

```powershell
winget upgrade --id OpenJS.NodeJS.LTS --exact --version 24.22.1 --source winget --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
```

WinGet downloaded the official nodejs.org installer, reported a verified installer hash and finished with `Successfully installed`, exit 0. Fresh verification:

| Check | Observed result |
| --- | --- |
| `node --version` | v24.22.1 |
| `where.exe node` | Program Files executable first; separate Codex-managed runtime also present |
| `winget list --id OpenJS.NodeJS.LTS --exact` | installed 24.22.1 |
| Executable Authenticode | Valid; OpenJS Foundation signer |
| Fresh `process.versions.openssl` | 3.5.9 |
| Fresh `process.versions.undici` | 7.30.1 |
| `tls.rootCertificates`, parsed with X509Certificate | no subject containing `emSign ECC Root CA - G3` |
| `npm.cmd --version` | 12.0.2 resolved after update; not a claim that every global npm package was upgraded |

The [official Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1) identifies the runtime/security and CA updates. Root-list inspection is a bounded local check, not a complete TLS/revocation audit or a guarantee against every vulnerability. Browser/OS/Bun/workerd trust authorities require their own maintenance.

Two pre-update Vite server trees still used the old in-memory Node executable. The webspring-folders preview was restarted; automatic approval review initially rejected restarting the unrelated MindTheGap preview. The user explicitly approved that second restart, which then succeeded. There is no outstanding restart approval.

| Preview | Checkout and configuration | Fresh process | Smoke result |
| --- | --- | --- | --- |
| webspring-folders | S, Vite `--mode preview --port 5180 --force`; existing `.env.preview` preserved | PID 55820, started 24 October 05:44 local using patched Program Files Node | HTTP 200 at `http://127.0.0.1:5180/` |
| MindTheGap | `C:/Users/Kavish Krishnakumar/Developer/MindTheGap-SynWare`, existing Vite config, port 5241 | PID 74732, started 24 October 05:46 local using patched Program Files Node | HTTP 200 at `http://127.0.0.1:5241/` |

Both helpers were started with hidden windows. Their stdout/stderr logs are under `C:/Users/Kavish Krishnakumar/AppData/Local/SynCloudOS/maintenance/node-24.22.1/`. The old system-Node preview/launcher processes were stopped; fresh enumeration showed only the two new system-Node servers. PIDs are point-in-time evidence, not enduring identifiers. Embedded Node runtimes owned by Codex, Raycast and Adobe were not replaced or restarted.

No framework/site source, test, manifest, lockfile, package archive or receipt was changed by this maintenance. The older focused test timings remain pre-maintenance observations. New performance comparisons must begin with a post-update baseline.

### Read-only dependency and toolchain evidence

Both package-lock files currently resolve TypeScript 5.9.3, React/React DOM 19.2.5, Vite 7.3.6, React plugin 5.2.0, Vitest 4.1.11, jsdom 29.1.1 and Playwright 1.61.0. S additionally resolves Cloudflare plugin 1.62.5 and Wrangler 4.147.0. Bun on the host remains 1.4.0; its upgrade was not part of the immediate Node authorization.

Read-only npm audits exited 1 in both checkouts: F seven affected package records (four high, three moderate), S seven (two high, five moderate). The [saved JSON summary](dependency-audit-2026-10-24.json) preserves advisory ranges, dependency propagation and reported fixes. No audit fix/install was performed. These findings require reachability/parent-chain review; the site's reported major Cloudflare downgrades are not selected remediation.

Primary material read for this extension includes Microsoft's [7.0 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [6.0 migration changes](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) and [7.1 beta API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/); Vite's [migration guide](https://vite.dev/guide/migration); Vitest's [5.0 migration](https://vitest.dev/guide/migration/) and [performance guide](https://vitest.dev/guide/improving-performance); Bun's [lockfiles](https://bun.com/docs/pm/lockfile), [lifecycle policy](https://bun.com/docs/pm/lifecycle), [Node compatibility](https://bun.com/docs/runtime/nodejs-compat), [TypeScript 6/7 configuration](https://bun.com/docs/typescript-6) and [1.4.4 release](https://bun.sh/blog/bun-v1.4.4); React's [versions](https://react.dev/versions) and [19.3 release](https://react.dev/blog/2026/09/09/react-19-3); Mozilla's [eMudhra incident response](https://blog.mozilla.org/security/2026/10/20/protecting-firefox-users-following-the-compromise-of-emudhra-intermediate-certificates/), Node's [October security notice](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) and [24.22.1 release](https://nodejs.org/en/blog/release/v24.22.1), and PHP's [2026 advisories](https://www.php.net/archive/2026.php). Exact candidate package versions/peers/engines were queried from npm registry metadata and linked in the modernization design.
