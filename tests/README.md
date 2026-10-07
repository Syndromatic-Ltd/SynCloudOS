# SynCloudOS tests

Everything here tests the framework through its own sources or its built
package. No test depends on a website checkout.

| Folder | What it covers | How to run |
| --- | --- | --- |
| `runtime/` | Kernel, AppSDK, Webspring, windows, documents, policy, FX and package contracts | `npm test` (or `npm run test:runtime`) |
| `nse/` | NSE controls, data views, appearance and toolbars | `npm test` |
| `integration/` | Multi-component NSE scenarios and the text system example | `npm test` |
| `performance/` | Structural budgets for controllers, data views, overlays and windows | `npm test` |
| `decoupling/` | Generic host identity and legal defaults | `npm test` |
| `packaging/` | Asset portability and retired-entry checks for the published package | `node --test tests/packaging/*.test.mjs` |
| `e2e/` | Browser acceptance across Chromium, Firefox and WebKit | `npm run test:e2e` |
| `fixtures/`, `setup/`, `types/` | Shared fixtures, environment setup and compile-time contracts | `npm run typecheck:contracts` |

## Packed-package tests

Tests whose names start with `packed`, plus `synapp-sdk-package` and
`package-resources`, install the built archive into a temporary consumer. Run
`npm run sdk:build` first; without `.artifacts/synapp-sdk/build-manifest.json`
they fail with `ENOENT`. Run them apart from another SDK build, because both
write package artefacts.

Use the CI sequence to keep the build and package checks serial:

```bash
npm run sdk:build
npm test -- --exclude tests/runtime/synapp-sdk-package.test.ts --exclude tests/runtime/managed-typography-packed-consumer.test.ts --exclude tests/runtime/chronosphere/chronosphere-packed-consumer.test.ts --exclude 'tests/runtime/fx/packed-*.test.ts' --maxWorkers=1
npm test -- tests/runtime/synapp-sdk-package.test.ts --maxWorkers=1
npm run sdk:build
npm test -- tests/runtime/managed-typography-packed-consumer.test.ts tests/runtime/chronosphere/chronosphere-packed-consumer.test.ts --maxWorkers=1
node --test tests/packaging/*.test.mjs
npm run fx:installed
```

## Helpers

`runtime/helpers.ts` holds framework runtime, bundle, identity, host-installation
and policy-grant utilities. It supplies `runtime/testPolicyProfile.ts`
explicitly, so production defaults are never bent to suit a test. Default
document types and trusted document kinds are empty; each test registers the
document types and contributions it needs.

## Browser tests

`playwright.config.ts` starts `tests/e2e/vite.config.ts` on port 5377 without a
website entry, worker or branded Webspring definition. It does not reuse an
unrelated server; set `FRAMEWORK_E2E_SERVER_READY=1` to reuse this fixture
server deliberately.

Set `FRAMEWORK_E2E_FIREFOX_HEADED=1` to run Firefox with a display. Linux CI
uses Xvfb, Mesa and a PulseAudio null sink so graphics and audio clock tests
execute against real browser services without physical devices.
The PDF reader's installed worker is served unchanged by this fixture server;
Vite still resolves its URL module, but does not inject a development WebSocket
into the third-party worker.

## Repository checks

Install ripgrep (`rg`) before running the repository boundary checks.
The quality job also installs all three Playwright engines for browser-backed
Vitest contracts and runs the main suite with one worker to limit compiler and
layout contention on the hosted runner.

- `npm run boundaries:architecture` validates layer imports, runtime browser
  globals, keyboard listeners and identity-cookie confinement against
  `scripts/quality/architecture-boundaries.json`.
- `npm run product:names` rejects private delivery identifiers and retired
  product names in sources, scripts and the built package.
