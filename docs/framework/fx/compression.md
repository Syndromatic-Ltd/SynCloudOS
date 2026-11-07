# CompressionFX and Foundation data

Import immutable byte values from `@syndromatic/syncloudos/foundation`, and streaming compression from `@syndromatic/syncloudos/fx/compression`. Both modules run in workers and require no mounted session, permission, React, or DOM.

```ts
import { NSEData, NSEDataCompressionAlgorithm } from "@syndromatic/syncloudos/foundation";
import { CPFXAlgorithm, CPFXCapabilities, CPFXCompress, CPFXDecompress } from "@syndromatic/syncloudos/fx/compression";

const original = NSEData.from(new TextEncoder().encode("Hello, Foundation"));
const packed = await original.compressed(NSEDataCompressionAlgorithm.gzip);
const restored = await packed.decompressed("gzip");
console.assert(original.isEqual(restored));

const support = CPFXCapabilities.query();
if (support.algorithms.includes(CPFXAlgorithm.brotli)) {
  const compressed = await CPFXCompress(original, "brotli");
  const data = await CPFXDecompress(compressed, "brotli");
}
```

`NSEDataConvertible` accepts `NSEData`, `Uint8Array`, or `ArrayBuffer`. Construction copies bytes, including typed-array subviews. `NSEData.read(blob)` reads a Blob or File asynchronously. `count` measures bytes; `bytes` returns a defensive copy typed as a readonly Uint8Array. Mutating that copy through JavaScript or its buffer cannot change the data. `subdata({ location, length })` accepts an `NSERange` and rejects negative, fractional, unsafe, or out-of-bounds ranges. `blob(type)` creates a Blob for browser APIs. `base64EncodedString()` and `NSEData.fromBase64(text)` use canonical, padded RFC 4648 base64, rejecting whitespace, URL-safe variants, invalid padding, and nonzero unused bits. Empty data is supported.

`CPFXAlgorithm` and `NSEDataCompressionAlgorithm` contain `zlib`, `gzip`, `brotli`, and `zstd`. `zlib` uses the web `deflate` format, including the zlib wrapper; it is not raw DEFLATE. The capability query constructs **both** `CompressionStream` and `DecompressionStream` for each format and reports an algorithm only if both constructors succeed. Brotli and Zstandard depend on the current runtime. No codecs are downloaded or silently substituted. An unsupported algorithm rejects with a descriptive `TypeError`; invalid, truncated, and corrupt compressed input rejects with the native codec error. Constructor support is a capability probe, not a promise that arbitrary input is valid.

`CPFXCompress(data, algorithm)` and `CPFXDecompress(data, algorithm)` return `Promise<NSEData>` and use the same Foundation codec implementation as the data methods. One-shot methods hold the complete input and result in memory. Use filters for large sources and destinations.

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { CPFXInputFilter, CPFXOutputFilter } from "@syndromatic/syncloudos/fx/compression";

// Pull from any ReadableStream<NSEDataConvertible>, including Blob.stream().
const input = new CPFXInputFilter("decompress", "gzip", gzipBlob.stream());
try {
  for (;;) {
    const data = await input.readData(64 * 1024);
    if (data === null) break;
    await consume(data);
  }
} finally {
  await input.cancel();
}

// Push into a WritableStream<NSEData>.
const output = new CPFXOutputFilter("compress", "gzip", destination);
try {
  await output.write(new TextEncoder().encode("first chunk"));
  await output.write(NSEData.from(new Uint8Array([0, 1, 2])));
  await output.finalize();
} catch (error) {
  await output.abort(error);
  throw error;
}
```

Both filters accept `"compress"` or `"decompress"`. `readData(ofLength)` requires a positive safe integer and returns up to that many bytes, with `null` at EOF. Only one read may be pending; await each read. Cancelling discards buffered output and awaits upstream cancellation, including an asynchronous source cancel callback.

Await each output `write` to follow codec backpressure. The filter drains the codec concurrently into its destination, and `finalize()` flushes the codec and waits for the destination to close. A slow destination delays completion; a failed destination rejects pending writes or finalization. `abort(reason)` cancels the codec and destination and waits for shutdown. Finalized or aborted filters reject further writes and finalization. Web Streams and native codecs can buffer internally, so filters do not promise a fixed memory ceiling or one output chunk per input chunk.

The shared codec primitives live inside Foundation. Foundation imports no FX family; CompressionFX builds on Foundation. Pasteboards, documents, file panels, sharing and FX encoded-data APIs follow the same input/output contract; see [Foundation](../foundation.md).

Filters require unlocked source and destination streams. Constructors reject an already-locked stream before starting a pipeline. Cancellation awaits upstream cleanup even when a codec has already failed.
