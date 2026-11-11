# CompressionFX

CompressionFX mirrors Apple's Compression framework. Import its five public types from `@syndromatic/syncloudos/fx/compression`: `CPFXAlgorithm`, `CPFXFilterOperation`, `CPFXFilterError`, `CPFXInputFilter` and `CPFXOutputFilter`. Each type has its own file. The entry only re-exports them. Filters are direct value-processing objects, available in workers without a mounted application or authorisation.

## One-shot data

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";

const original = NSEData.from(new TextEncoder().encode("Hello, Foundation"));
const compressed = await original.compressed("zlib");
const restored = await compressed.decompressed("zlib");
console.assert(original.isEqual(restored));
```

One-shot compression belongs to Foundation's `NSEData`. Its algorithm cases are `lzfse`, `lz4`, `lzma` and `zlib`, matching `NSData.CompressionAlgorithm`. Compression's separate `CPFXAlgorithm` also includes `brotli` and `lzbitmap`, as Apple's current documentation specifies. Unsupported algorithms stay in the enum and fail with `CPFXFilterError.invalidState` when a filter is constructed. Brotli depends on host codec availability. No algorithm is substituted or downloaded.

Apple's `zlib` means raw DEFLATE (RFC 1951), with no RFC 1950 header or checksum. The internal browser codec is `deflate-raw`. This applies to Foundation data and both filter classes.

## InputFilter

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

The read closure receives the requested input buffer capacity and returns `NSEData` or null at end of input. It may return a Promise. Omitting the capacity selects Apple's default of 65,536 bytes: `new CPFXInputFilter(operation, algorithm, readingFrom)`. `readData(ofLength)` is asynchronous because browser codecs are asynchronous. It returns up to the requested number of bytes, then null at end of processed data. Only one read may be pending. Invalid capacities and overlapping reads fail with `CPFXFilterError.invalidState`; invalid encoded input fails with `CPFXFilterError.invalidData`. Errors thrown by the caller's closure propagate unchanged. There is no public stream or invented cancellation method.

## OutputFilter

```ts
import { CPFXOutputFilter } from "@syndromatic/syncloudos/fx/compression";

const chunks: NSEData[] = [];
const output = new CPFXOutputFilter("compress", "zlib", 65536, data => {
  if (data !== null) chunks.push(data);
});
await output.write(original);
await output.write(null); // Apple's end-of-input convention; also flushes output.
```

The write closure receives `NSEData` chunks no larger than `bufferCapacity`, followed by null at end of output. It may be asynchronous. Omitting capacity selects 65,536 bytes. `write(data)` and `finalize()` return Promises because native browser codec backpressure and closure completion are asynchronous. Await every write. `write(null)` or writing empty data calls `finalize()`, which flushes pending encoded data and waits for the last callback. Finalisation is idempotent; repeated calls await the same completion. A non-empty write after finalisation fails with `CPFXFilterError.invalidData`. Codec data failures use `invalidData`; caller closure errors propagate unchanged. Web streams are internal and no fixed codec memory ceiling is promised.

## Apple references

- [Algorithm](https://developer.apple.com/documentation/compression/algorithm)
- [FilterOperation](https://developer.apple.com/documentation/compression/filteroperation)
- [FilterError](https://developer.apple.com/documentation/compression/filtererror)
- [InputFilter](https://developer.apple.com/documentation/compression/inputfilter)
- [OutputFilter](https://developer.apple.com/documentation/compression/outputfilter)
- [COMPRESSION_ZLIB](https://developer.apple.com/documentation/compression/compression_zlib)
- [NSData.CompressionAlgorithm](https://developer.apple.com/documentation/foundation/nsdata/compressionalgorithm)

The [Apple Swift Compression overlay](https://github.com/apple/swift/blob/swift-5.1-branch/stdlib/public/Darwin/Compression/Compression.swift) also specifies empty-data EOF, idempotent finalisation and the post-finalisation `invalidData` error.
