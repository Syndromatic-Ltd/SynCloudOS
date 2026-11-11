# Independent data and CompressionFX review

Reviewed 2026-11-07: commits `8dca9aa`, `0407c9c`; current `Foundation/NSEData.ts`, `Foundation/internal/compression.ts`, `FX/CompressionFX`, focused data/compression tests, and `docs/framework/fx/compression.md`.

Verdict: approved after the bounded fixes in `9a1176d`. The independent read-only pass found two stream-lifetime issues; the parent then authorized targeted admission/cancellation fixes and regressions. The immutable data and shared-codec design satisfies the reviewed Part A requirements. No full suite was run by this reviewer. Parent supplied the original 33 passing focused tests and worker smoke; the updated focused run passes 36 tests.

## Resolved P2: cancellation after a codec error could settle before upstream cleanup

Location: `src/FX/CompressionFX/CPFXCompression.ts`, `CPFXInputFilter.cancel`, originally lines 82-86.

If invalid compressed input errors the codec readable, `this.#reader.cancel(reason)` rejects immediately. The following `await this.#completion` is skipped, even when the source's asynchronous cancellation callback is still holding a file/network resource. This contradicts the documented shutdown guarantee and can let a caller leave a scope while upstream cleanup remains outstanding.

Reproduction uses a native gzip decompressor and an open ReadableStream that enqueues `[1,2,3]`; its `cancel()` callback awaits a manually controlled gate. After `readData` rejects and source cancellation begins, `filter.cancel()` rejects/settles before that gate is released. No codec mock is involved.

At the parent's request, added only the regression `awaits upstream cancellation even after the codec reader has errored` to `tests/runtime/compression-fx.test.ts`. The dedicated red run fails with `expected true to be false` for the settlement flag while the source cancellation gate is blocked. Evidence: `data-review-cancel-red.log`.

Fix in `9a1176d`: reader cancellation runs in `try` and `#completion` is awaited in `finally`. The completion promise already uses `allSettled` over both pipeline legs, so it cannot replace the reader's original rejection but waits for cleanup. The regression is included in the 36-test focused green run.

## Resolved P2: already-locked stream admission could leave an open codec pipeline

Location: `src/FX/CompressionFX/CPFXCompression.ts`, `CPFXInputFilter` constructor, originally lines 55-65.

Passing an already-locked ReadableStream makes `source.pipeTo(bridge.writable)` reject before the source is acquired. That rejection is collected by `allSettled`, but no upstream error ever reaches the bridge. Its readable-to-codec pipe therefore remains open forever. `readData()` waits indefinitely rather than surfacing the invalid stream state. This is distinct from ordinary source failures, which propagate through the bridge and are covered by existing tests.

Native reproduction: create a source, acquire `source.getReader()`, construct a gzip-decompression input filter with that source, and race `readData(10)` against a short observation timeout. The read remains pending and subsequently resolves `null` only after explicit `filter.cancel()`. The observation timeout is not the proof of validity; the rejected initial pipe plus permanently unclosed bridge explains the indefinite wait.

The output constructor had the analogous admission gap: an already-locked destination rejects the final `pipeTo` while the earlier codec-to-bridge pipeline has already started. The parent authorized admission guards for both constructors.

Fix in `9a1176d`: reject `source.locked` and `destination.locked` synchronously before constructing any codec or starting either pipeline leg. Deterministic regressions assert both constructors reject locked streams, retaining the original reader/writer for cleanup. Both regressions failed before the guards and pass afterward. The parent owns the accompanying public documentation clarification that streams must be unlocked.

## Reviewed requirements without additional findings

- Every supported input path copies into private byte storage. `bytes`, its subarrays and its buffer cannot mutate stored data; `blob` also receives a copy. The readonly type is not misrepresented as a frozen typed-array buffer.
- Byte ranges validate nonnegative safe integers, safe end arithmetic and the stored byte count, including empty data and an empty range at EOF.
- Base64 encoding avoids argument spreading; decoding validates alphabet/padding then re-encodes to reject noncanonical unused bits. Empty values, binary bytes and large buffers are covered.
- `zlib` maps to wrapped `deflate`; unknown or unavailable codecs reject explicitly. No silent substitution exists.
- One codec factory lives below FX in Foundation. NSEData and CPFX one-shot functions use the same collector; both filters construct codecs through that factory. Foundation has no upward FX/React/DOM dependency.
- Capability queries independently constructor-probe both directions for every algorithm; reporting both-direction availability is documented and supported by tests.
- Output filters drain the codec concurrently, preserve destination backpressure through the stream pipeline, wait for close on finalize, retain errors without unhandled rejections, and abort both the writer and destination pipeline.
- Pull filters bound each returned chunk, retain output remainders, reject concurrent reads and propagate ordinary source/native-codec errors. Native/internal buffering limits are stated accurately; the lifecycle edges above are addressed by the reviewed bounded fix.
- Documentation distinguishes portable worker evidence from physical browser/device acceptance, exposes no mounted-session requirement, and leaves public byte-return migrations for Part B.

## Follow-up validation and ownership

- `data-review-cancel-red.log`: the codec-error cleanup regression fails against the original implementation.
- `data-review-admission-red.log`: all three focused regressions fail before production changes; 18 other tests skipped intentionally.
- `data-review-green.log`: `npm.cmd test -- tests/runtime/compression-fx.test.ts tests/runtime/foundation-data.test.ts` passes both files, 36 tests, with native codecs in the default Node environment.
- `git diff --cached --check` passed before exact-path commit `9a1176d`. Only `CPFXCompression.ts` and `compression-fx.test.ts` were included. The parent is rebuilding SDK artifacts against the new source fingerprint and owns broader integration acceptance.

No edits were made to data storage/base64/compression primitives, public signatures, codec support policy or unrelated concurrent work.
