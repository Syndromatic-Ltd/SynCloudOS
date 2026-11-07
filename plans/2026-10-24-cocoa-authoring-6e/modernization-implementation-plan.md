# Toolchain, security and performance modernization implementation plan

> **For agentic workers:** Use superpowers:executing-plans task by task after repository implementation is authorized. Delegate only if the user authorizes delegation. This is a planning handoff. The separately authorized host Node update is recorded below and does not authorize executing the remaining steps.

**Goal:** Move webspring-folders onto a patched, reproducible TypeScript 6.0.3 baseline and admitted Bun/Vite/React modernization stages, with substantially faster complete validation and preserved apps/package/FX behavior. Native TypeScript 7 is an optional later phase.

**Current authorization:** M00 security remediation and M03A exact TypeScript 6.0.3 are approved. The [TypeScript decision](typescript-decision.md) is adopted. Other broad dependency/runtime/API/app changes remain on hold. M03B describes an optional deferred native port and is not a requirement for completing the current compiler or authoring/app migration stage.

**Architecture:** Preserve the paired F/S repositories and installed SDK boundary. Modernize package/tool execution, compiler analysis and transforms with explicit compatibility gates. Partition and schedule existing tests by their real environment/resource ownership; cache only verified immutable artifacts. Run the authoring/migration programme through these gates.

**Tech stack:** Approved exact TypeScript 6.0.3; patched Node 24.22.1 LTS, Vite 7.3.7 and Vitest 4.1.12. Candidates requiring separate admission: Bun 1.4.4, Vite 8.3.5, React/React DOM 19.3.1, React plugin 6.1.2, Vitest 5.0.5, jsdom 30.1.3, Playwright 1.64.1, Cloudflare plugin 1.65.0/Wrangler 4.152.0. Native TypeScript 7/API work is deferred.

## Global constraints

- F and S, pinned commits and receipt are in [README](README.md). Inspect both statuses and source drift before each package. Preserve unrelated user work.
- Read the [modernization design](toolchain-modernization.md), [authoring plan](implementation-plan.md), [app matrix](app-migration-matrix.md) and saved [audit](dependency-audit-2026-10-24.json). The design supplies decisions and acceptance definitions below.
- Version numbers are reviewed candidates as of 24 October, not an instruction to install moving latest tags. Revalidate official advisories/metadata and pin accepted versions when implementation starts.
- Security remediation and exact TypeScript 6.0.3 are explicitly authorized exceptions to planning-only work. Other source/API/app/upgrade phases require separate admission. No deployment, publish, push, merge or memory update.
- Preserve all application behavior, identities, routes, persistence and document histories, authorization, accessibility, browser support, high DPR, full FX quality and the installed package boundary.
- No legacy decorator mode, public app helper, browser Bun global, source-linked SDK, shared mutable consumer install, silent test omission or unreviewed CA override.
- Keep the original assertions, complete discovered-test manifests and existing skip reasons. Fix underlying failures rather than weakening gates. A benchmark containing failures is not acceptance evidence.
- Node/npm commands below reproduce the existing baseline. After M02, use the documented Bun command entry points; npm remains an external-consumer gate. Serialize SDK output mutation throughout.

## Ordering and connection to P00-P14

```text
Immediate host Node security maintenance (done, verify evidence below)
M00 dependency/runtime security triage -> P00 existing class-host repairs
M01 inventory/measurement (can begin before P00; final comparisons require P00 green)
M02 Bun installation/provenance -> M04 Vite/decorators -> M05 React/test stack
M03A stable TypeScript 6.0.3 -> current compiler/authoring baseline
M03B optional native compiler/API (deferred; separate admission)
M06 test topology/cache/scheduling -> M07 bounded tooling-runtime/FX performance
P01-P08 authoring contracts, through M02/M04/M05 toolchain as available
P09 installed authoring gate -> P10-P13 eleven application migrations
M08 complete modernization evidence + P14 final cross-app acceptance
```

M00 and M03A do not wait for a TypeScript 7.1 release. M03B is deferred and does not block other admitted packages or current 6E completion. A native migration cannot be claimed while its own API gate is open. Rerun baseline patches through affected tests before stacking another toolchain change. Keep each package reviewable.

## Immediate maintenance evidence

On the user's separate instruction, Windows Package Manager upgraded `OpenJS.NodeJS.LTS` from 24.15.0 to 24.22.1 using the official nodejs.org MSI and verified its installer hash. Fresh invocations resolve `C:/Program Files/nodejs/node.exe` as 24.22.1; WinGet's installed inventory agrees and the executable has a valid OpenJS Foundation signature. Fresh Node reports OpenSSL 3.5.9, embedded Undici 7.30.1, and no `emSign ECC Root CA - G3` in `tls.rootCertificates`.

The webspring-folders S preview was restarted with this executable at `http://127.0.0.1:5180/`, mode preview; it returned HTTP 200. The user separately approved restarting the existing MindTheGap preview at port 5241; its maintenance evidence is recorded in [research/baseline](research-and-baseline.md). App-owned embedded runtimes were not modified. Repository engine/CI pins and dependencies remain future changes.

## M00. Resolve the security baseline before broad migration

**Owns F:** package.json, package-lock.json while npm is still authoritative; `.github/workflows/framework-boundaries.yml`; scripts/developer-mcp and schema consumers only if needed for a demonstrated security update; dependency notices.
**Owns S:** package.json, package-lock.json; `.github/workflows/site-quality.yml`; Cloudflare integration configuration only if a verified fix needs it.
**Evidence:** `plans/2026-10-24-cocoa-authoring-6e/dependency-audit-2026-10-24.json`; future measured reports under `.artifacts/modernization/` in each checkout, not a public framework API.

**Consumes:** read-only audit, official runtime/dependency advisories, locked dependency paths. **Produces:** patched supported runtime/lock baseline or explicit unresolved findings with owner/exposure and a completion gate; no claim that latest equals secure.

- [ ] Recheck `node --version`, `where.exe node`, `npm.cmd --version` and both git statuses. Verify existing preview process ages/paths, and avoid restarting unrelated software without authorization. Inventory CI/container/deployed workerd runtimes separately from the host binary.
- [ ] Run `npm.cmd audit --json --ignore-scripts` in F/S and preserve machine-readable results. Run `npm.cmd explain undici`, `npm.cmd explain body-parser`, `npm.cmd explain fast-uri` and `npm.cmd explain zod` in F, and `npm.cmd explain undici` in S. Record exact paths, reachability and direct/transitive ownership.
- [ ] Apply reviewed fixed patch releases first where possible; Vite 7.3.7 and Vitest 4.1.12 are the audit's immediate baseline suggestions, not final modernization targets. Resolve body-parser/fast-uri/Undici through compatible parent updates or a justified version override with affected integration tests. Do not apply broad force-fix commands.
- [ ] For Zod's reported major fix, inventory imports/schema operations in MCP/tooling, preserve accepted/rejected payloads and error contracts with fixtures, then move to the reviewed fixed release. Do not turn schema validation into permissive casts or drop bounds to make tests pass.
- [ ] Resolve Cloudflare/Miniflare/Undici against actual upstream supported versions and nested installed versions; reject the audit's automatic large downgrade suggestion. Compare dev, test and deployed graphs. If no safe fix exists, retain the explicit unresolved-security gate while independent work proceeds.
- [ ] Pin a patched supported Node version in both CI workflows and document the runtime floor in both manifests. Use Node 24's type package line, and check jsdom/native tool engine requirements. Reproduce on CI Linux and Windows without blanket lifecycle-script trust.
- [ ] Run affected validation/schema/command/package tests, both checks and boundary checks, plus P00's original Journal/Publisher files. Rerun audit, store residual findings with explanations, and verify no source/API failure was introduced. Do not attribute an old P00 failure to this patch without a comparison.

**Exit:** known fixes applied and proven; runtime floors documented; no unexplained high/critical finding represented as accepted security. These changes occur only during the authorized implementation phase; the host update is already complete.

## M01. Capture inventory and performance baselines

**Create F:** `scripts/quality/test-inventory.mjs`, `scripts/quality/measure-command.mjs`, `tests/packaging/test-inventory.test.mjs`, `tests/packaging/measure-command.test.mjs`.
**Create S:** `scripts/test-inventory.mjs` using the same report schema; a Node regression at `tests/node/test-inventory.test.mjs`.
**Inspect:** both Vitest configs/setups, F `.github/workflows/framework-boundaries.yml`, `scripts/test-e2e-matrix.mjs`, `scripts/synware/installed-consumer.mjs`, current packed tests and all S node/browser scripts.

**Report contract:** schemaVersion, sourceHead/sourceFingerprint, lock hash, tool versions, OS/CPU/RAM, command argument array, cwd, cold/warm definition, elapsedMs, CPU measurement method, peak memory measurement method/value, exitCode, discovered case identities, pass/fail/skip/retry counts, phase timings and artifact IDs. Do not fake unsupported memory telemetry as zero; mark it unavailable. Store reports under `.artifacts/modernization/`.

Case identity is the tuple `{ checkout, project, relativeFile, suitePath, testName, parameterCase }`; use runner-discovered identity when it has a stable richer equivalent. A test's project/device dimension is part of identity. Discovery failures and empty expected projects are errors.

- [ ] Add small synthetic nested-suite/parameter/project fixtures for inventory union checks: no cases lost, duplicate detection, discovery errors, zero expected project cases and unchanged skip reasons. Verify the command recorder returns a child's nonzero exit and termination instead of reporting success.
- [ ] Discover Vitest files/cases from each checkout's real config; list Node packaging/site tests and the seven Playwright projects through their real runners. Compare actual discovery with the 748/38 filesystem counts rather than hardcoding those numbers as expected test totals.
- [ ] Measure the existing F/S focused commands from the original plan after the Node update. Record P00's known failures explicitly. Do not mix the earlier 33.45/20.80-second observations with new measurements as if the runtime were unchanged.
- [ ] Measure one full deterministic F/S baseline, Node packaging checks, SDK build/install stage and complete browser matrix under controlled conditions after P00 repair. Preserve per-stage data and avoid running several resource-heavy baselines at once. Capture warnings and stalls that dominate output/time.
- [ ] Identify the slowest environments/import graphs, files, repeated SDK builds and repeated consumer installs. Record why CI and browser workers are currently bounded. Select representative cheap/pure, controller, DOM, packing, FX and browser groups for later candidate measurements.

**Future command interface:**

```powershell
# F; script is created in this package. Arguments after -- are passed as an array.
node scripts/quality/test-inventory.mjs --output .artifacts/modernization/inventory.json
node scripts/quality/measure-command.mjs --label framework-deterministic --output .artifacts/modernization/framework-deterministic.json -- npm.cmd test
# S; preserve node and Vitest cases in its inventory.
node scripts/test-inventory.mjs --output .artifacts/modernization/inventory.json
```

**Exit:** reproducible baseline with complete case identities and phase/resource evidence. No speedup claimed from comparing different test sets or passing versus failing runs.

## M02. Adopt Bun installs and repair tool/process assumptions

**Modify F:** package.json, `.github/workflows/framework-boundaries.yml`, `scripts/synware/installed-consumer.mjs`, `build-sdk.mjs`, `sdk-package-manifest.mjs`, generated consumer/scaffold package setup, `scripts/developer-mcp/build-package.mjs` and all discovered npm/compiler-launch sites.
**Modify S:** package.json, current Site quality workflow, `scripts/use-framework.mjs`, README developer commands and package-boundary checks that read lockfiles.
**Create each repository:** bun.lock, bunfig.toml if configuration is needed, private `scripts/tooling/process.mjs` and targeted Node tests for executable/argument handling. F tests belong in `tests/packaging/tool-process.test.mjs`; S in `tests/node/tool-process.test.mjs`.
**Remove each repository after successful conversion:** package-lock.json. Retain npm only in isolated external-consumer validation.

**Private interface:** `runTool({ tool: "node" | "bun" | "tsc" | "npm", args: readonly string[], cwd: string, env?: Record<string,string>, log?: string }): ToolResult`. Resolve the selected declared binary rather than assuming `process.execPath` can interpret another tool's entrypoint. A failed/missing executable or interrupted process is failure. No shell command text interpolation; Windows `.cmd` handling uses explicit correct quoting/launcher behavior and is covered by space/metacharacter-path fixtures.

- [ ] Pin reviewed Bun, compare clean npm and Bun dependency/peer graphs in separate disposable validation directories, and verify reviewed package files and licenses. Do not replace the live paired node_modules during the experiment.
- [ ] Import the npm lock and review every resolution change before a committed cutover. Use frozen Bun installs and explicit `--ignore-scripts`; verify required platform binaries, fonts/WASM and browsers through explicit reviewed setup steps. Inspect default trusted dependencies and prevent an unreviewed script-policy expansion.
- [ ] Replace npm_execpath/process.execPath assumptions in framework:sync and installed consumers with the private tool launcher. Exercise Node-parent/Bun-parent execution, Windows paths with spaces, tarball paths and nonzero/aborted child processes. Do not alias npm to Bun while preserving npm-only command semantics.
- [ ] Update source fingerprint inputs to bun.lock, relevant Bun/transform config and exact tool versions. Preserve commit/resource/archive verification and dirty-receipt restrictions. Add a regression that a lock/config/tool input change invalidates build reuse, and tampered bytes fail before a consumer runs.
- [ ] Keep framework:sync's content-addressed tarball installation and installed resource verification. Add a fresh Bun-installed consumer and retain a fresh npm-installed consumer outside F. Each must resolve independent React/SDK modules and contain no source aliases or links back into F.
- [ ] Wire scripts so `bun run typecheck`, `bun run sdk:build`, `bun run framework:sync`, and S build/check equivalents are documented. Keep `test` as the focused Vitest script accepting file arguments; M06 adds the aggregate `test:all` plan. Record which child CLIs still run under patched Node; `bun run` is not evidence of a runtime replacement. Do not use `bun test` as a substitute for existing suite commands.
- [ ] Convert CI caches/install commands only after clean Windows/Linux installs, package checks and P00 files pass. Then remove the npm lock authority. Preserve reproducibility and browser download versions. No production deployment.

Example accepted future invocations:

```powershell
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun run sdk:build
# S, after a committed, built F archive exists
bun run framework:sync -- 'C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework'
```

**Exit:** reproducible Bun-managed repositories, genuine installed consumers through both package managers, and no implicit npm-JavaScript/compiler path dependency. Build/packing remains single-writer.

## M03. Stable compiler baseline and optional native evolution

### M03A. Approved TypeScript 6.0.3 baseline

**Owns F/S:** exact package.json/compiler locks, existing tsconfigs and affected compiler fixtures. F also owns the 6E design/plan/decision files and getting-started compiler guidance. Existing SDK/MCP manifest generation propagates the source compiler dependency; no new public API is introduced.

- [ ] Pin TypeScript 6.0.3 exactly in both repositories; retain the existing JavaScript compiler API and CLI. Keep security patches and renderer/build major versions unchanged.
- [ ] Remove baseUrl from app/example/type-fixture configs and use explicit relative path targets. Preserve SDK rootDir src/declaration structure, explicit project roots and selected Vite/Emscripten/Node ambient environments. Keep production strict mode, browser target and all negative contract assertions.
- [ ] Run app/node/SDK/example checking, existing type contracts, real compiler-API audit/MCP/toolchain suites and class/decorator ownership tests. Characterize fixture assumptions against the old compiler before classifying a failure as a 6 regression. No blanket suppression or weakened public boundary is acceptable.
- [ ] Rebuild a committed, provenance-correct SDK/MCP pair, install it into S through framework:sync, and validate independent packed consumers under 6.0.3. Check the retained 5.9 declaration-consumer floor separately; that test compiler is not a production sidecar.
- [ ] Run site checks/builds and preserve the known baseline failure inventory. Record audits, compiler versions, package receipt and results in site validation evidence. Update every active 6E document to the approved 6.0.3 baseline; retain original snapshots as historical evidence.

**Exit:** exact 6.0.3 in framework/site/packed tooling, working compiler API and declaration consumers, preserved source/installed behavior, and current 6E decisions. Completion does not require a beta/native compiler or implementation of the proposed authoring APIs/apps.

### M03B. Deferred native compiler/API port

This optional phase requires a later decision; the following file scopes and gates apply only when it is admitted.

**Modify F:** all tsconfig JSON files and generated configs; package.json; `scripts/synware/manifest-source.mjs`, `validation-core.mjs`, `audit-sdk-imports.mjs`, `audit-capability-usage.mjs`, `public-api-boundaries.mjs`, `check-custom-text-system-consumer.mjs`, `build-sdk.mjs`; `scripts/fx/boundary-audit.mjs`; `scripts/developer-mcp/project.mjs`, `lookup.mjs`, `build-package.mjs`; all discovered compiler API imports/CLI launch sites.
**Create F:** private `scripts/tooling/typescript-analysis.mjs`, `tests/packaging/typescript-analysis.test.mjs`; type fixtures under `tests/fixtures/native-typescript/` for config resolution, semantic boundaries and declaration consumers.
**Modify S:** tsconfig.json and any additional discovered environment configs; typecheck commands. Split worker/tooling/browser configurations only where their real ambient authorities differ.

**Consumes:** stable native compiler API, existing parser/typechecker behavior and fixture inventory. **Produces:** native checker/declarations and equivalent non-executing source analysis with explicit native object lifetimes.

- [ ] Revalidate the stable release and new API documentation. Isolated 7.1 beta probing may inform the port; do not promote it silently. If an API-bearing stable release is not available, report this package as pending and proceed with independent packages. Do not remove analysis/security checks to force a 7.0-only cutover.
- [ ] Characterize current AST-only versus semantic tools with accepted/rejected Info.ts, exports/aliases, private leak paths, capability operations, TSX classes, `satisfies`, reexports and malformed source. Preserve exact security semantics; evaluation of authored source is forbidden.
- [ ] Remove deprecated baseUrl using explicit relative path targets; audit rootDir, include and emitted declaration layout; add explicit ambient type packages by environment; keep browser targets and module resolution policy. Run expected-error generic/binding/action fixtures and actual DOM/editor/worker code, repairing real type errors without broad casts.
- [ ] Port analysis to the supported API and purpose-specific syntax entries. Dispose programs, snapshots and API sessions on success/error/cancellation; snapshot invalidation keys include source/config/lock identity. Test repeated MCP lookups/project changes for stale results and native-resource retention. No native handles survive a disposed operation.
- [ ] Replace `node node_modules/typescript/bin/tsc` with declared native CLI resolution using M02's process launcher. Verify `-b`, `--noEmit`, declaration-only builds, emit output names and clean/incremental behavior on Windows/Linux. Capture compiler timings separately from Vitest transforms.
- [ ] Audit the emitted SDK/MCP dependency manifests so shipped parser helpers get the correct required API and no old compiler API is accidentally imported. Run installed consumer syntax/semantic/declaration checks using the exact packed plugin, not repository-private analysis imports.
- [ ] Test generated declarations under selected TypeScript 7.x and the initially preserved 5.9 consumer floor, with all existing negative public-boundary assertions. Measure clean/warm checks and declaration emit. Any consumer-floor change must identify the necessary feature and revise the contract before adoption.

**Exit:** actual native checking/emission and fully functioning audits, manifests, developer tools and packed Vite plugin; no permanent old compiler alias/shim and no open API-release blocker disguised as completion.

## M04. Upgrade Vite/builds and preserve decorator semantics

**Modify F:** package.json, `scripts/synware/decorators.mjs`, `decorators.d.mts`, `vite-plugin.mjs`, `vite-plugin.d.mts`, `application-toolchain.mjs`, `build-sdk.mjs`, SDK dependency/manifest generation, vitest.config.ts and relevant fixture Vite configs.
**Modify S:** package.json, vite.config.ts, vitest.config.ts; preview and Cloudflare bundling only where the new toolchain requires changes.
**Existing F tests:** `tests/runtime/application-toolchain.test.ts`, application HMR suites and SDK/package tests.
**Create F:** `tests/runtime/standard-decorators-vite8.test.ts`, `tests/fixtures/native-decorators/` with decorated `.ts` and `.tsx` consumers, private/inherited/accessor/HMR cases and a production-browser probe.

- [ ] Add a fixture proving the current esbuild.supported/reactBabel path fails or is ignored on the candidate Vite/React plugin. Keep that failure distinct from an app lifecycle defect.
- [ ] Install reviewed compatible Vite 8/React plugin/standard-decorator transform packages in the implementation pair. Put the transform in the SDK Vite integration with explicit dependency ownership and code/file filters, before Oxc/Fast Refresh. Preserve standard 2023-11 decorator semantics and initializer ordering.
- [ ] Replace deprecated esbuild/Rollup config paths deliberately, including JS target, CSS handling, worker/assets, dynamic imports and optimizer exclusions. Preserve the baseline browser floor with an explicit target instead of inheriting Vite 8's newer default. Do not move Babel overhead onto every undecorated dependency.
- [ ] Execute black-box fixtures in source Vitest, S dev, S production, SDK build and independent installed consumer. Assert observable accessors, inherited actions, metadata identity, private-brand behavior, HMR state preservation versus required app relaunch and new P01-P08 contracts as they arrive.
- [ ] Compare bundle/module/resource inventories: one shared framework graph, consumer React externalization, theme/CSS ownership, export paths, worker/WASM/media/font resources, nested URL base, sourcemaps and third-party notices. Preserve tree-shaking boundaries without changing public feature availability.
- [ ] Build and install one verified archive serially into S, then run normal/Cloudflare builds and smoke all admitted apps. Keep package receipt/source provenance; no sibling source alias as a shortcut.

**Exit:** decorators/TSX/HMR and all installed paths work under Vite 8 with equivalent behavior. App authors keep the framework's supported Vite plugin configuration.

## M05. Upgrade React, Vitest, jsdom, Playwright and Cloudflare together where required

**Modify F/S:** package manifests/locks, Vitest configurations/setups and actual affected tests; F playwright.config.ts, S browser harnesses, both CI browser setup steps; Cloudflare plugin/Wrangler configurations in S.
**Create F:** `tests/runtime/renderer-upgrade-contracts.test.tsx` for external-store snapshot stability, refs/effects/StrictMode, focused responder, portals and controlled-editor essentials not already covered by existing focused suites.
**Preserve existing S tests:** Journal/Publisher class and editor suites, AnimationFX close/selection behavior and command/browser tests.

This package also owns the additional dependency groups in the modernization design and [complete 38-package survey](direct-dependencies-2026-10-24.json). Apply each major/product-area change as a reviewable substep with its own regression evidence rather than coupling every upgrade to the React commit. Existing reusable text/document/FX owners remain authoritative.

- [ ] Update React/React DOM and their type declarations as a pair, verifying the consumer peer contract. Run control/selection/IME/contenteditable/portal/focus/lifecycle tests and existing app baselines. Do not adopt React view transitions as an AFX replacement or enable React Compiler in this package.
- [ ] Upgrade Vitest to the selected reviewed 5.x release. Audit clearMocks changes, inline project config inheritance/setup duplication, hoisted mock placement, class mock prototypes, browser mocks and benchmark API changes. Preserve assertion intent and explicit reset ownership. Compare discovered case identities before/after.
- [ ] Update jsdom after class-host baseline repair and record changed DOM/event behavior. Convert tests requiring a real browser to an equivalent browser assertion only with a preserved case/feature ledger; do not silently eliminate them or switch all tests to a lighter emulator.
- [ ] Upgrade Playwright/browser downloads together. Keep Chromium/Firefox/WebKit, mobile, high-DPR and reduced-motion projects; verify real canvas, frame, media, text/IME and worker behavior. Record actual capability skips and retain human visual acceptance.
- [ ] Upgrade Cloudflare packages with compatible peers and an audited actual workerd/Miniflare/Undici graph. Validate `build:cloudflare`, worker type bindings, auth/route behavior, local production-mode preview and nested resources. Do not deploy.
- [ ] Review and apply the surveyed Floating UI, ProseMirror package, snapshot/export, motion, font/shaping/PDF, MCP/schema, testing-library and CSS candidates in separate product groups. Inspect actual imports/resources first, preserve each group's named behavior gate from the design, and regenerate notices/package manifests where bundled bytes change. Carry major snapshot/motion changes through interrupted animation, nested portals, image/font/export and reduced-motion browser cases. Keep the private Publisher semantic engine private.
- [ ] For packages already current, record no change. Review the intentional woff2-encoder 3 prerelease against the stable 2 tag without an automatic downgrade or substitute API. Do not raise Node type declarations to a different runtime major merely because its types have a higher latest tag.
- [ ] Run both deterministic suites and installed-consumer smoke gates on Windows/CI Linux; compare inventory, failures, warnings and documented snapshots. Update notices and runtime floors, rerun dependency audit and retain unresolved findings visibly.

**Exit:** modern coordinated stack with equal feature/test coverage and no silent mock/environment or deployed-runtime regression.

## M06. Reduce complete validation cost with explicit projects and artifact ownership

**Modify F:** vitest.config.ts, tests/setup/runtimeEnvironment.ts, existing heavy tests/imports where demonstrated, CI workflow, scripts/synware/installed-consumer.mjs, scripts/test-e2e-matrix.mjs and packing/test fixture orchestration.
**Modify S:** vitest.config.ts, scripts/test-inventory.mjs, runtime setup/fixtures only where classification needs it, current CI test jobs and scripts.
**Create F:** `scripts/quality/test-plan.mjs`, `run-test-plan.mjs`, `artifact-cache.mjs`, `tests/packaging/test-plan.test.mjs`, `tests/packaging/artifact-cache.test.mjs`.
**Create S:** `scripts/test-plan.mjs`, `scripts/run-test-plan.mjs`, `tests/node/test-plan.test.mjs`.

**Test-plan contract:** named full/local plans contain explicit project/resource groups. Every full baseline case is assigned exactly once to an authoritative execution dimension, while platform/device duplicates retain distinct identity. Local selected plans report `complete: false`. CI full completion requires successful discovery/execution and exact union accounting, with unchanged or reviewed skip reasons.

**Artifact-cache key:** source fingerprint, clean/dirty status, commit, lock digest, compiler/transform/bundler versions, build options, relevant environment input hashes and platform/architecture for native artifacts. Validate stored manifest/resources before reuse. Failed/missing/corrupt entries are never successful cache hits. A test deliberately mutating an artifact receives its own copy. One writer per SDK output; immutable downloads/archives can be shared.

- [ ] Add plan regressions for missing/duplicate cases, empty discovery, failed child, interruption, incomplete browser project, altered skip reasons and local/full mislabeling. Add cache regressions for changed locks/compiler/input, corrupt archives, incomplete writes, concurrent writers and dirty receipt rejection.
- [ ] Partition pure Node, fake runtime, DOM, mutable package/install and performance groups based on M01 evidence. Keep required setup and reset hooks scoped correctly. Inline project sharing may reuse transforms only if SynWare virtual/plugin state is safe; do not inherit root setup twice under Vitest 5.
- [ ] Measure deterministic worker candidates 2/4/8 with a controlled baseline; keep packaging single-writer and respect aggregate RAM/CPU budgets. Consider stateless nonisolated pools only after shuffled repeated leak/mocking checks. Native compiler worker concurrency and test workers must share a machine budget rather than oversubscribe independently.
- [ ] Narrow expensive private unit-test imports and eliminate eager global service creation where profiling proves cost, preserving public-entry/installed tests. Replace suitable real waits with controlled clocks/readiness and fix actual act/lifetime leaks. Keep media/frame/performance tests on real timing.
- [ ] Reuse one verified build per matching input across package consumers; preserve separate installed sandboxes, real tarball install and tamper/provenance cases. Remove redundant CI SDK rebuilds only after proving all readers use immutable bytes and mutation tests cannot corrupt another reader's authority.
- [ ] Separate local affected commands from the complete plan. Track CSS, manifest, generated data, assets and worker dependencies that import-only changed selection misses. Keep unconditional full authoritative gates before P14/M08 completion.
- [ ] Improve browser cost through built fixtures for production behavior and isolated servers per shard. Preserve dev/HMR fixture coverage separately. Keep current single-worker protection until its shared-transform-server exhaustion is fixed; retain serialized GPU/timing scenarios where required. Check matrix union against discovery rather than filtering projects to finish faster.
- [ ] Measure representative candidates with identical cases and cold/warm definitions. Select from elapsed time, memory, stability and total setup/build cost; reject unexplained retries/skips or reduced assertions. Target at least half the baseline median deterministic elapsed time and report the achieved factor.

Future user-facing commands, defined by this package rather than assumed to exist today:

```powershell
bun run test:changed
bun run test:authoring
bun run test:all
bun run test:browser:all
bun run verify:all
```

`test:all` means all deterministic source/Node/packing/installed cases in that repository. `test:browser:all` means its entire browser matrix. `verify:all` additionally runs checking/contracts, boundaries, security, builds and both complete test plans. Scripts report constituent commands and runtime identities; a fast local plan never impersonates verify:all.

**Exit:** complete equivalent validation with measured improvement, reliable cancellation and no cache/provenance/isolation loophole. If the 50% goal is missed, retain the optimization package as incomplete and identify the remaining dominant cost rather than silently lowering the target.

## M07. Validate Bun runtime choices and optimize actual app/FX costs

**Owns:** private process/tooling runner from M02; measured source modules in F only where profiling proves cost; app-owned adoption in S through P10-P13; AFX/lifetime work through P07/P08. Do not create public benchmarking helpers or silently change rendering quality.
**Create reports:** `.artifacts/modernization/tool-runtime-matrix.json`, `browser-performance.json`, per-scenario traces and resource inventories. Reports name the exact installed archive and server/worktree.

- [ ] Run the same CLI/tooling probes under patched Node and selected Bun on Windows/Linux: child process exits/termination, filesystem realpaths, tarball packing, hashes, crypto/TLS behavior, worker/WASM/native modules, MCP stdio and Vite startup/HMR. Adopt Bun as default per proven command; retain explicit Node where the supported tool requires it.
- [ ] Keep Vitest's Node/V8 coverage lane if Bun execution lacks equivalent coverage/worker semantics. A separate Bun-runner or bun check experiment needs measured equivalent behavior, not a blanket import rename. Do not make an experimental runner necessary for application migrations.
- [ ] Compare browser app open/close, input, external-store rerenders, idle CPU and repeated window/document sessions. Test task cancellation, observer/outlet lifetime and stale callback rejection through the proposed authoring APIs. Look for actual retained renderer/listener/resource growth.
- [ ] Profile authored AFX/GFX/video/text/audio scenarios at baseline quality, DPR and supported capability levels; preserve transfer/timing/worker behavior and full twelve-product tests. Reject duplicated animation drivers and redundant renderers without removing intended authored effects.
- [ ] Evaluate lazy loading, narrow observation and duplicate-work removal only against meaningful scenarios and byte/frame/memory measurements. Reject reproducible >5% important latency/peak-memory regressions without a recorded accepted tradeoff; keep human visual acceptance separate.

**Exit:** faster proven tooling/runtime paths and equivalent app/FX behavior, with no unsubstantiated FPS/security/zero-copy claim. Bun remains tooling infrastructure; browsers and workerd remain their existing execution authorities.

## M08. Final evidence and handoff

**Modify documentation:** existing framework and site developer guides, generated scaffolds, this planning status, accepted version/support policy and CI command reference. No external publication.
**Consumes:** admitted M00-M07 including M03A, P00-P14 and all eleven application ledgers. M03B is included only if separately admitted. **Produces:** final exact-version/provenance/test/security/performance evidence and a truthful completion report.

- [ ] Recheck selected stable TypeScript 6.0.3 and every admitted candidate version/advisory. Recheck a native API release only if M03B was admitted. Verify frozen Bun installs in clean Windows/Linux environments and npm/Bun external SDK consumers. Record Node/Bun/TypeScript/Vite/React/Vitest/jsdom/browser/workerd versions and package receipts.
- [ ] Run complete `verify:all` once after final changes, with per-stage receipts, full discovery/union accounting and recorded skip reasons. Include installed types/runtime/resources, public/capability boundaries and all twelve FX products. Do not rerun expensive full gates without a changed input or unresolved concern.
- [ ] Compare final and baseline performance with identical case/scenario sets and total build/install cost. Report median/worst observations, factors and remaining bottlenecks. Mark missed goals or stable-API/security blockers as open work.
- [ ] Complete Journal/Publisher feature acceptance and the historically exempt app wave from the original matrix, preserving document/history, detachment, templates, editor/preview, commands and overlays. Obtain the original visual/FX human acceptance independently of automated pass counts.
- [ ] Search production package output for unwanted private/test/benchmark modules, unsupported runtime globals, duplicate React contexts and dependency/license omissions. Verify source/lock/config fingerprints and clean receipt rules still reject stale/tampered packages.
- [ ] Record all changed files, actual commands/results, approved version/support decisions, measured improvements and remaining risks. Source/API/dependency implementation is only complete when these gates pass. Stop before push/release/deployment unless separately authorized.

## Planning self-review

Coverage: M00 addresses actual audit/runtime/CA findings; M01/M06 address full-suite time without reduced coverage; M02/M07 distinguish Bun package manager/runtime/test runner; M03 covers direct compiler API and declaration consumers; M04 covers standard decorators and packed plugin transforms; M05 covers coordinated renderer/test/browser/Cloudflare changes; M08 joins the eleven-app and twelve-FX acceptance gates. All proposed new file paths are explicitly marked Create, all future commands are labeled, and no future success is presented as executed.
