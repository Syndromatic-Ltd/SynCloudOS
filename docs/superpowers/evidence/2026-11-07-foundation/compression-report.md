# NSEData and CompressionFX implementation report

Owned scope: `src/Foundation/NSEData.ts`, `src/Foundation/internal/compression.ts`, `src/FX/CompressionFX/`, the two focused runtime tests, `docs/framework/fx/compression.md`, and `compression-*` evidence here. Foundation exports and NSERange are coordinated with the models worker; package/configuration integration belongs to the root worker. No Part B byte-return APIs changed.

## Exports and design

- Foundation: `NSEData`, `NSEDataCompressionAlgorithm` (value and type), `NSEDataConvertible`.
- CompressionFX: `CPFXAlgorithm` (value and type), `CPFXOperation`, `CPFXCapabilitySnapshot`, `CPFXCapabilities`, `CPFXCompress`, `CPFXDecompress`, `CPFXInputFilter`, `CPFXOutputFilter`.
- Immutable data copies every input and byte-view output, validates NSERange, supports strict canonical base64, Blob reads/writes, equality, and asynchronous compression.
- A single Foundation codec factory and one-shot collector use native CompressionStream/DecompressionStream. FX depends on these internals; Foundation has no upward imports.
- Runtime capability queries instantiate both codec directions independently for every format; zlib maps to web deflate. Unsupported formats reject explicitly.
- Pull filters use bounded `readData` and explicit cancellation; push filters drain concurrently, await backpressure/final destination closure, and support abort. Asynchronous upstream cancellation is awaited across both input pipeline legs.
- AGPL headers copied as UTF-8 from LocationFX/public.ts, preserving the actual copyright character.

## Verification

- `npm.cmd test -- tests/runtime/foundation-data.test.ts tests/runtime/compression-fx.test.ts`: **33 passed** (2 files), `compression-green.log`.
- Initial missing-module red captured in `compression-red.log`; initial cancellation failure captured in `compression-first-green.log`. Dedicated asynchronous-cancellation regression failed before its fix in `compression-cancellation-red.log`.
- Tests cover raw/subview/buffer/data immutability, freezing, range bounds, large/empty/invalid/canonical base64, Blob reads, real gzip/zlib and every actually-supported codec, corrupt/truncated/empty compressed input, independent two-direction constructor probes, missing constructors, both filter operations, source/sink failures, cancellation, pending-read exclusion, slow destinations, and no window/document/navigator.
- `node node_modules/typescript/bin/tsc -p docs/superpowers/evidence/2026-11-07-foundation/compression-worker-tsconfig.json`: **exit 0**, strict ES2022 + WebWorker-only libraries, no ambient types. This caught and fixed native BufferSource variance.
- `node docs/superpowers/evidence/2026-11-07-foundation/compression-worker-smoke.mjs`: **exit 0**. Browser-target esbuild bundle ran inside a real Node worker, round-tripping 12,000 bytes with zlib, gzip, and brotli. `window` and `document` were undefined. See `compression-worker-smoke.log`.
- Full workspace typecheck during concurrent model migration produced transient Models/NSE diagnostics; this worker does not claim the complete workspace typecheck passes. Root owns the final integrated checks.

## Limits

No WASM fallback. Algorithm availability follows the host constructor. This run supports zlib/gzip/brotli and rejects zstd. Worker smoke uses Node 24.22.1, not a physical browser/device acceptance check. Root owns installed-package consumer/browser checks. One-shot methods allocate full results; streaming uses native buffering and cannot promise a fixed memory limit. Base64 deliberately accepts canonical RFC 4648 only. Existing public byte APIs remain deferred to Part B.

## Commits

- `8dca9aa` — `Foundation: Add immutable NSEData bytes and shared codecs`.
- Companion commit — `FX: Add CompressionFX streaming filters and capability probes` (this report is committed with that change).
