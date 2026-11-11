# Installed development FX attribution correction

Base: `baacfd06742b86405d1142d5636d42bfcce89ed6` on `fix/blind-rewrite-friction`. The coordinator found the problem during actual Chromium Gallery acceptance after the previous source, packed production and Vitest gates had passed. This packet fixes the development module graph without changing a family, identity symbol, session registry or public API.

## Cause and correction

The application imports already resolved to their correct per-app virtual modules. Their family imports were rewritten to Vite optimised dependency entries, while the private `fx-attribution-runtime.js` was served raw. Each graph instantiated its own private `Symbol("FX attributed class")` and registry. The raw binder could not recognise an optimised attributed base, returned that base unchanged, and a direct `PKFXPaymentAuthorizationController.canMakePayments()` consequently threw the plugin-required error. The coordinator separately proved the same-described symbols were distinct and the virtual class equalled the optimised base.

The plugin now returns `optimizeDeps.exclude: ["@syndromatic/syncloudos"]` and `optimizeDeps.include: ["react-dom"]`. Vite 7's `moduleListContains` matches the package itself and every slash-delimited subpath, so public entries, the private binder and the mounted SDK session machinery stay in one actual module graph. Unrelated dependency discovery remains enabled, user include/exclude entries still merge, and the installed-SDK cache fingerprint define remains intact. The source-checkout test now checks the absence of that build define specifically. No `Symbol.for`, ambient/global registry, cross-copy sharing, alias, hook-constructor workaround or per-site configuration change was introduced. A short developer-guide paragraph explains the plugin-owned development contract.

## Regression and verification

- New independent-install fixture: a discovered `.app` class directly calls the Pass static and constructs Network/Dispatch objects after an await, a real timer and a third-party callback. It checks bound and raw base `instanceof`, stable main identity, the real SDK test host's exact app context through SCOS preferences, terminal disposal and method-only HMR on the same live application and page. React remains optimised while SDK entries must remain raw. It runs actual installed Vite and Chromium, not Vitest's inline SDK module graph or a production-only bundle.
- TRUE RED, before production changes: `node node_modules/vitest/vitest.mjs run tests/runtime/fx/app-attribution-dev.test.ts --maxWorkers=1` -> `dev-binding-red.log`: **1 failed**, 16.56 s, ephemeral port 54271. The direct Pass static threw `z must be created by an application compiled with the SynCloudOS plugin`; the captured requests show optimised SDK entries alongside the raw private binder/registry. There were no unrelated browser page errors.
- Config RED: `node node_modules/vitest/vitest.mjs run tests/runtime/synware-vite-sdk-build.test.ts --maxWorkers=1` -> `dev-binding-config-red.log`: **1 failed / 3 passed**, 0.639 s; the SDK prefix was absent from merged exclusions.
- Focused GREEN: `node node_modules/vitest/vitest.mjs run tests/runtime/synware-vite-sdk-build.test.ts tests/runtime/application-toolchain.test.ts tests/runtime/fx/app-attribution-plugin.test.ts tests/runtime/fx/app-attribution.test.ts tests/runtime/fx/app-attribution-package-resources.test.ts tests/runtime/fx/dispatch-app-binding.test.tsx tests/runtime/fx/fx-entry-contract.test.ts tests/runtime/fx/package-resources.test.ts --maxWorkers=1` -> `dev-binding-focused.log`: **74 passed / 8 files**, 19.78 s, exit 0.
- Framework `npx tsc -b --pretty false` -> `dev-binding-framework-typecheck.log`: **exit 0**.
- Sibling site's `npx tsc -b --pretty false`, against its currently adopted baac SDK -> `dev-binding-site-typecheck.log`: **exit 0**. Final clean SDK adoption/site acceptance remain with the coordinator.
- `npm run boundaries:architecture` -> `dev-binding-architecture.log`: **1,795 files / 8,169 edges validated**, exit 0.

### Harness corrections, not product findings

The first attempt used `index.ts`; application discovery requires `index.tsx`, so that attempt stopped before serving (`dev-binding-initial-fixture.log`). A second attempt configured Vite with port zero, which Vite interpreted as default port 5173. The explicit forbidden-port assertion caught this before browser navigation; the test's finally block immediately closed its own server. No existing server was stopped or changed. This brief unintended protected-port binding was reported to the coordinator and is not concealed. The final fixture obtains a real OS-assigned ephemeral port, rejects every protected port before Vite starts and binds it strictly. The successful RED reproduction used port 54271. All subsequent servers are test-owned and closed in finally.

## Frozen paths

All ten implementation, guide, test and fixture files are frozen after explicit staging. `dev-binding-format-audit.json` records strict UTF-8/no BOM/no detected mojibake and original LF preservation. Working/index and whitespace checks pass. This evidence is ASCII UTF-8. The coordinator's staged Gallery evidence and root PLAN/REPORT remain outside this packet.

SDK source fingerprint: `e4d9730c74e9a29ed2e309cdd71f1dc5d5ad37d36f805958ccfd8999cf953eea` (2182 paths). Exact frozen input bytes:

| Path | SHA-256 |
| --- | --- |
| `scripts/synware/vite-plugin.mjs` | `990d8276dabda680318404a0b042ef65c3cafacec2295d47946f9fb2e571a232` |
| `docs/framework/synware-sdk.md` | `ed980d71d84596e615ce8b0ad8e6d9757cc7c81380c560a953aa5b978b1c6d0f` |
| `tests/runtime/synware-vite-sdk-build.test.ts` | `72a6f62bbb4ccc56df3a493bf0294df5846d1b25db7030c542e8bd942cead147` |
| `tests/runtime/fx/app-attribution-dev.test.ts` | `9c69f0921220d361ba1ac490a7fa1e60e18c83ce2cce53c206b64d12b4a9fab5` |
| `tests/fixtures/fx-dev-attribution/index.html` | `e4283892b3e111171c91d33e906b267d83e0f06c7e607f36e70562acb10fe1a0` |
| `tests/fixtures/fx-dev-attribution/main.ts` | `8f31974d1fd374d90436f9cbd7ba0cb4a6c501f149735226b3749a56c34ac017` |
| `tests/fixtures/fx-dev-attribution/serve.mjs` | `9c42b510b41c068570e514a898219e05bde135a2e61608564484f8be87831d8d` |
| `tests/fixtures/fx-dev-attribution/src/SynWare/Probe.app/Contents/Info.ts` | `11e47c2d281e3ec5c4bcd7a42ee79ee6d7208b1a866b2c48b196ef42cfeb8441` |
| `tests/fixtures/fx-dev-attribution/src/SynWare/Probe.app/Contents/index.tsx` | `72ee217fa21dac3164a4fec3b4a54da22843181d80db8a71da7190fc653bfa16` |
| `tests/runtime/fx/app-attribution-plugin.test.ts` | `14628613e8575af76d5cda0049d98e11415bc272152860bfeb2df51c921646fc` |

The final SDK rebuild, installed Chromium/HMR GREEN regression, relevant immutable packed proofs and independent delta review follow this corrected freeze. Their results are appended below without changing these inputs. No additional complete framework suite is run: the owner's required serial full run was already performed once and remains honestly recorded. No branch, push, stash, worktree, Fusion, artwork, payment button, VR or site-config operation belongs to this packet. C: free space remained above 272 GB.

### Test-only correction after the first frozen proof

The first built-archive run (`dev-binding-packed.log`) passed the three production/Dispatch/hook packed gates but failed the dev fixture's strict installed TypeScript check before starting Chromium. The fixture state object was inferred too narrowly, and `SynWareContextValue` exposes preferences as `persistence.getPreference`, not `preferences.get`. The coordinator authorised a test-only re-freeze: an explicit state interface and the existing public persistence member corrected the harness without weakening strict TypeScript. The existing dev receipt also now retains its server log so warnings can be reported precisely. `dev-binding-frozen-inputs-initial.json` preserves the original freeze; current `dev-binding-frozen-inputs.json` records exactly these two test-only changes. No plugin, guide, implementation or SDK byte changed; the source fingerprint and immutable archive remain identical, so only the dev test is rerun. The three already-passing packed gates are retained.

### Evidence-led CommonJS correction and final freeze

The corrected fixture passed strict installed TypeScript but timed out before its main module could execute. The diagnostic rerun retained the original 30 s readiness timeout and ordinary dependency discovery; `dev-binding-readiness-diagnostic.json` shows state null, no failed requests, an empty server log, and the precise browser error: raw `/node_modules/react-dom/index.js` does not provide named export `flushSync`. This is the SDK's directly imported CommonJS peer entry. The package exclusion remains necessary for private identity; the plugin now explicitly includes only the evidenced `react-dom` entry for optimisation. The fixture's optimisation settings are unchanged, and the browser regression additionally asserts the ReactDOM entry is actually optimised. No global symbol, shared registry or API workaround was introduced.

`dev-binding-react-dom-red.log` records the additional unit RED: 1 failed / 3 passed because ReactDOM was absent from merged includes. Final covering checks after the correction:

- Same eight-file focused command -> `dev-binding-final-focused.log`: **74/74 tests, 8/8 files, 19.50 s, exit 0**.
- Framework and sibling-site `npx tsc -b --pretty false` -> `dev-binding-final-framework-typecheck.log` and `dev-binding-final-site-typecheck.log`: **both exit 0**.
- `npm run boundaries:architecture` -> `dev-binding-final-architecture.log`: **1,795 files / 8,169 edges, exit 0**.

The original frozen inventory and the intermediate test-only freeze remain in `dev-binding-frozen-inputs-initial.json` and `dev-binding-frozen-inputs-pre-react-dom.json`. The current inventory/table describe the final corrected plugin, guide and regression bytes. The first SDK archive and its failed/partial proof records remain historical evidence, not acceptance for this final source. A second SDK build is required by the demonstrated CommonJS correction; it is not represented as the original single-build packet. No implementation, guide or test changes are planned after this final freeze.

The RED server emitted three SVG URL warnings (home/settings/user-info). The later readiness diagnostic's server log was empty. Browser page errors and Vite server warnings are distinct; no warning-free-server claim is made. The final successful dev receipt will retain its actual server log.

### Canonical dependency URL correction

After the CommonJS correction, the real dev test reached the original attribution failure again. `dev-binding-final-dev-isolated.log` proves the same installed `fx-attribution-runtime.js` was requested both with Vite's dependency version query (`?v=08fd650c`) and without a query, while family imports were versioned. The emitted runtime itself owns the private Symbol definitions, so these two browser module URLs create separate identities even after SDK pre-bundling is excluded. The custom resolver had returned an absolute path directly, bypassing Vite's ordinary `ensureVersionQuery` handling.

The private virtual-runtime branch now delegates to `this.resolve(displayPath(fxRuntimePath), importer, { skipSelf: true })`. Vite owns its canonical path and cache version; no hash is synthesised and no global registry is introduced. The existing plugin regression was updated test-first to require resolver delegation and preservation of its versioned result; `dev-binding-runtime-url-red.log` records that unit failure. Its optional direct browser-marker diagnostic was stopped after Vitest rewrote the diagnostic dynamic import; the existing duplicate-URL request evidence and emitted Symbol source already established the cause. The failure-only diagnostic now evaluates a browser-native import, without affecting the product or success path.

Final resolver gate: the same eight-file command -> `dev-binding-resolver-focused.log`: **74/74 tests, 8/8 files, 20.03 s, exit 0**. Framework/site TypeScript and architecture checks passed again in the corresponding `dev-binding-resolver-*` logs (1,795 files / 8,169 edges). This correction adds the existing `app-attribution-plugin.test.ts` path to ownership: ten frozen implementation/guide/test/fixture paths and this evidence, eleven explicit commit paths. The coordinator authorised that scope. A third build is required by this demonstrated URL-identity defect; prior archives and failed proofs remain preserved. Dev-only acceptance runs first, then the three packed proofs against the same final archive. Commit remains conditional on every gate passing.

### Explicit fixture consent

The canonical resolver removed the attribution failure: the browser diagnostic records one runtime URL and `familyMarkers: [true]`. The next error was the deterministic test host's explicit capability gate. The fixture now permits its fake payment adapter and local storage before directly querying payment availability and writing/reading SCOS preferences. The production persistence path explicitly uses the storage test control (`appRuntimeFacade.ts`), so allowing that specific fake category is necessary for the intended shared-context proof. No entitlement, privacy check, denial expectation or TypeScript option was weakened. Only `main.ts` changed; the same final SDK archive/source fingerprint is retained and the original freeze is preserved in `dev-binding-frozen-inputs-pre-fixture-consent.json`.

### Actual installed Chromium and HMR acceptance

The shared SCOS preference probe also requires the fake credentials category: the owning persistence code nests `credentials.read/write` around storage access. The fixture explicitly allows that category, preserving the production gate. Once attribution and all three async paths passed, HMR initially reloaded because the fixture omitted the documented `@vitejs/plugin-react` host setup. `dev-binding-hmr-diagnostic.json` records the missing hot-registration code and project full-reload frame. The fixture now installs the repository's exact React plugin version and uses `react()` as the actual site and getting-started guide do. This supplies the existing application toolchain parser and Fast Refresh integration. No SDK implementation or archive byte changed for these fixture corrections.

`node node_modules/vitest/vitest.mjs run tests/runtime/fx/app-attribution-dev.test.ts --maxWorkers=1` -> `dev-binding-complete-dev.log`: **1/1 passed, 39.75 s, exit 0**. `dev-binding-installed.json` proves:

- An independent, unlinked SDK installation, strict installed TypeScript and actual Chromium/Vite development execution with ordinary optimisation enabled.
- React and ReactDOM optimised; no SDK entry optimised; exactly one private attribution runtime URL.
- Direct Pass availability and Network/Dispatch construction after await, real timer and third-party callback, with bound/raw base identity and shared real context through SCOS preferences.
- A method-only HMR update changes the live application's method while preserving the page boot token, application object, stable attributed class/main-queue identity and the three async/context checks.
- Actual host disposal terminates the held queue; installed SDK resource integrity remains unchanged.

The final dev server log is empty, and there are no browser page errors. This statement concerns this exact successful dev proof; historical SVG warnings and SDK build warnings remain separately disclosed. `dev-binding-frozen-inputs-pre-final-harness.json` preserves the previous test bytes; the current inventory contains the exact successful fixture/runner bytes. These test-only updates were authorised by the coordinator and did not change source fingerprint `e4d9730c74e9a29ed2e309cdd71f1dc5d5ad37d36f805958ccfd8999cf953eea` or its final SDK archive. The remaining three packed gates now run against the same archive before commit.

## Final accepted archive and commit gate

- Final resolver SDK build: `npm run sdk:build` -> `dev-binding-resolver-sdk-build.log`, **exit 0**. Three builds occurred in this investigation: initial exclusion, evidenced CommonJS correction, and evidenced canonical-URL correction. The third archive is the sole final accepted package. Existing SDK circular-chunk/execution-order warnings remain; no warning-free SDK build claim is made.
- Actual installed Chromium/HMR acceptance: **1/1 passed, 39.75 s**, `dev-binding-complete-dev.log`.
- `node node_modules/vitest/vitest.mjs run tests/runtime/fx/app-attribution-packed.test.ts tests/runtime/fx/dispatch-packed.test.ts tests/runtime/fx/hooks-packed.test.ts --maxWorkers=1` -> `dev-binding-accepted-packed.log`: **3/3 passed, 3 files, 127.66 s, exit 0**. These cover compiled app/PWA bindings, Dispatch attribution and separate-copy registry isolation, hook identity/declaration boundaries, strict installed types, production imports and resource integrity.
- Archive SHA-256: `b46e41f273adfa7aa885dc1fbcc3b85a1efc5ef98aa8e7561f964a9551bd58ae`.
- Source SHA-256: `e4d9730c74e9a29ed2e309cdd71f1dc5d5ad37d36f805958ccfd8999cf953eea`.
- Resources SHA-256: `fd3a98110baab1d39e704197e17bc59b489f0b0774585ef7527dcb3962b15e31`.
- npm integrity: `sha512-MBTgr8vrJrlM4ROXHNsUth8VGsIG8Tx8GaJ268LzytGGZ0ADcguZs6wO9Gf+dyn8Y48pXUDTpVMEJXw3v1Np0Q==`.

Complete immutable receipt copies are `dev-binding-final-dev-installed.json`, `dev-binding-dispatch-installed.json` and `dev-binding-hooks-installed.json`; all match the same archive/source/resources/integrity. The final manifest is `dev-binding-build-manifest.json`, with the first two manifests preserved separately. `dev-binding-package-verification.json` records receipt byte hashes and restored tracked historical mutable receipt paths. Unrelated root PLAN/REPORT and staged Gallery evidence remain outside this commit.

All ten frozen implementation/guide/test/fixture files match their final hashes and staged bytes, whitespace checks pass, original LF and UTF-8/no-BOM are preserved, and this evidence remains ASCII. The coordinator reviewed the narrow final source and authorised the eleven-path `FX:` commit once these gates passed. Its SHA and committed/index/working byte proof are written to `dev-binding-commit.txt` and `dev-binding-postcommit-verification.json`. Clean site adoption and Gallery screenshots remain the coordinator's next acceptance steps; this packet does not claim those outcomes.

## Follow-up: explicit host SDK optimisation includes

Base: `a4a929f12cc53e1da9cc0cf218d549bc124c5245`. After clean site adoption, the coordinator found that its protected preview configuration explicitly included the SDK root and about two dozen SDK subpaths in dependency optimisation. Vite's explicit includes override exclusions, so the prior package exclusion could not guarantee one graph under that host configuration. The observed Gallery payment validation failure came from duplicated class identity. No site or protected configuration was edited.

The owning plugin now filters only the exact `@syndromatic/syncloudos` include and slash-delimited subpaths out of the input config before Vite merges returned arrays. It retains unrelated packages (including similarly prefixed names), ordinary discovery, ReactDOM optimisation, SDK exclusion, the build fingerprint and canonical private-runtime resolution. This uses the config hook's supported input mutation; returning another include array would have merged the conflicting original entries back in. The guide documents that explicit host SDK includes are removed.

Test-first evidence:

- `node node_modules/vitest/vitest.mjs run tests/runtime/synware-vite-sdk-build.test.ts tests/runtime/fx/app-attribution-dev.test.ts --maxWorkers=1` -> `dev-host-include-red.log`: **2 failed / 4 passed**, 62.86 s. The unit calls actual Vite `resolveConfig` and proves the SDK root/sdk/fx-pass entries survive into resolved configuration. The independent installed dev fixture explicitly requests SDK root and sdk; Chromium rejects its duplicated base with `The default export is not an NSEApplication class` (`dev-host-include-browser-red.json`). The readiness timeout is the consequence of this captured module/class failure, not an unclassified timing flake.
- The same eight-file focused command used above -> `dev-host-include-focused.log`: **75/75 tests, 8/8 files, 30.68 s, exit 0**. The resolved top-level and client environment include lists now contain only the intended unrelated entries plus ReactDOM; similarly prefixed packages remain intact.
- Framework and site `npx tsc -b --pretty false` -> `dev-host-include-framework-typecheck.log` and `dev-host-include-site-typecheck.log`: **both exit 0**.
- `npm run boundaries:architecture` -> `dev-host-include-architecture.log`: **1,795 files / 8,169 edges, exit 0**.

Five changed source/guide/test/fixture paths are frozen in `dev-host-include-frozen-inputs.json`; this evidence is the sixth changed path. They are within the previously authorised eleven-path ownership. UTF-8/no BOM/no mojibake, original LF, index equality and scoped whitespace checks pass. SDK source fingerprint: `59ea253b4b3dbe26ede99ac05ba7fa73736e1a2a073ac7e66ad146ee35848ae7`. The protected host configuration, root PLAN/REPORT and staged Gallery evidence remain outside this commit. One new SDK build and actual installed dev/HMR proof followed by three packed proofs are required for this follow-up; older accepted archives remain historical evidence.

### Explicit-host-include final acceptance

- `npm run sdk:build` -> `dev-host-include-sdk-build.log`: **exit 0**, one build after this follow-up freeze. Existing SDK circular/execution-order warnings remain disclosed.
- `node node_modules/vitest/vitest.mjs run tests/runtime/fx/app-attribution-dev.test.ts --maxWorkers=1` -> `dev-host-include-dev-green.log`: **1/1 passed, 35.92 s, exit 0**. The host fixture still explicitly includes SDK root/sdk; its resolved include list contains neither. Real Chromium proves ordinary optimisation, strict installed types, raw SDK entries, React/ReactDOM optimisation, all three asynchronous attribution/context cases, stable raw/bound identity, same-page/same-application HMR, terminal disposal and resource integrity. The final server log is empty.
- `node node_modules/vitest/vitest.mjs run tests/runtime/fx/app-attribution-packed.test.ts tests/runtime/fx/dispatch-packed.test.ts tests/runtime/fx/hooks-packed.test.ts --maxWorkers=1` -> `dev-host-include-packed.log`: **3/3 passed, 3 files, 129.95 s, exit 0**.
- Archive SHA-256: `9b8f666d409b95ce174977f341f58cbb156a26350c7bd0da72909b85cdd052a5`.
- Source SHA-256: `59ea253b4b3dbe26ede99ac05ba7fa73736e1a2a073ac7e66ad146ee35848ae7`.
- Resources SHA-256: `eb60d93bc0574a90456a4bc34cdab9cb1430bd8205fc4016ed17e8dcfc41a937`.
- npm integrity: `sha512-vhwCKHUQivunkqeGclxb4THQC5vNWkLrjF+fjVKBEAzeDAQ3DQGjEuLrXxzeRh7zJccdgYZHLTeAxP/unkYi+w==`.

`dev-host-include-dev-installed.json`, `dev-host-include-dispatch-installed.json` and `dev-host-include-hooks-installed.json` are complete final receipt copies for that single archive. `dev-host-include-package-verification.json` records their byte hashes, matching build/source/resource identities and the restored tracked historical receipt. The coordinator reviewed the five-file delta and all frozen hashes and authorised the six-path follow-up commit after these gates. No source or test byte changed after the follow-up freeze. Its commit and committed/index/working byte proof are recorded in `dev-host-include-commit.txt` and `dev-host-include-postcommit-verification.json`. The root's clean site adoption and actual Gallery verification follow separately; no site or protected preview configuration was changed by this work.

## Follow-up: complete emitted React peer coverage

Base: `4be4c68c41763ed44ca1009a8f5295ebc2057e8f`. Actual site startup then exposed raw `react-dom/client.js` without named `createRoot`. SDK pre-bundling had been removed correctly; the remaining failure was a missing peer optimisation entry. The earlier fixture supplied React/client/JSX-runtime includes itself, masking that requirement. It now matches the actual host dependency shape: explicit SDK root/sdk includes only, ordinary discovery, and plugin order `[synCloudOS, react]`. The fixture provides no React optimisation entries.

The emitted SDK JS imports exactly four CommonJS React peer entries: `react`, `react-dom`, `react-dom/client` and `react/jsx-runtime`. The plugin now includes those four explicitly. The separate `oauth4webapi` external is ESM and the HarfBuzz reference is a WASM URL asset; no speculative dependency was added. SDK include sanitisation, exclusion, canonical runtime resolution and privacy/lifetime contracts are unchanged.

- Test-first command: `node node_modules/vitest/vitest.mjs run tests/runtime/synware-vite-sdk-build.test.ts tests/runtime/fx/app-attribution-dev.test.ts --maxWorkers=1` -> `dev-sdk-peers-red.log`: **3 failed / 3 passed**, 61.73 s. Both unit cases detect the missing peers. The actual installed browser reproduces the exact raw-client `createRoot` export error (`dev-sdk-peers-browser-red.json`), with no failed requests and empty server log.
- Same eight-file focused command as above -> `dev-sdk-peers-focused.log`: **75/75 tests, 8/8 files, 30.72 s, exit 0**.
- Framework/site `npx tsc -b --pretty false` -> `dev-sdk-peers-framework-typecheck.log` and `dev-sdk-peers-site-typecheck.log`: **both exit 0**.
- Architecture -> `dev-sdk-peers-architecture.log`: **1,795 files / 8,169 edges, exit 0**.

The installed regression retains all attribution, async, context, identity, HMR and disposal checks and additionally requires all four peer entry requests to be optimised. Five changed source/guide/test/fixture paths are frozen in `dev-sdk-peers-frozen-inputs.json`; this evidence is the sixth changed path. All are within the authorised scope. UTF-8/no BOM/no mojibake, LF preservation, index equality and whitespace checks pass. Source fingerprint: `a99970151f276d4bdd65e9fd2450aac9b1e3b82520f09a497b01eb998a9959f0`. No site/protected configuration is edited. One SDK build and actual dev proof followed by three packed gates are required for these exact frozen bytes.

### Complete-peer final acceptance

One frozen SDK build passed (`dev-sdk-peers-sdk-build.log`; existing SDK warnings remain disclosed). Actual installed Chromium with SDK-only host includes and `[synCloudOS, react]` passed **1/1 in 37.02 s** (`dev-sdk-peers-dev-green.log`): all four emitted React entries were optimised, SDK entries stayed raw, and every strict-type/async/context/identity/HMR/disposal/integrity assertion passed; server log empty. The unchanged three packed proof command passed **3/3 files/tests in 117.55 s**, exit 0 (`dev-sdk-peers-packed.log`).

Final archive `b0d6a6a298c6347834463bc84d6fb1f9a04dd4538b9005fdecd101ac190410bc`; source `a99970151f276d4bdd65e9fd2450aac9b1e3b82520f09a497b01eb998a9959f0`; resources `0fdec76cb7d313aebdd5b3b93edfd2bb81bceac3a7a3c9134026e4d8d8b678fe`; integrity `sha512-660BxgVTZDh4t1mUFP8LmJgE4IgTrDaempzqkJmtcwWvpbjDATohTBedp3u/FJ7T06/s4XfER6wLtUWAXWFE7w==`. Full final dev/Dispatch/hooks receipts and their hashes are recorded under `dev-sdk-peers-*` and `dev-sdk-peers-package-verification.json`. The tracked historical receipt was restored. All five frozen files and six staged paths match tested bytes; encoding, LF and whitespace gates remain clean. The coordinator approved the delta and authorised the explicit six-path commit after these gates. Its SHA and post-commit byte/source proof are in `dev-sdk-peers-commit.txt` and `dev-sdk-peers-postcommit-verification.json`. No site or protected configuration was changed; final actual Gallery adoption remains with the coordinator.
