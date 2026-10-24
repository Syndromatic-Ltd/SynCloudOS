# 6E: Cocoa-style SynWare authoring and platform modernization

Status: proposed design and executable implementation handoff, 24 October 2026. No implementation is authorized by the creation of these documents. The user selected classes, decorators and bindings with TSX layout, requested a complete design and plan, and explicitly said not to implement yet.

Scope addition: native TypeScript 7, Bun, coordinated dependency/runtime security upgrades and substantial full-suite/runtime optimization are now included. The user's later immediate-maintenance instruction separately authorized updating the host Node installation and restarting the identified previews. That maintenance is complete; the API, app and repository toolchain changes remain proposed.

Latest authorization: security remediation was implemented with zero dependency-audit findings, and the user approved upgrading both repositories to **TypeScript 6.0.3**. That exact compiler version is the 6E baseline. [TypeScript decision](typescript-decision.md) records the approved choice; native TypeScript 7/API work is a deferred optional phase. Bun, build/renderer major upgrades, the authoring APIs and app migrations remain proposed until separately authorized. Historical hashes and test observations below belong to the original planning snapshot; current package provenance is recorded in S's vendor receipt and validation reports.

## Read in this order

1. [Design and public contracts](design.md): decisions, exact API shapes, ownership, React integration, documents, FX and failure behavior.
2. [Implementation plan](implementation-plan.md): ordered work packages, file ownership, regression examples, commands and acceptance gates.
3. [Application migration matrix](app-migration-matrix.md): all eleven installed application bundles, remaining migration work and feature preservation.
4. [Apple references, 6C comparison and baseline](research-and-baseline.md): inspected sources, assessment of the quoted advice and fresh test results.
5. [Toolchain, security and performance design](toolchain-modernization.md): current versions/advisories, native TypeScript API obstacle, Bun boundaries, Vite decorators and evidence-led test/FX optimization.
6. [Modernization implementation plan](modernization-implementation-plan.md): M00-M08 work packages and their ordering with P00-P14. The [dependency audit summary](dependency-audit-2026-10-24.json) preserves the read-only findings.
7. [Complete direct-dependency survey](direct-dependencies-2026-10-24.json): all 38 distinct non-file direct packages, exact lock versions, registry candidates and engine/peer constraints.

## Exact working pair

| Label | Absolute checkout | Branch | Planned-at HEAD |
| --- | --- | --- | --- |
| F | `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework` | `dev` | `a916cea4465d2b2d5ef56b49717b231da6ea02b8` |
| S | `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/site` | `feature/webspring-experiments-folder` | `9a78fd30f6b2cab61fcf469a72c37c08ae202b23` |

S's `vendor/framework-receipt.json` identifies F's same commit. Its archive SHA-256 is `29723f3bc79b14856368514429afe57cf6dc88e9a3d1dff817ea4b42673dede4`, source SHA-256 `6735bb3fb73e52dcb8d909144d0b8e7f3516a46f9b05ef0f0885d05435131467`. Both checkouts were clean before planning. The workspace directory above them is not itself a Git repository. Historical `SynCloudOS4` and the older canonical `packages/SynCloudOS` checkout are not this implementation baseline.

## Decisions and boundaries

- App and document behavior belongs in application/window/view controllers and app-owned domain objects. TSX describes layout. React remains the renderer.
- Ordinary React function components, local visual state, DOM measurement, refs, layout effects and existing NSE hooks remain supported. This is a permanent integration choice.
- Keep 6C's ownership hierarchy. Add safe construction factories and lifetime-bound work; preserve errors for actual misuse.
- `this.own(() => new Controller(...))` establishes ownership before construction. `this.own(new Controller(...))` is not an accepted API.
- A JavaScript promise cannot generally be forcibly stopped. Cancellation revokes publication authority and signals cooperating operations; it does not roll back external writes.
- New decorators are `@preference`, `@outlet` and `@observes`. The latter intentionally differs from the earlier conversational `@observe`: `observe(object, listener)` is already an exported utility and keeps its meaning.
- Retain `@observable` and extend `@action`. Tasks and bindings use inspectable typed descriptors; there is no initial `@task`, `@undoable` or runtime type-reflection system.
- Preserve all app identities, persisted keys and data formats, route names, document histories, authentication, PolicyKit decisions, control behavior, visuals and FX quality. No renderer replacement, app redesign, Enyo/Onyx additions or revived public editor API.
- No deployment, publishing, push, release, external messages or memory updates are part of this plan.
- Use exact TypeScript 6.0.3 for the approved compiler baseline, preserving the JavaScript compiler API, strict production checking, standard decorators and TSX. Bun, Vite 8, React 19.3 and Vitest 5 remain proposed modernization steps. Retain normal external SDK consumers and browser/workerd portability.
- TypeScript 7.0 lacks the compiler API used by our tools. A later native port requires an API-bearing stable 7.x release and a validated tooling port. It is optional deferred work, not a prerequisite for 6E authoring/app migration or test-performance acceptance.
- Optimize complete validation through measured environment/import/build/install/scheduling costs. Preserve discovered cases, assertions, browser projects and visual/FX quality. Do not equate Bun package management with a bun:test rewrite.

## Implementation order and status

The [modernization plan](modernization-implementation-plan.md) adds M00-M08: security baseline, inventory/measurement, Bun installs/provenance, compiler evolution, Vite/decorators, coordinated React/test/browser upgrades, test execution/cache ownership, bounded runtime/FX optimization, and final evidence. M03A is the approved TypeScript 6.0.3 stage; M03B is the deferred native port. M00 precedes broad migration; M01 establishes comparable measurements; M02/M04/M05 support new authoring. M03A and M08 apply to the current compiler decision; M03B is admitted only by a later decision. P09 remains the installed authoring gate.

| Package | Deliverable | Prerequisite | Status |
| --- | --- | --- | --- |
| P00 | Reproduce and resolve existing Journal/Publisher conformance failures | baseline below | planned |
| P01 | Safe owned factories and coherent lifetime epochs | P00 investigation; existing behavior characterized | planned |
| P02 | Managed tasks with cancellation and guarded publication | P01 | planned |
| P03 | Class TSX hosting, dependency declarations and main-window shorthand | P01 | planned |
| P04 | Value/editor bindings and control integration | P01, P03 | planned |
| P05 | Preferences, observations and navigation restoration | P02, P04 | planned |
| P06 | Typed action references and complete command semantics | P01, P04 | planned |
| P07 | Managed outlets and scoped AFX transactions | P01, P03 | planned |
| P08 | Managed AFX renderers and frame activity; preserve all other FX | P02, P07 | planned |
| P09 | Packed-SDK/toolchain/HMR/test-host coverage | each new public contract; final gate after P08 | planned |
| P10 | About, Software, Diagnostics and Chronosphere | P03-P09 | planned |
| P11 | Portfolio and AnimationFX | P02-P10 | planned |
| P12 | Journal and JournalPublisher completion | P00-P11 | planned |
| P13 | SynCal, MemoJournal and NSEControlGallery full class migration | P00-P12; explicit review of historical exemptions | proposed later wave |
| P14 | Cross-app/installed-package/browser acceptance and documentation | P10-P13 | planned |

P13 is included because this request asks for the full application migration. The October 20 exemptions are recorded, not erased or misreported as completed work. Approval of this handoff must explicitly retain or include that later wave; an executor may not silently drop it or rewrite exempt apps before that decision. This document does not constitute that implementation approval.

## Current evidence, not future acceptance

The following focused results and original no-implementation statements are historical planning evidence. Later security work passed additional checks and rebuilt the installed package; TypeScript 6 execution evidence is retained with site validation reports. Do not mistake this original snapshot for current HEAD/receipt state.

- Fresh framework run: four focused files, **94 tests passed** (ownership, controller lifecycle, view controllers, actions).
- Fresh site run: Journal class and Publisher class files, **4 passed / 7 failed**, two failing files. The seven failures are prerequisites, not accepted migration outcomes.
- No full test suite, production build, browser acceptance or device/GPU assessment was run for this planning task.
- Dependency audits found seven affected package records in each checkout: F four high/three moderate; S two high/five moderate. These include development/transitive tools and do not establish production exploitability. No audit fix or dependency installation was performed.
- Host Node was upgraded from 24.15.0 to patched 24.22.1 LTS through WinGet; signature/version/embedded dependency/root-list checks passed. Both identified Vite previews were restarted and returned HTTP 200. See the research file for bounded maintenance evidence.
- Repository changes are confined to this documentation package. Source, tests, manifests, dependency archives and historical design documents are unchanged.

## Starting execution after approval

Read the complete pack, capture `git status --short` in F and S, compare the planned-at commits to current HEADs for each package's scoped files, and resolve drift before editing. Keep app migration work behind its framework and package gates. Test and build SDK archives serially; install the exact archive into S through the fully specified framework:sync command in the implementation plan rather than source aliases or shared `node_modules`.

The implementation plan contains future verification commands. Their inclusion does not mean they have passed. Human visual acceptance remains separate from automated and static checks.

## Planning verification

Documentation review checks the Markdown documents and audit summary, local links, balanced fenced examples, final newlines/trailing whitespace, P00-P14/M00-M08 coverage and all eleven application sections. New source/test paths are labeled as planned creations; existing edit scopes are grounded in F/S. The review covers API names/lifetimes as well as native compiler access, decorator transforms, tool subprocesses, lock/provenance inputs and test completeness.

That original planning stage changed only this package. Later explicitly authorized security remediation and TypeScript 6.0.3 update source/config/compiler fixtures and rebuild the installed SDK; their current HEADs and receipt therefore differ from the original planning hashes. Validation reports distinguish those executed changes from the still-proposed API/app/major-upgrade gates. No application rewrite or new public authoring API is implemented by the compiler upgrade.
