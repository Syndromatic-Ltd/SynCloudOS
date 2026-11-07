# Foundation

Foundation supplies the shared values and object services beneath NSE, FX and SynCloudOS. It is the counterpart of Apple Foundation: Foundation and AppKit share `NS`, and Foundation and NSE share `NSE`. Import it directly, without a mounted session. It has no React, NSE, FX or runtime imports and works in web workers.

```ts
import { NSEData, NSEIndexSet, NSEUserDefaults } from "@syndromatic/syncloudos/foundation";
```

Use native `URL`, `Date`, `Error`, `crypto.randomUUID()` and `JSON` for the web equivalents of Cocoa’s bridged values. Foundation adds behaviour where those native values do not provide it.

## Exports

| Export | Apple counterpart | Purpose |
| --- | --- | --- |
| `NSEData`, `NSEDataConvertible`, `NSEDataCompressionAlgorithm` | NSData / Data | Immutable bytes, ranges, base64, Blob bridges and compression |
| `NSERange`, `normaliseNSERange`, `NSEEqualRanges`, `NSEIntersectionRange` | NSRange | Validated location/length ranges |
| `NSEIndexPath`, `compareNSEIndexPaths` | NSIndexPath | Ordered index paths |
| `NSEIndexSet` | NSIndexSet | Immutable sets represented by index ranges |
| `NSECountedSet` | NSCountedSet | Object multiplicities |
| `NSEFormatter`, `NSEFormatterContext`, `NSEFormatterError`, `NSEFormatterResult` | NSFormatter | Object/string conversion and partial-input validation |
| `NSENumberFormatter`, `NSENumberFormatterOptions` | NSNumberFormatter | Locale-aware number display and parsing |
| `NSEByteCountFormatter` and its option/unit types | NSByteCountFormatter | Decimal or binary byte quantities |
| `NSEPredicate` and its expression/schema types | NSPredicate | Block evaluation and bounded declarative predicates |
| `NSESortDescriptor` and its option/comparator types | NSSortDescriptor | Stable comparison with reversible ordering |
| `NSECharacterSet`, `NSEUnicodePropertyName` | NSCharacterSet | Unicode scalar membership and set operations |
| `NSEUserDefaults`, `NSEUserDefaultsStore` | NSUserDefaults | Keyed preferences through an injected store |

Supporting TypeScript option, schema and result types describe the web API; they are not additional Apple classes. `NSETreeNode` belongs to AppKit and is exported by `nse`. Formatters and `NSEUserDefaults` are exported only from `foundation`.

## Immutable data

```ts
import { NSEData, type NSEDataConvertible } from "@syndromatic/syncloudos/foundation";

const data = NSEData.from(new Uint8Array([0, 1, 2, 3]));
const slice = data.subdata({ location: 1, length: 2 });
const same = NSEData.fromBase64(slice.base64EncodedString()).isEqual(slice);
const upload = data.blob("application/octet-stream");
const downloaded = await NSEData.read(upload);
const compressed = await downloaded.compressed("gzip");
const restored = await compressed.decompressed("gzip");
```

`from` copies `Uint8Array`, `ArrayBuffer` and `NSEData` inputs, including typed-array subviews. `count` measures bytes. `bytes` returns a defensive copy with a read-only TypeScript view: mutating that copy, a subview or its buffer cannot change the value. Instances are frozen; typed arrays are never advertised as frozen storage. `subdata` rejects invalid or out-of-bounds ranges. Base64 uses canonical RFC 4648 encoding, including padding, and rejects malformed or non-canonical input.

`NSEDataConvertible` is the accepted input union. The Blob bridge is explicit and asynchronous for reads. One-shot methods allocate complete results; use [CompressionFX](fx/compression.md) filters for streaming work.

## Compression

The algorithm values are `zlib`, `gzip`, `brotli` and `zstd`. `zlib` maps to the web’s `deflate` format. Available codecs depend on the host: query `CPFXCapabilities.query()` from `fx/compression` before presenting choices. Unsupported algorithms reject with an explanatory error.

A single codec factory and collector live inside Foundation and use `CompressionStream` / `DecompressionStream`. CPFX builds on those helpers. Foundation never imports FX; the dependency follows the same direction as the other FX value frameworks. Methods are asynchronous because web compression streams are asynchronous.

## Collections and predicates

```ts
import { NSEIndexSet, NSEPredicate } from "@syndromatic/syncloudos/foundation";

const indexes = NSEIndexSet.fromIndexes([1, 2, 4]);
const even = NSEPredicate.withBlock<number>(value => value % 2 === 0);
const selected = [...indexes].filter(value => even.evaluate(value));
```

Index sets normalise and coalesce adjacent ranges. Character sets operate on Unicode scalars rather than UTF-16 code units. Predicates also accept a restricted schema-backed expression tree; this is not an interpreter for arbitrary Cocoa predicate-format strings.

`NSEIndexPath.indexAtPosition(position)` accepts nonnegative safe-integer positions. Invalid or out-of-range positions return `undefined`, the web API sentinel; negative, fractional and non-finite positions are never coerced into valid indexes. `indexPathByRemovingLastIndex()` always returns an `NSEIndexPath`: paths with zero or one index produce an empty path. The original path remains unchanged.

## Formatters

```ts
import { NSENumberFormatter } from "@syndromatic/syncloudos/foundation";

const formatter = new NSENumberFormatter({ maximumFractionDigits: 2 });
const context = { locale: "en-GB" };
const display = formatter.string(1234.5, context);
const parsed = formatter.getObjectValue(display, context);
if (parsed.ok) console.log(parsed.value);
```

Subclass `NSEFormatter<T>` to provide `string`, `editingString`, `getObjectValue` and `isPartialStringValid`. The methods follow NSFormatter’s conversion and editing responsibilities. Locale and time-zone context is explicit; parse results represent Cocoa’s output/error parameters as a discriminated result.

## Preferences

```ts
import { NSEUserDefaults } from "@syndromatic/syncloudos/foundation";

const defaults = new NSEUserDefaults(); // Volatile in-memory domain.
defaults.set("indigo", "accentColour");
const colour = defaults.object("accentColour");
defaults.removeObject("accentColour");
```

For persistent application settings, inject the mounted application’s preferences store into the constructor. Foundation owns no browser storage or runtime singleton. `NSEUserDefaultsController` remains in NSE and provides AppKit validation, migration and bindings around the injected defaults.

## Scope

Public pasteboard, document, panel, share and FX reader byte APIs migrate separately. Existing raw-byte signatures are not changed by this layer’s introduction. Undo remains runtime-owned while a dependency-free manager contract and the mounted lease boundary are designed together; this entry does not export an undo-manager alias.
