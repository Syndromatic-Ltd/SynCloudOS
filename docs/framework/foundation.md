# Foundation

Foundation supplies the value types and object services that NSE, FX and SynCloudOS build on: byte data, ranges and index sets, formatters, decimal arithmetic, predicates, preferences and an undo engine. You can import it without a mounted session. It has no React, NSE, FX or runtime imports, so it also works in web workers.

```ts
import { NSEData, NSEIndexSet, NSEUserDefaults } from "@syndromatic/syncloudos/foundation";
```

For URLs, dates, errors, identifiers and JSON, use the native `URL`, `Date`, `Error`, `crypto.randomUUID()` and `JSON`. Foundation only adds types where the platform has nothing suitable. If you know Apple's Foundation, the class names will be familiar.

## Exports

| Export | Purpose |
| --- | --- |
| `NSEData`, `NSEDataConvertible`, `NSEDataCompressionAlgorithm` | Immutable bytes, ranges, base64, Blob bridges and compression |
| `NSERange`, `normaliseNSERange`, `NSEEqualRanges`, `NSEIntersectionRange` | Validated location/length ranges |
| `NSEIndexPath`, `compareNSEIndexPaths` | Ordered index paths |
| `NSEIndexSet` | Immutable sets of indexes, stored as ranges |
| `NSECountedSet` | Sets that count how many times each object was added |
| `NSEFormatter`, `NSEFormatterContext`, `NSEFormatterError`, `NSEFormatterResult` | Converting between objects and strings, and validating partial input |
| `NSENumberFormatter`, `NSENumberFormatterOptions` | Locale-aware number display and parsing |
| `NSEByteCountFormatter` and its option and unit types | Decimal or binary byte quantities |
| `NSEDateFormatter`, `NSEDateFormatterOptions`, `NSEDateFormatterStyle` | Intl date and time styles, patterns, and conversion between `Date` and text |
| `NSEDecimalNumber`, `NSEDecimalNumberHandler`, `NSEDecimalNumberBehaviors`, `NSEDecimalRoundingMode` | Bounded decimal arithmetic and rounding policies |
| `NSEPredicate` and its expression and schema types | Block predicates and bounded declarative predicates |
| `NSESortDescriptor` and its option and comparator types | Stable comparison with reversible ordering |
| `NSECharacterSet`, `NSEUnicodePropertyName` | Unicode scalar membership and set operations |
| `NSEUserDefaults`, `NSEUserDefaultsStore` | Keyed preferences over a store you supply |
| `NSEValueTransformer` and the three built-in transformer names | Named, registered value transformations, forward and reverse |
| `NSEUndoManager`, `NSEUndoRegistrationCapability` | Target-based undo registration, nested groups, action names and undo levels |

The remaining exports are TypeScript option, schema and result types for these classes. `NSETreeNode` is a view-layer class, so it comes from `@syndromatic/syncloudos/nse`. Formatters and `NSEUserDefaults` come only from `foundation`.

## Immutable data

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";

const data = NSEData.from(new Uint8Array([0, 1, 2, 3]));
const slice = data.subdata({ location: 1, length: 2 });
const same = NSEData.fromBase64(slice.base64EncodedString()).isEqual(slice);
const upload = data.blob("application/octet-stream");
const downloaded = await NSEData.read(upload);
const compressed = await downloaded.compressed("zlib");
const restored = await compressed.decompressed("zlib");
```

`from` copies `Uint8Array`, `ArrayBuffer` and `NSEData` inputs, including typed-array subviews. `count` is the length in bytes. `bytes` returns a fresh copy typed as read-only, so changing that copy, a subview of it or its buffer never changes the value. Instances are frozen. `subdata` rejects invalid or out-of-bounds ranges. Base64 uses canonical RFC 4648 encoding with padding, and `fromBase64` rejects malformed or non-canonical input.

`NSEDataConvertible` is the union of inputs that APIs accept. Reading from a Blob is explicit and asynchronous. The one-shot methods build the whole result in memory; for streaming, use [CompressionFX](fx/compression.md) filters.

## Compression

`compressed` and `decompressed` take `lzfse`, `lz4`, `lzma` or `zlib`. `zlib` means raw DEFLATE (RFC 1951) with no zlib header, which browsers implement as `deflate-raw`. The other three are accepted but reject when the browser has no codec for them; Foundation never quietly substitutes another one. CompressionFX has its own `CPFXAlgorithm`, which adds `brotli` and `lzbitmap`.

Both use one codec helper inside Foundation, built on `CompressionStream` and `DecompressionStream`, which is why the methods are asynchronous. CompressionFX builds on that helper; Foundation never imports FX.

## Collections and predicates

```ts
import { NSEIndexSet, NSEPredicate } from "@syndromatic/syncloudos/foundation";

const indexes = NSEIndexSet.fromIndexes([1, 2, 4]);
const even = NSEPredicate.withBlock<number>(value => value % 2 === 0);
const selected = [...indexes].filter(value => even.evaluate(value));
```

Index sets normalise and merge adjacent ranges. Character sets work on Unicode scalars, not UTF-16 code units. Predicates also accept a restricted, schema-checked expression tree; there's no parser for free-form predicate format strings.

`NSEIndexPath.indexAtPosition(position)` takes a nonnegative safe integer. For anything else, or a position past the end, it returns `undefined`; it never rounds a negative, fractional or non-finite position to a valid one. `indexPathByRemovingLastIndex()` always returns a new `NSEIndexPath`, empty if the path had zero or one index, and leaves the original unchanged.

## Formatters

```ts
import { NSENumberFormatter } from "@syndromatic/syncloudos/foundation";

const formatter = new NSENumberFormatter({ maximumFractionDigits: 2 });
const context = { locale: "en-GB" };
const display = formatter.string(1234.5, context);
const parsed = formatter.getObjectValue(display, context);
if (parsed.ok) console.log(parsed.value);
```

To write your own formatter, subclass `NSEFormatter<T>` and implement `string`, `editingString`, `getObjectValue` and `isPartialStringValid`. You pass locale and time zone explicitly in the context, and parsing returns a result object (`{ ok: true, value }` or a failure) instead of throwing.

### Dates

`NSEDateFormatter` converts native `Date` values with `string(date)` and `date(text)`; `date` returns `null` for text it can't parse. `dateStyle` and `timeStyle` can be changed after construction and take `none`, `short`, `medium`, `long` or `full`. `locale`, `timeZone` and `calendar` configure Intl. An explicit `dateFormat` overrides the styles. It supports the Unicode pattern tokens `yyyy`, `MM`, `dd`, `HH`, `mm` and `ss`, quoted literals and doubled apostrophes. Any other token throws, so it can't be mistaken for literal text.

```ts
import { NSEDateFormatter } from "@syndromatic/syncloudos/foundation";

const dates = new NSEDateFormatter({ locale: "en-GB", timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" });
const text = dates.string(new Date("2026-11-07T12:30:00Z"));
const date = dates.date(text);
```

Style formatting works with any calendar Intl supports. Parsing and explicit patterns support only the Gregorian calendar and positive-era years for now, and reject anything else. Parsing a style reads the Intl parts and then checks the result by formatting it again, so month and weekday names, digits, day periods and time-zone labels all have to match.

When parsing, missing date fields default to 1 January 2001, missing time fields to midnight, and two-digit years in styles to 2000 to 2099. Impossible dates and times that fall in a daylight-saving gap return `null`. A wall time that occurs twice resolves the same way every time, and nothing falls back to `Date.parse`. A style without seconds can't give you back the seconds, and milliseconds are never formatted.

### Decimal numbers

`NSEDecimalNumber.fromString` creates an immutable decimal value. `adding`, `subtracting`, `multiplying`, `dividing`, `rounding`, `compare` and `toString` do their arithmetic on a bigint coefficient and a decimal exponent, never in binary floating point. Values hold up to 38 significant digits with an exponent from -128 to 127, and operations round to fit. `zero`, `one` and `notANumber` are shared values.

```ts
import { NSEDecimalNumber, NSEDecimalNumberHandler } from "@syndromatic/syncloudos/foundation";

const cents = new NSEDecimalNumberHandler({ scale: 2, roundingMode: "bankers" });
const amount = NSEDecimalNumber.fromString("0.1").adding(NSEDecimalNumber.fromString("0.2"));
const eighth = NSEDecimalNumber.one.dividing(NSEDecimalNumber.fromString("8"), cents); // 0.12
```

The rounding modes are `plain` (nearest, ties away from zero), `bankers` (nearest, ties to even), `down` (towards negative infinity) and `up` (towards positive infinity). A handler's optional `scale` is a number of decimal places; leave it out to keep full precision. `raiseOnExactness`, `raiseOnOverflow`, `raiseOnUnderflow` and `raiseOnDivideByZero` decide which conditions throw. By default inexact results are allowed and the other three throw. When an error is suppressed, an unrepresentable result becomes `notANumber` and an inexact one is returned rounded.

You can replace `NSEDecimalNumber.defaultBehavior`. A custom `NSEDecimalNumberBehaviors` can also implement `exceptionDuringOperation` to return a replacement value for an error that would otherwise throw. `toString` gives decimal text, so you can serialise a value without passing it through a binary number.

### Undo

`NSEUndoManager` is the Foundation undo engine and is safe to use in a worker. `registerUndo(target, handler)` records a synchronous operation that reverses a change. While an undo or redo runs, handlers register the opposite operation on the same manager. `beginUndoGrouping` and `endUndoGrouping` nest, and closing the outermost group creates one history entry. `setActionName` names that entry, and `undoActionName` and `redoActionName` give the names of the next entries to undo and redo.

`canUndo`, `canRedo`, `isUndoing`, `isRedoing` and `groupingLevel` describe the current state. `levelsOfUndo` limits how many groups are kept; `0`, the default, means no limit. `removeAllActions` and `removeAllActionsWithTarget` clear registrations.

```ts
import { NSEUndoManager } from "@syndromatic/syncloudos/foundation";

const undo = new NSEUndoManager();
const model = { title: "Before" };
function setTitle(target: typeof model, title: string) {
  const previous = target.title;
  undo.registerUndo(target, object => setTitle(object, previous));
  target.title = title;
}
setTitle(model, "After");
undo.setActionName("Change title");
undo.undo();
undo.redo();
```

A Foundation manager is entirely synchronous: it doesn't group by browser event loop turn or replay promises. The undo histories of a mounted application (see [Commands, responders and undo](commands-responders-undo.md#undo)) use the same engine for registration, groups and replay, and add responder routing, reservations, asynchronous compensation and teardown when the application unmounts. NSE controls register undo through the narrow `NSEUndoRegistrationCapability` interface. If you hold a mounted document history, keep using it; a plain `NSEUndoManager` can't stand in for one.

## Value transformers

Subclass `NSEValueTransformer<Source, Target>` and implement `transformedValue(value)`. The static methods `setValueTransformer(transformer, name)`, `valueTransformerForName(name)` and `valueTransformerNames()` share one registry per JavaScript realm. Registering a name again replaces the earlier transformer, and registering `null` removes it.

To allow reverse conversion, override the static `allowsReverseTransformation()` to return `true`. You can then implement `reverseTransformedValue` with a different inverse; if you don't, it applies the forward transformation.

`NSENegateBooleanTransformerName`, `NSEIsNilTransformerName` and `NSEIsNotNilTransformerName` name the built-in transformers for negating a boolean and testing for a missing value. Both `null` and `undefined` count as missing. There are no archiving transformers. Object controller bindings use this same class.

## Preferences

```ts
import { NSEUserDefaults } from "@syndromatic/syncloudos/foundation";

const defaults = new NSEUserDefaults(); // Volatile, in memory.
defaults.set("indigo", "accentColour");
const colour = defaults.object("accentColour");
defaults.removeObject("accentColour");
```

For settings that persist, pass the mounted application's preferences store to the constructor. Foundation owns no browser storage and no runtime singletons. `NSEUserDefaultsController`, from `nse`, adds validation, migration and bindings on top of a defaults object; see [Controllers](controllers.md).

## Scope

Foundation owns the value types and the undo engine. The system layer owns everything tied to a mounted application, such as authority, services and the mounted undo histories built on the engine.

## Public byte contracts

Every public API that takes bytes accepts `NSEDataConvertible`, and every one that returns bytes gives you `NSEData`, still inside its `Promise`, nullable, array or stream wrapper. That covers pasteboards, document assets and resources, PDF output, file-reference reads, prepared share files, encoded audio, image, video and container data, MIDI messages, font files and PDF readers. There are no overloads that return raw buffers.

Native `File` results keep their file identity and metadata. Export and share records carry the MIME type and file name as separate fields. Browser hosts create native Blobs, Files and codec buffers only where they hand data to the platform. Numeric data stays in typed arrays because it isn't an encoded byte payload: pixel and index planes, PCM and FFT samples, and destinations you copy into. `NSEData.read`, `.bytes` and `.blob` are the deliberate bridges to web types. Buffers from another realm, such as an iframe, are accepted.

Imported fonts are stored and delivered as `NSEData`, and font registration accepts any convertible data.
