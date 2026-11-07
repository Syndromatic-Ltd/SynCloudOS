# A Foundation layer, and NSEData

2026-11-07. Status: **proposal**. The owner wants a Foundation decision before Beta 2, so it does not force another breaking rewrite like Beta 1 → Beta 2.

## What exists today

SynCloudOS already has Foundation types. They are scattered and mostly private:

- **`src/SynCloudOS/Models`** holds Swift-style unprefixed Foundation analogues: `ByteCountFormatter`, `DateFormatter`, `NumberFormatter`, `Formatter`, `IndexSet`, `IndexPath`, `CountedSet`, `Predicate`, `SortDescriptor`, `ValueTransformer`, `DecimalValue`, `UnicodeCharacterSet`, `TreeNode`. Only the `Formatter` types are public (re-exported from `src/NSE/public/controls.ts`). The rest is internal.
- **`NSEUserDefaults`** (Foundation in Apple) and **`NSEUndoManager`** (Foundation) are public, with the `NSE` prefix, inside NSE.
- **Bytes are raw web types.** Across NSE and SynCloudOS there are about 194 uses of `Uint8Array`, 36 of `Blob` and 33 of `ArrayBuffer`, in 53 non-test files. Nothing like `Data`/`NSData` exists, so nothing can carry `compressed(using:)`, base64 or ranges.

So there are two naming conventions (unprefixed in Models, `NSE` in NSE), no public home, and no data type.

## Decisions proposed

### 1. Foundation shares the `NSE` prefix

In Apple's world, Foundation and AppKit are separate frameworks that share one prefix (`NSData`, `NSUserDefaults`, `NSWindow`). Unprefixed Swift-overlay names don't work in JavaScript, because the important ones collide with globals: `Date`, `URL`, `Notification`, `Error`, `Set`, `Data`-like names in apps. So Foundation types are `NSEData`, `NSEIndexSet`, `NSESortDescriptor`, `NSEPredicate`, `NSEDateFormatter`, ... The Models types are renamed accordingly, and `NSEUserDefaults` already fits.

### 2. Its own entry point

`@syndromatic/syncloudos/foundation` is a separate module, as Foundation is from AppKit:

- It has no React and no DOM views, so it runs in workers and tests.
- NSE and FX import from it. It imports neither.
- `NSEUserDefaults` and `NSEUndoManager` move there. NSE keeps no re-export, under the no-aliases rule.

### 3. Wrap only where Cocoa adds behaviour; bridge where the web type is the same thing

This is how Swift treats `URL`, `Date` and `Data`: bridged value types.

| Foundation | SynCloudOS | Why |
|---|---|---|
| `URL`, `Date`, `Error`, `UUID`, `JSONSerialization` | the web's `URL`, `Date`, `Error`, `crypto.randomUUID`, `JSON` | same semantics already; a wrapper would be ceremony |
| `NSData` / `Data` | **`NSEData`** (new) | adds immutability, ranges, base64, compression, reading from a Blob |
| `NSIndexSet`, `NSSortDescriptor`, `NSPredicate`, formatters, `NSValueTransformer`, `NSCountedSet`, `NSIndexPath` | `NSE…` from Models, made public | Cocoa semantics the web lacks; they already exist |
| `NSUserDefaults`, `NSUndoManager` | already `NSE…`; move to the foundation entry | — |
| `NSNotificationCenter` | check whether one exists before deciding | — |

### 4. NSEData

An immutable byte buffer, the `NSData`/`Data` analogue.

```ts
const data = NSEData.from(bytes);                    // Uint8Array | ArrayBuffer | NSEData; copies, then freezes
const fromFile = await NSEData.read(blob);            // Blob/File, async
data.count;                                           // length in bytes
data.bytes;                                           // read-only Uint8Array view
data.subdata({ location: 4, length: 16 });            // NSRange, like the rest of NSE
data.base64EncodedString();
NSEData.fromBase64(text);
await data.compressed(using: "zlib");                 // async; runs on CPFX
await data.decompressed(using: "zlib");
data.isEqual(other);
data.blob(type);                                      // for downloads and uploads
```

- **Compression algorithms** are an enum, as `NSData.CompressionAlgorithm` is: `zlib` (deflate), `gzip`, and `brotli`/`zstd` where the browser supports them. They are reported through a CPFX capability query, not assumed. Apple's `lzfse`/`lz4`/`lzma` are left out until a WebAssembly codec exists.
- **The method is async.** It differs from Apple's synchronous `compressed(using:)` because the browser's compression streams are async. The name matches; the `Promise` is the only change.

### 5. Where bytes appear in the public API

**Accept** `NSEData | Uint8Array | ArrayBuffer` (one exported type, `NSEDataConvertible`), so plain web code keeps working. **Return** `NSEData` from public APIs that hand bytes back:

- the pasteboard;
- document read and write, and file wrappers;
- file panels;
- the share client;
- FX file and container readers.

This is the breaking part, which is why it belongs in Beta 2: an audit of the 53 files, then the public signatures change once.

### 6. CPFX underneath

CompressionFX (`CPFX`) is the streaming framework: compression and decompression streams for large files and the network, plus the one-shot functions `NSEData` calls. It mirrors Apple's Compression framework next to `NSData.compressed(using:)`.

## What must land before Beta 2, and what can wait

Additive APIs never break apps, so new capability frameworks can ship after Beta 2. What has to be decided and landed **before** Beta 2 is anything that renames, moves or removes public API:

| Breaking, decide before Beta 2 | Additive, can follow Beta 2 |
|---|---|
| Foundation entry point, `NSE` names for the Models types, the moves of `NSEUserDefaults` and `NSEUndoManager` | CPFX streams, more `NSEData` methods |
| `NSEData` returned from pasteboard, document, panel and share APIs | BTFX, NFX, SPFX, CNFX, PKFX, XRFX, CRFX, NWFX |
| PolicyKit split: manifest `permissions` becomes `Info.ts` entitlements; per-framework `authorizationStatus` | VideoFX PiP and routes; `NSERoutePickerView` |
| Page header: `NSEPageHeader` leaves the public API | passkeys (new, opt-in) |
| `Info.ts` declaration keys for document types, URL types, shortcuts and the share target (names only; behaviour can follow) | service worker, install, push, background tasks |

## Open questions

1. `NSE` prefix for Foundation types and a separate `foundation` entry: agree?
2. Return `NSEData` from public byte APIs in Beta 2 (breaking now, stable later), or accept it but keep returning `Uint8Array` (non-breaking, less Cocoa)? **Recommendation: return `NSEData`.**
3. Is the Beta 2 cut line in the table above right?
