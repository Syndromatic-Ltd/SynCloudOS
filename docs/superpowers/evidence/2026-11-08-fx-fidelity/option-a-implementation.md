# Option A: compiled FX application attribution

Base: `7962d3e16b0340995445589247f502af76534e01`. Implementation owns the private binding infrastructure, plugin/build resources, focused fixtures/tests, and the single getting-started paragraph. Dispatch design/plan, root PLAN/REPORT, site configuration, older evidence and `.superpowers` are excluded.

## Decisions and consumption contract

- Discovered `.app` focused FX imports resolve to `\0virtual:syncloudos/app/<canonical-id>/fx/<family>`. Generated modules retain `export *` for original types and select explicit runtime exports through the private binder. The generator reads the owning source barrel or its packaged declaration barrel; no copied list of attributed class names is maintained.
- Only constructors marked with private `fxAttributedClass` metadata receive a subclass. A WeakMap caches each base constructor/app pair, aliases retain class identity, subclasses remain `instanceof` the base, and pure functions/classes/namespace objects (including specialised Crypto and Compression identities) pass through unchanged.
- Future production FX classes consume `fxAttributedClass`, `fxApplicationID` and `createFXSessionBinding` through `src/SynCloudOS/fxRuntimeContracts.ts`. That existing allowed entry forwards through the existing private `AppSDK/runtimeContracts.ts`; helpers live in `AppSDK/fx`. Direct FX-to-AppSDK imports remain forbidden. Architecture policy is unchanged and its test covers the allowed route and direct-import rejection.
- An attributed constructor calls the identity/session helper with `new.target`; attributed static operations use their class receiver. Unbound base access raises the owner-specified plugin/application-bundle message. No public factory, binder, capability type or provenance system was added.
- Binding/import does not consult a live session. A class may carry its app ID while ApplicationSession constructs it before service registration. `createFXSessionBinding` resolves the existing SCOS registry at first privileged use, then pins that exact session. It never migrates an instance to a replacement mount: abort or registry removal is terminal. Before first successful resolution, not-running and ambiguous results can be retried. Each eventual family adapter maps `notRunning`, `ambiguous` and `ended` into its Apple-shaped errors, captures its ports from the selected session, and owns resource cleanup. No permission/native operation may bypass that live-session validation.
- Private `fx-attribution-runtime.js` is an entry of the same SDK bundle graph, sharing the existing SCOS registry; the plugin resolves it by its package-relative absolute file path. It has no public package export. `fx-app-module-source.mjs` and the runtime/map are explicitly admitted package resources. Packed generator parsing uses the already shipped TypeScript dependency and declaration files.
- Discovery invalidates resolved per-app FX and SCOS modules with project/typography. The SDK pre-bundle fingerprint now hashes root `.mjs` generator content as well as JavaScript entries/chunk names.
- Independent SDK copies deliberately retain independent registries. Two runtimes with one app ID follow SCOS ambiguity; latest same-runtime session selection also follows SCOS. This is cooperative attribution in one realm, not hostile-code isolation.
- No existing hardware/network family was implemented or changed. Network's retained `network.read` entitlement means the later `NWFXPathMonitor` implementation likely needs attribution even without an authorisation method. Every later real family still requires its own compiled application end-to-end proof.

## Verification

TDD failures were observed for missing FX resolver/HMR behavior, generator-only fingerprint changes, missing private runtime helpers, and private package-resource admission before the corresponding implementation. The initial fixture typo (`index.ts` instead of required `index.tsx`) was corrected before recording the resolver's expected missing-behavior failure.

- Focused/affected run: **97 tests passed in 9 files**: attribution runtime, resolver/HMR, resource policy, SDK fingerprint, architecture policy, project conventions, SCOS, application toolchain and packed asset middleware.
- Final resolver/fingerprint run after the HMR identity-change assertion: **5 tests passed in 2 files**.
- Actual source plugin fixture: **1 test passed**, through the allowed `fxRuntimeContracts` entry, using unchanged `createSynWareTestHost` with two NSEApplication subclasses. It proves pre-service construction, `instanceof`, pure identities, native await, timer, third-party callback, session-ended and no-session behavior.
- Framework `npx tsc -b --pretty false`: passed after final source changes. Sibling site command: passed; no site source/configuration/adoption edits.
- `node scripts/quality/architecture-boundaries.mjs`: **1,619 files / 7,343 edges validated**. No policy exception.
- Serial SDK build passed. Existing SDK Rollup warnings about unrelated re-export cycles remain in `.artifacts/option-a-sdk-build.log`; the installed proof exercises the new binding graph.
- The first packed run passed its installed application/copy checks and executed the emitted class bindings, then failed the service-worker assertion because the fixture had not opted into `webApp`. Only the test fixture was corrected to declare installation and provide required assets.
- Final immutable installed proof: **1 outer test passed** (46.78 s), containing **2 compiled application/copy-isolation tests**, the existing **1-test 6e authoring fixture** with the plugin installed, and execution of the production-emitted JavaScript. The emitted PWA service worker includes the bound app chunk beneath `/nested/fx/`; the generated classes retain separate app IDs after await/timer callbacks. Public SDK entries expose none of the private helpers and package deep import rejects the private runtime. The independently copied SDK cannot see the original mounted app session.

## Frozen SDK receipt

The serial build receipt records the base commit plus an exact fingerprint of the final working source. Archive integrity and source equality were independently rechecked after the build; the installed-consumer machinery also checks the copied archive and every installed resource before running the proof.

- Source SHA-256: `3d9f01fee1c0613ac630cd7b5362cfe8c0ee7e39b63efbe5d0be53cf656ff4d2`.
- Resource SHA-256: `32991abf0d97eecdbd875f357a32124ced26c9a749d83e731812a7edf00740df`.
- Archive SHA-256: `ef311da6126459c4c5b10d7e5ea5be30439dd119c52df9f43e59e1958a67d995`.
- Archive: `.artifacts/synapp-sdk/archives/syndromatic-syncloudos-1.0.0-beta.2-ef311da6126459c4c5b10d7e5ea5be30439dd119c52df9f43e59e1958a67d995.tgz`.

No full suite, site server restart, forbidden port, branch/worktree creation, push or stash was used. C: remained above 20 GB (last measured approximately 273 GB free).
