# CompressionFX

CompressionFX compresses and decompresses data as a stream, pulling input from a closure or pushing output to one, so you never need the whole payload in memory. For a single buffer, use `NSEData.compressed` and `decompressed` from Foundation instead.

Import the five public types from `@syndromatic/syncloudos/fx/compression`: `CPFXAlgorithm`, `CPFXFilterOperation`, `CPFXFilterError`, `CPFXInputFilter` and `CPFXOutputFilter`. Filters are plain value-processing objects. They work in workers, and need neither a mounted application nor authorisation.

## Algorithms

`CPFXAlgorithm` lists `lzfse`, `lz4`, `lzma`, `zlib`, `brotli` and `lzbitmap`. The codecs come from the host's `CompressionStream` and `DecompressionStream`, so in practice:

- `zlib` works everywhere those streams exist. It means raw DEFLATE (RFC 1951), with no RFC 1950 header or checksum; internally it uses the `deflate-raw` format. The same applies to `NSEData` and both filters.
- `brotli` works only where the host provides a Brotli codec.
- `lzfse`, `lz4`, `lzma` and `lzbitmap` are listed for completeness but have no codec. Constructing a filter with them throws `CPFXFilterError` with code `invalidState`.

No algorithm is ever swapped for another or downloaded.

## One-shot data

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";

const original = NSEData.from(new TextEncoder().encode("Hello, Foundation"));
const compressed = await original.compressed("zlib");
const restored = await compressed.decompressed("zlib");
console.assert(original.isEqual(restored));
```

`NSEData.compressed(algorithm)` and `decompressed(algorithm)` accept `lzfse`, `lz4`, `lzma` and `zlib`. Only `zlib` has a codec; the others reject with a `TypeError` saying the algorithm is unsupported in this environment.

## Reading through an input filter

```ts
import { CPFXInputFilter } from "@syndromatic/syncloudos/fx/compression";

let offset = 0;
const input = new CPFXInputFilter("decompress", "zlib", 65536, count => {
  if (offset === compressed.count) return null;
  const length = Math.min(count, compressed.count - offset);
  const chunk = compressed.subdata({ location: offset, length });
  offset += length;
  return chunk;
});
for (;;) {
  const data = await input.readData(65536);
  if (data === null) break;
  console.log(data.count);
}
```

The read closure receives the buffer capacity and returns `NSEData`, or `null` at the end of input. It may return a promise. Leave out the capacity, as in `new CPFXInputFilter(operation, algorithm, readingFrom)`, to use the default of 65,536 bytes.

`readData(ofLength)` is asynchronous because browser codecs are. It returns up to the requested number of bytes, then `null` once all processed data has been read. Only one read may be pending at a time.

| Failure | Result |
|---|---|
| Invalid capacity, or a second read while one is pending | `CPFXFilterError`, code `invalidState` |
| Input the codec cannot decode | `CPFXFilterError`, code `invalidData` |
| An error thrown by your closure | Propagates unchanged |

There is no public stream and no cancellation method.

## Writing through an output filter

```ts
import { CPFXOutputFilter } from "@syndromatic/syncloudos/fx/compression";

const chunks: NSEData[] = [];
const output = new CPFXOutputFilter("compress", "zlib", 65536, data => {
  if (data !== null) chunks.push(data);
});
await output.write(original);
await output.write(null); // Marks the end of input and flushes.
```

The write closure receives `NSEData` chunks no larger than the buffer capacity, then `null` at the end of output. It may be asynchronous. Without a capacity argument, chunks are up to 65,536 bytes.

`write(data)` and `finalize()` return promises, because codec backpressure and your closure can both be asynchronous; await every write. Writing `null` or empty data calls `finalize()`, which flushes pending output and waits for the last callback. You can call `finalize()` more than once; later calls wait on the same completion. Writing non-empty data after finalising throws `CPFXFilterError` with code `invalidData`, as does passing something that is not `NSEData`. Codec failures also use `invalidData`, and errors from your closure propagate unchanged.

Web streams are used internally and are not exposed. CompressionFX makes no promise about a fixed memory ceiling for the codec.

`CPFXFilterError` exposes its two codes as the static strings `CPFXFilterError.invalidState` and `CPFXFilterError.invalidData`, so you can compare `error.code === CPFXFilterError.invalidData`.
