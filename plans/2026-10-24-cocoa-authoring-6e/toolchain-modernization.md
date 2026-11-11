# 6E tooling, security and performance modernization

Status: modernization design, researched 24 October 2026. This extends the [authoring design](design.md) and [application migration matrix](app-migration-matrix.md). Security remediation and the exact TypeScript 6.0.3 upgrade have since been authorized; the broader upgrades, APIs and app migrations remain proposed. Implement admitted phases through the [modernization plan](modernization-implementation-plan.md). Native TypeScript 7/API porting is a deferred optional phase.

## 1. Decisions

1. Make Bun the repository package manager and command entry point, with one committed `bun.lock` per repository. Preserve ordinary npm-installed SDK consumers as a supported distribution contract.
2. Use exact TypeScript 6.0.3 as the approved compiler baseline, retaining its JavaScript compiler API. Defer native TypeScript 7 to a separately admitted stable API-bearing release and validated tooling port. Do not replace `typescript` with 7.0 and break the shipped Vite plugin, audits or developer MCP.
3. Upgrade the coordinated build/test stack: Vite 8, matching React plugin, Vitest 5, React/React DOM 19.3 and compatible Cloudflare tooling. Patch immediate security findings before waiting for the broader architectural migration.
4. Optimize test execution from measured startup, import, environment, packaging and browser costs. Retain Vitest initially; a Bun package-manager migration does not require a `bun:test` rewrite.
5. Preserve browser/worker portability, standard decorators, React module identity, SDK provenance, every application feature and all twelve FX products. Toolchain upgrades do not justify a browser-support or visual-quality downgrade.

This adds a tooling programme ahead of and alongside P00-P14. Existing authoring API decisions remain intact. No app needs to use `Bun.file`, `Bun.serve`, a Bun database or a Bun-only global to benefit from these changes.

## 2. Inspected baseline and candidate targets

The original survey was followed by security remediation and the approved compiler upgrade. The current baseline and remaining candidates are below; the original machine-readable survey is historical evidence. The host initially used Node 24.15.0 and now uses patched 24.22.1; Bun remains 1.4.0. The paired checkouts are F/S as defined in [README](README.md).

| Component | Current installed/locked baseline | Candidate exact version on research date | Decision |
| --- | --- | --- | --- |
| Node, maintenance/consumer runtime | host and CI 24.22.1 | 24.22.1 LTS security release | Patched runtime and supported security floors applied |
| Bun | host 1.4.0; no repository Bun lock | 1.4.4 | Pin package manager after compatibility/install gates; do not upgrade host Bun during planning |
| TypeScript | exact 6.0.3 | approved 6.0.3; native 7 deferred | Current compiler/API and 6E baseline; no beta or sidecar selected |
| Vite | patched 7.3.7 | 8.3.5 | Major build/plugin/decorator migration remains proposed |
| React and React DOM | 19.2.5 | both 19.3.1 | Keep exact renderer pair and one consumer React instance |
| React Vite plugin | 5.2.0 | 6.1.2 | Match Vite 8 and replace the existing Babel hook contract |
| Vitest | patched 4.1.12 | 5.0.5 | Major upgrade remains proposed; retain suite semantics and review defaults |
| jsdom | 29.1.1 | 30.1.3 | DOM behavior review; do not replace with a lighter emulator merely for speed |
| Playwright | 1.61.0 | 1.64.1 | Upgrade matching browser downloads and preserve seven framework matrix projects |
| Cloudflare Vite plugin, S | 1.62.5 | 1.65.0 | Coordinate with Wrangler and actual workerd dependencies |
| Wrangler, S | 4.147.0 | 4.152.0 | Candidate does not itself prove all transitive audit findings fixed |

Candidate versions were read directly from the npm registry's `latest` metadata, including peer and engine requirements: [TypeScript](https://registry.npmjs.org/typescript/latest), [Bun](https://registry.npmjs.org/bun/latest), [Vite](https://registry.npmjs.org/vite/latest), [Vitest](https://registry.npmjs.org/vitest/latest), [React](https://registry.npmjs.org/react/latest), [React DOM](https://registry.npmjs.org/react-dom/latest), [React plugin](https://registry.npmjs.org/@vitejs%2fplugin-react/latest), [jsdom](https://registry.npmjs.org/jsdom/latest), [Playwright](https://registry.npmjs.org/playwright/latest), [Cloudflare plugin](https://registry.npmjs.org/@cloudflare%2fvite-plugin/latest), [Wrangler](https://registry.npmjs.org/wrangler/latest). Revalidate metadata and advisories when implementation starts; freeze reviewed exact versions rather than following moving tags in CI.

Do not mechanically install the latest `@types/node` (currently 26.x) while claiming Node 24 compatibility. Use the supported Node 24 type line for tooling; keep browser, test, Cloudflare and optional Bun globals in separate TypeScript configurations. jsdom's current engine metadata requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; the security baseline is stricter than merely satisfying that engine range.

### Remaining direct dependency survey

The [complete read-only registry survey](direct-dependencies-2026-10-24.json) covers all 38 distinct non-file direct dependencies across F/S, with locked versions, declared ranges, latest candidates, engines and peers. It was fetched successfully through patched Node 24.22.1. It is not an instruction to update every package without reading its changes.

| Product area | Additional candidate changes | Required preservation gate |
| --- | --- | --- |
| Control geometry | `@floating-ui/dom` 1.7.6 to 1.8.0 | popup/portal/scroll anchoring, focus and compact geometry |
| Private document engine | `@tiptap/pm` 3.24.0 to 3.32.0 | Journal/Publisher transactions, selection/IME, undo, persisted formats and serialization; no new public editor contract |
| Snapshot/export | `@zumer/snapdom` 2.12.9 to 3.3.7 | image/font/CSS capture, export, cancellation and origin constraints |
| Motion integration | `framer-motion` 12.38.0 to 14.6.0 | existing AFX integration, animation interruption, portals, reduced motion and full visual quality; this is a major-version migration |
| Text/font/PDF | `harfbuzzjs` 1.6.1 to 1.6.4; `unicode-script` 1.2.0 to 1.3.0; `pdfjs-dist` 6.3.289 to 6.4.299 | shaping/bidi/fallback, pagination/selection, fonts, PDF workers/resources and installed FX fixtures |
| Developer tools | MCP SDK 1.32.1 to 1.32.2; Zod 3.25.76 to 4.6.7 | schemas/bounds, accepted/rejected messages, MCP stdio and generated package integrity |
| Tests and CSS | testing-library/react 16.3.2 to 16.3.3; PostCSS 8.5.28 to 8.5.31; matching React 19.3 types | event/act semantics, controlled editors, CSS processing and packaged theme output |

Other direct packages already match their registry latest tag on this date. `woff2-encoder` is an important exception to a naive latest policy: we intentionally have 3.0.0-beta.1 while its stable latest tag is 2.0.0. Review why the current encoder API/version is required and keep it if its functionality has no equivalent stable release; do not downgrade a working font pipeline just to match a tag. The same rule applies to any consciously selected prerelease. Dependency maturity and functionality are part of the review, alongside patch status.

## 3. Approved TypeScript 6 baseline and deferred native compiler work

TypeScript 6.0.3 is now selected and pinned in both repositories and propagated into generated SDK/MCP manifests. The compiler API remains the supported JavaScript API. Source/example path mappings use explicit relative targets without baseUrl; the app project has an explicit root and Vite/Emscripten ambient types, Node config explicitly selects Node types, and SDK declaration emission retains rootDir src. Production strict mode stays enabled. No ignoreDeprecations escape, wildcard ambient types, beta compiler or production dual-compiler alias is selected. The native research below describes a future optional phase and does not block the current authoring/app programme.

### App source and authoring syntax

TypeScript 7 is a native compiler/tooling port, not a new app language or a new browser runtime. Classes, TSX, generics, accessor decorators, normal React components and the proposed bindings/tasks remain the model. It does not require rewriting SynWare into another language or introducing Bun APIs. Microsoft's [7.0 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) reports substantial compiler speed gains; none of those numbers is a SynCloudOS benchmark.

Some code/configuration changes are real. The [6.0 migration guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) documents changes inherited by 7: removed `baseUrl`, explicit type packages, changed inferred roots and updated inference/library types. F's `tsconfig.app.json` currently has `baseUrl: "."` and mostly unprefixed paths. All source, SDK, fixture, generated-consumer and test configurations must be audited. Retain ES2022/DOM and Bundler semantics where currently required; do not silently raise emitted browser targets.

An illustrative corrected fragment, preserving explicit mappings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "paths": {
      "@syndromatic/syncloudos": ["./src/SynCloudOS/AppSDK/rootPackageEntry.ts"],
      "@syndromatic/syncloudos/nse": ["./src/NSE/sdkPackageEntry.ts"]
    }
  }
}
```

This is a two-entry explanation, not a replacement for F's complete map. Explicitly retain every actual SDK entry. Imported React declarations are resolved through imports; add ambient package names only to the configurations that need their globals. Add `node` to Node tooling/tests, Cloudflare's generated environment types to worker code, and `bun` only if a deliberate Bun-specific tooling file uses it. [Bun's TS 6/7 guidance](https://bun.com/docs/typescript-6) confirms the explicit-types requirement.

### The compiler API is the important obstacle

TypeScript 7.0 does not expose the existing JavaScript compiler API. This repository calls it extensively. Current consumers include:

- `scripts/synware/manifest-source.mjs`: parses Info.ts and validates app module declarations; this file is copied into the distributed SDK.
- `scripts/synware/validation-core.mjs`, `audit-sdk-imports.mjs`, `audit-capability-usage.mjs`, `public-api-boundaries.mjs`: syntax analysis and semantic capability/public-boundary checks.
- `scripts/fx/boundary-audit.mjs`: FX import/boundary analysis.
- `scripts/developer-mcp/project.mjs`, `lookup.mjs`, `build-package.mjs`: discovery, type inspection and catalogue transpilation.
- `scripts/synware/check-custom-text-system-consumer.mjs`: consumer inspection.

This list is an inspected starting inventory, not permission to ignore further `typescript` imports discovered during execution. `build-sdk.mjs` currently propagates TypeScript as a package dependency, copies parser helpers, and emits declarations. Many consumer checks execute `node node_modules/typescript/bin/tsc`; a native CLI is not a JavaScript script that should be passed to Node in that way.

The [7.1 beta announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/) exposes new purpose-specific API entries, including `typescript/sync`, `typescript/async`, `typescript/ast` and `typescript/fs`. Its API/program/snapshot objects require explicit disposal. The migration must rewrite calls and preserve native resource lifetimes; changing an import string is insufficient. Existing semantic symbol traversal, manifest rejection rules and capability analysis are security/functionality contracts.

Deferred native end state: one native compiler version and a private tooling analysis module using the supported 7.x API, with per-operation/session disposal and snapshot invalidation. The selected 6.0.3 stage retains the existing API and JavaScript CLI. Syntax parsing remains non-executing; never evaluate Info.ts just to replace the parser. A future port must store serializable MCP records, dispose native handles and use correct declared executable/process semantics.

Stable 7.0.2 cannot alone deliver the deferred native end state. Microsoft documents an official TypeScript 6 side-by-side package, but it is not selected here. A future native cutover requires an API-bearing stable release, preserved feature results and separate approval. That optional gate does not hold up the TypeScript 6.0.3 authoring, app or test-optimization work. A beta production dependency requires an explicit revision of the stable-release decision.

Keep the public declaration syntax floor separate from the repository compiler version. Retain TypeScript 5.9 as the initial supported declaration-consumer floor if its existing contract tests pass; new public types must not gratuitously require 7.1 syntax. Test installed consumers at that floor and at the selected 7.x version. If retaining that floor proves impossible, document the exact type feature and seek a consumer-contract decision before raising it. That consumer test version is not a second framework compiler/API implementation.

## 4. Bun adoption with clear ownership

### Package management

Commit `bun.lock` in each checkout, pin `packageManager` to the accepted exact Bun version, and use frozen installs in CI. [Bun supports importing npm lockfiles](https://bun.com/docs/pm/lockfile), but compare the imported graph before removing package-lock.json: peer resolution, overrides, platform optional binaries, tarball integrity and installed React identity must agree or have an explicitly reviewed update.

Use isolated installs as the first reproducibility candidate, then check all scripts for undeclared dependencies exposed by previous hoisting. Do not silently fall back to arbitrary hoisting to make broken manifests pass. After the conversion, one authoritative lockfile per repository; the history preserves the old npm lock. npm remains a tested external SDK-consumer installer, not a second in-repository lock authority.

Preserve the current script-execution policy. [Bun has its own dependency trust/lifecycle model](https://bun.com/docs/pm/lifecycle); its defaults are not an exact replacement for `npm ci --ignore-scripts`. Prefer `bun install --frozen-lockfile --ignore-scripts` and explicit reviewed setup commands for required binaries. Test sharp, workerd, Rolldown/Oxc, font/WASM helpers and Playwright on Windows and CI Linux. Do not trust every package or enable all postinstall scripts to resolve an install error.

### Script execution and subprocesses

`bun run test:all` can select a package script without making all its subprocesses Bun. `node ...` remains Node; a script runner and the runtime executing a CLI are distinct choices. Make the selected runtime visible in test reports. [Bun's compatibility table](https://bun.com/docs/runtime/nodejs-compat) records API differences, including child processes, crypto and Windows paths; measure our actual usage.

Current `S/scripts/use-framework.mjs` assumes `process.execPath` runs npm's JavaScript entrypoint, gets that entrypoint from `npm_execpath`, builds F, installs a tarball and checks the receipt. Running it under Bun unchanged can attempt to interpret the wrong executable as JavaScript. The installed-consumer helper has similar assumptions. Replace these with explicit tool resolution and argument arrays, correct `.cmd` launching on Windows, and package-manager-specific install commands. Do not interpolate filenames into shell strings. No fake npm path, source link or shared node_modules may substitute for a real installed archive.

The source fingerprint in `sdk-package-manifest.mjs` currently names package-lock.json. Update provenance inputs to include bun.lock, Bun configuration, transform/compiler versions, platform-sensitive build inputs and generator changes. Continue verifying resources, archive hash, source bytes and commit identity before a receipt can authorize use. Cache reuse must never transform a dirty receipt into a clean one.

### Runtime and test runner

Bun becomes the preferred repository tooling runtime only for commands that pass a Windows/Linux parity matrix. Keep patched Node installed for supported consumers and tools that require it. Cloudflare workerd remains the deployed worker runtime; SynCloudOS and its SynWare apps still execute in browsers. Do not install Bun into browser bundles, set Bun globals on window, or substitute Bun.Worker for browser workers.

Retain Vitest 5 for the large suite initially. `bun test` is a different runner; `vi.mock`, hoisting, fake clocks, jsdom setup, class mocking, coverage and Vite plugin transforms need equivalent semantics before any runner migration. Merely changing the import to `bun:test` is not a performance project. A later bounded experiment may port independent pure utility tests if measured end-to-end savings exceed migration cost and case identity/coverage remain intact. It is not a prerequisite for Bun adoption.

Use the selected TypeScript 6.0.3 `tsc` as the authoritative checker and declaration emitter. A later native compiler needs its own cutover evidence. Current Bun also provides `bun check`; its existence does not establish semantic/declaration parity. Do not run two whole checkers in the normal inner loop without a demonstrated reason.

## 5. Vite 8, decorators and React

[Vite's migration guide](https://vite.dev/guide/migration) documents the switch to Rolldown/Oxc. Our `decorators.mjs` forces esbuild's `supported.decorators = false` and injects Babel parser plugins through `api.reactBabel`. Oxc does not support that esbuild option, and the guide currently says native decorator lowering needs an explicit transform. Preserve TC39 semantics and `@observable accessor`; enabling legacy experimental decorators would change the API contract.

Recommended permanent framework integration: a narrowly filtered standard-decorator transform, supplied by `@syndromatic/syncloudos/vite`, using a reviewed supported Babel 2023-11 transform (or an equivalent verified transform) before Oxc/Fast Refresh. The app author keeps the same `synCloudOS(...), react()` setup and writes no decorator build boilerplate. Filter code and file kinds so undecorated modules do not all pay a Babel pass; parser configuration must accept TSX and auto-accessors. Declare any transform dependencies in the packed plugin's manifest rather than relying on repository dev dependencies leaking into a consumer.

Run semantic fixtures through F tests, SDK bundling, S dev/production, Fast Refresh and a clean installed consumer. Check decorator initializer order, inherited actions, metadata identity, private fields, accessor behavior and remount/disposal. Do not compare generated text as the correctness criterion. The packaging graph must continue to preserve shared NSE/React context identity, CSS ownership, all asset/worker/WASM paths and legal notices. New toolchain hashes are expected; changed public behavior is not.

React/React DOM update together. Review 19.3 behavior against controlled fields, IME, selection, contenteditable, portals, StrictMode, responder focus and external-store snapshots. [React 19.3](https://react.dev/blog/2026/09/09/react-19-3) adds view-transition/fragment capabilities, but do not automatically replace AFX with React view transitions or enable React Compiler for class-heavy code. Automatic memoization is a separate measured experiment; stable subscription snapshots and bounded invalidation are the first optimization.

Vitest 5's [migration guide](https://vitest.dev/guide/migration/) includes changed mock defaults, inline-project config inheritance/shared transform servers, hoisted-mock enforcement and benchmark changes. Explicit configuration and file/case discovery checks must prevent silent coverage changes. Upgrade Playwright with matching browser assets and preserve capability gates and human visual acceptance.

## 6. Test performance: evidence and programme

### Evidence already available

These focused results were captured earlier in this planning session on the same source/installed archive, before the authorized Node maintenance. They are not full-suite benchmarks and will need a post-update baseline. The machine reports 24 physical/32 logical CPU cores and 48 GiB RAM; do not choose worker counts from logical CPUs alone.

| Run | Wall time | Test-body time reported | Other reported phases |
| --- | --- | --- | --- |
| F: four ownership/lifecycle/action files, 94 passing tests | 33.45 s | 1.80 s | transform 14.35 s; import 32.30 s; environment 30.78 s; setup 148 ms |
| S: Journal and Publisher class files, 4 pass / 7 fail | 20.80 s | 4.41 s | transform 1.27 s; import 6.64 s; environment 29.01 s; setup 59 ms |

Worker phases overlap and cannot be added to derive wall time or percentages of wall time. The strong initial hypothesis is that environment/import/startup costs dominate these focused runs. The full suite still needs profiling. Native tsc accelerates type-checking/declaration work; Vitest's normal transforms do not run the full tsc checker for each test.

Current static inventory: 748 `.test.ts/.test.tsx` files under F/tests, 241 containing an explicit jsdom environment annotation; 38 matching files under S/tests. These are filesystem counts, not an authoritative discovered-case manifest. F's config already defaults to Node, limits workers to two and installs a fake runtime window for Node tests. S defaults all Vitest files to jsdom with a minimal React-act setup. F's CI explicitly uses one worker in several deterministic stages and builds the SDK more than once. The seven-project browser harness also intentionally limits workers because its shared fixture transform server can exhaust resources. These safeguards must be explained and replaced with evidence before increasing concurrency.

### Required changes

1. **Measure complete work.** Capture discovery, total wall time, CPU, peak process-tree memory, transforms, import evaluation, environment creation, test bodies, retries, SDK builds, installs and browser launch. Record cold/warm distinctions, tool versions, files/cases/skips and hardware. Profile expensive outliers rather than timing only `vitest run` after an unreported SDK build.
2. **Partition by actual environment and authority.** Use projects for pure Node logic, fake browser-runtime controllers, real DOM tests, mutable packing/install tests and performance-sensitive work. A Node default already exists in F; the optimization is narrower classification and setup, not claiming it is new. Move a DOM test only when assertions do not require DOM semantics. Keep real browser tests for layout, canvas/GPU, media, IME and focus.
3. **Reduce repeated module work.** Inspect public barrel import cost and global setup imports. Use narrow private imports for truly private unit tests, retaining dedicated tests of every public entry and the installed SDK. Avoid eagerly constructing Runtime/PolicyKit/FX services at module import. In Vitest 5, use shared Vite transform servers for compatible inline projects; verify virtual modules/plugin state are project-safe first.
4. **Tune worker budgets.** Measure 2, 4 and 8 workers for the deterministic group, with a 1-worker control for stateful/packing work. Choose from elapsed time and peak memory, not CPU utilization alone. Keep packaging single-writer; cap the sum of all concurrently scheduled projects. Retain file isolation by default. Consider isolation-free execution only for a proven stateless subset with explicit reset, shuffled repeat checks and no cross-file mocks/singletons/resources.
5. **Remove real waits where behavior permits.** For debounce, cancellation and scheduled state, use controlled clocks and explicit ready/settled signals. Keep real timing for media/frame/performance evidence. Fix legitimate `act` boundaries and runaway updates instead of suppressing their warnings or simply extending timeouts. Never replace a real command interaction with a direct private-method call to make it faster.
6. **Build and install once per valid artifact.** Share immutable verified SDK bytes and a dependency download cache. Keep each mutable consumer/project sandbox separate, with a real tarball installation outside F. Do not blindly reuse a previously installed consumer directory, symlink dependencies or bypass tamper/provenance tests. A successful bundle may be reused only for matching source, compiler/transform/lock inputs and platform; corruption or missing metadata triggers rebuild/failure.
7. **Shard browser work by ownership.** Retain all seven projects: Chromium, Firefox, WebKit, mobile WebKit, mobile Chromium, high DPR and reduced motion. First replace repeated source-transform startup with a reusable built fixture where it preserves the tested behavior; HMR/dev-transform tests keep a dev server. Shards need separate server/port/output/profile directories and matrix accounting. Do not raise the existing shared-server worker cap until its resource failure mode is removed. GPU/media timing work remains separately serialized when hardware contention invalidates results.
8. **Fast inner loop plus full authority.** Add changed/related test commands for local work, including explicit resource/manifest/CSS dependency edges. Preserve an unconditional full deterministic gate, packaging/installed checks and full browser matrix before completion. Full-run discovery must equal the union of shards, with no missing/duplicate project-case identities and an explicit existing-skip ledger. Selected tests are never reported as a full suite.

### Performance acceptance

After M01 produces comparable baselines, target at least a 50% reduction in median full deterministic elapsed time, and pursue 3-5x where profiling supports it. Target representative focused authoring groups below 10 s warm and 20 s cold on this workstation. These are engineering goals, not promises or measured achievements. If the accepted approach misses them, report the limiting phases and revise the work; do not quietly declare the optimization complete.

Use three controlled measurements for substantial configuration candidates, compare medians and worst observations, and keep the command/file/case set identical. Avoid repeated full runs once a candidate clearly fails, and run only the final necessary full gate after selection. Preserve test assertions, no new unexplained skips/retries, stable deterministic results and equal or stronger behavior coverage. Coverage collection is a separate measured gate, not mandatory overhead on every local focused invocation.

## 7. Runtime/FX optimization without quality loss

Measure browser first interaction, app open/close, input latency, JS bytes, CPU at idle, mount/unmount leaks, frame time and memory after repeated document/FX sessions. Keep desktop/compact, high DPR, reduced motion, worker paths and nested deployment bases in the sample. Source LOC reduction is not itself a runtime speed improvement.

The proposed ownership/task/binding/outlet layer should reduce duplicate subscriptions, stale requests, repeated renderer setup and unnecessary refreshes. Require stable descriptor identities, narrow observation invalidation, one managed frame activity policy per resource owner, and visible/hidden/closed behavior from existing capabilities. Do not animate a second copy of the same property through React, CSS and AFX at once. Do not assume every hidden scene may be paused when audio, exporting or authored timelines require continued work.

Retain existing WebGL/canvas/video quality, text shaping, resolution/DPR, browser feature fallbacks and full FX behavior. Asset compression, lazy loading or worker transfers require measured output equivalence and lifecycle tests. Establish per-scenario regression budgets from baseline; initially reject a reproducible >5% regression in important latency/peak memory without an explained tradeoff, and require human acceptance for visual differences. No guaranteed FPS or zero-copy claim comes from a tooling upgrade.

## 8. Security and trust-store maintenance

### Original read-only audit

This subsection preserves the pre-remediation findings. M00 subsequently patched both dependency graphs to zero npm audit findings; its execution evidence is recorded with the site validation reports. TypeScript 6.0.3 is the next explicitly approved compiler stage, not an excuse to ignore the historical findings.

`npm audit --json --ignore-scripts` was run in both checkouts on 24 October. Both exited 1 with findings; no `audit fix`, install or dependency mutation was performed.

| Checkout | High | Moderate | Total affected package records | Names |
| --- | --- | --- | --- | --- |
| F | 4 | 3 | 7 | body-parser, undici, vite, zod; @vitest/mocker, fast-uri, vitest |
| S | 2 | 5 | 7 | undici, vite; @cloudflare/vite-plugin, @vitest/mocker, miniflare, vitest, wrangler |

These totals count affected packages, including dependency propagation, not distinct exploits or proven application exposure. The [saved audit summary](dependency-audit-2026-10-24.json) records advisory links and reported fixes. Vite/Vitest findings concern development/test server features; identify actual exposure. Zod is a direct framework tooling dependency and needs schema/MCP compatibility work for its reported major-version fix. Undici's installed package and Node's embedded Undici are separate patch surfaces.

The site audit suggests drastic Cloudflare downgrades through its meta-vulnerability calculation. Do not execute `npm audit fix --force` or accept that suggestion automatically. Resolve actual parent chains and patched ranges, validate current Cloudflare/Miniflare/Undici compatibility and rerun the audit after a reviewed lock update. A latest top-level version is not proof of a clean transitive graph; if upstream remediation is unavailable, record exposure and a concrete owner/resolution gate. Do not claim security completion with an unexplained high finding.

### PHP and eMudhra are different incidents

PHP's [October advisory](https://www.php.net/archive/2026.php) reports critical PHP runtime vulnerabilities. No PHP runtime was found in these two package manifests, lockfiles or the inspected browser/worker setup. That is bounded repository evidence, not a survey of all Syndromatic infrastructure. A TypeScript or React upgrade does not patch a separate PHP deployment.

Mozilla's [eMudhra response](https://blog.mozilla.org/security/2026/10/20/protecting-firefox-users-following-the-compromise-of-emudhra-intermediate-certificates/) concerns compromised intermediate CA keys, browser revocation distribution and root-store changes. The [Node October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) includes a CA-certificate update and other runtime fixes. The [24.22.1 release](https://nodejs.org/en/blog/release/v24.22.1) documents the patched Node 24 line. Updating project dependencies alone does not update an installed Node binary or its trust bundle, and replacing a binary does not patch a process already running it.

Inventory browser, operating-system, Node, Bun, workerd/CI/container trust authorities separately. Browser fetch uses the browser's network stack; tooling requests use their runtime stack. Bun can have bundled and additional system/custom CA sources; do not assume Chrome's revocation feed protects a CLI. Bun 1.4.4 documents TLS/security fixes, but its release text does not explicitly confirm the eMudhra root change; verify the actual accepted certificate policy before calling that incident handled for Bun. Never disable certificate/hostname checks, reuse a stale CA bundle or add arbitrary certificates to make an install pass.

### Maintenance end state

Pin reviewed tools/runtimes and frozen dependency graphs; record upstream advisories with reachability, affected runtime and fixed version. CI checks both package vulnerabilities and runtime security floors, with time-bounded documented exceptions rather than ignored failures. Include worker binaries, browser downloads and bundled WASM/native codecs in the inventory and retain notices/provenance. Review secure defaults, CSP, OIDC/PKCE, authorization and untrusted document rendering when changing their dependencies. No automatic deployment, recurring automation or external message is authorized by this document.

## 9. Completion criteria

The admitted programme is complete only when its selected Bun install/runtime contract, TypeScript 6.0.3 checking/API integration, coordinated build/test stack, vulnerability resolution, measured test improvement, eleven-app feature matrix and installed/browser/FX gates all have evidence. The deferred native port is not an extra completion prerequisite unless separately admitted. Tooling blockers remain visible; fewer tests, isolated benchmarks and sibling source aliases do not satisfy these gates.
