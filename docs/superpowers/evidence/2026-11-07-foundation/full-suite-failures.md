# Full-suite failure index

- FAIL  tests/performance/text-primitives-performance.test.ts > headless text layout contracts > lays out 100000+ UTF16 units, reuses warm results and releases retained state
  Error: Test timed out in 30000ms.
- FAIL  tests/runtime/appkit-counterparts.test.ts > NSE names are AppKit names > gives every public NSE export an AppKit counterpart, or says why it has none
  AssertionError: expected [ 'NSEBinaryByteUnit', …(37) ] to deeply equal []
- FAIL  tests/runtime/foundation-models.test.ts > does not export a fabricated Cocoa predicate exception class
  AssertionError: expected true to be false // Object.is equality
- FAIL  tests/runtime/foundation-packed-consumer.test.ts > uses Foundation and CPFX from an independent SDK installation in a worker and strict worker-lib consumer
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/heritage-inspector-dev.test.ts > heritage development boundary > excludes the lazy Inspector graph and CSS from the production host region
  Error: Build failed with 9 errors:
- FAIL  tests/runtime/heritage-inspector-dev.test.ts > heritage development boundary > removes the bridge and UI from the production import graph without a package rebuild
  Error: Build failed with 9 errors:
- FAIL  tests/runtime/managed-typography-packed-consumer.test.ts > uses managed typography from an independently installed package in Node and app code
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/project-conventions-packed.test.ts > bundles an installed browser host with discovery plugin=false
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/project-conventions-packed.test.ts > bundles an installed browser host with discovery plugin=true
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/synapp-sdk-package.test.ts > portable SynWare SDK packages > compiles, bundles and mounts a genuinely external consumer against packed public exports
  Error: SynWare SDK package build failed:
- FAIL  tests/runtime/synapp-sdk-package.test.ts > portable SynWare SDK packages > derives archive declarations from the reviewed public entries instead of open handwritten mirrors
  Error: SynWare SDK package build failed:
- FAIL  tests/runtime/synware-public-api-repairs-packed.test.ts > typechecks and executes repaired APIs through an independently installed SDK
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/chronosphere/chronosphere-packed-consumer.test.ts > preserves typed neutral versions and prepared custom views in an installed SDK
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/fx/package-resources.test.ts > SDK source and resource fingerprints > includes original-source maps in installed resource integrity
  AssertionError: expected [Function] to not throw an error but 'AssertionError [ERR_ASSERTION]: SDK m…' was thrown
- FAIL  tests/runtime/fx/package-resources.test.ts > manifest archive consumption > keeps the resource fingerprint through a real offline pack/install of an isolated fixture
  AssertionError: SDK manifest must contain all thirteen FX entries.
- FAIL  tests/runtime/fx/package-resources.test.ts > manifest archive consumption > copies verified manifest bytes without requiring or repacking the mutable package directory
  AssertionError: SDK manifest must contain all thirteen FX entries.
- FAIL  tests/runtime/fx/package-resources.test.ts > manifest archive consumption > fails closed for old manifests, modified archives and traversal
  AssertionError: expected [Function] to throw error matching /SHA|integrity/i but got 'SDK manifest must contain all thirtee…'
- FAIL  tests/runtime/fx/package-resources.test.ts > manifest archive consumption > rejects tampered fingerprints and missing or modified installed resources
  AssertionError: expected [Function] to not throw an error but 'AssertionError [ERR_ASSERTION]: SDK m…' was thrown
- FAIL  tests/runtime/fx/packed-fx.test.ts > executes substantive FX operations from the built npm archive outside the repository
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/fx/packed-lumina.test.ts > executes and typechecks named-route LuminaFX values from an independently installed SDK archive
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/fx/packed-media.test.ts > executes and typechecks MediaFX from an independently installed SDK archive
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/fx/packed-value-foundations.test.ts > executes and typechecks LocationFX and MIDIFX from an independently installed SDK archive
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/fx/packed-video-capture.test.ts > executes scoped VideoFX capture from an independently installed SDK archive
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
- FAIL  tests/runtime/fx/packed-video.test.ts > executes and typechecks VideoFX frame ownership from an independently installed SDK archive
  AssertionError: SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.
