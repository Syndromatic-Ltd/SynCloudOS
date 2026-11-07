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
| `NSEDateFormatter`, `NSEDateFormatterOptions`, `NSEDateFormatterStyle` | NSDateFormatter | Intl date/time styles, patterns and Date/string conversion |
| `NSEDecimalNumber`, `NSEDecimalNumberHandler`, `NSEDecimalNumberBehaviors`, `NSEDecimalRoundingMode` | NSDecimalNumber / NSDecimalNumberHandler / NSDecimalNumberBehaviors | Bounded decimal arithmetic and rounding policies |
| `NSEPredicate` and its expression/schema types | NSPredicate | Block evaluation and bounded declarative predicates |
| `NSESortDescriptor` and its option/comparator types | NSSortDescriptor | Stable comparison with reversible ordering |
| `NSECharacterSet`, `NSEUnicodePropertyName` | NSCharacterSet | Unicode scalar membership and set operations |
| `NSEUserDefaults`, `NSEUserDefaultsStore` | NSUserDefaults | Keyed preferences through an injected store |
| `NSEValueTransformer` and the three built-in transformer names | NSValueTransformer | Named subclass registration, forward and reverse value transformations |
| `NSEUndoManager` | NSUndoManager | Target-based inverse registration, nested groups, action names and undo levels |

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

### Dates

`NSEDateFormatter` converts native `Date` values with `string(date)` and `date(text)`, returning `null` for invalid date text. Mutable `dateStyle` and `timeStyle` use `none`, `short`, `medium`, `long` and `full`. `locale`, `timeZone` and `calendar` configure Intl. An explicit `dateFormat` takes precedence over styles; supported Unicode pattern tokens are `yyyy`, `MM`, `dd`, `HH`, `mm` and `ss`, with quoted literals and doubled apostrophes. Unsupported tokens throw instead of being interpreted as literals.

```ts
const dates = new NSEDateFormatter({ locale: "en-GB", timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" });
const text = dates.string(new Date("2026-11-07T12:30:00Z"));
const date = dates.date(text);
```

Intl formats any supported calendar in style mode. Parsing and explicit patterns currently support the Gregorian calendar and positive-era years; other calendars/eras reject explicitly. Localized style parsing uses Intl parts and verifies the formatted result, including month/weekday names, digits, day periods and time-zone labels. Missing date fields default to 1 January 2001, missing time fields to midnight, and two-digit style years to 2000–2099. Impossible dates and daylight-saving gaps return `null`. Ambiguous repeated wall times use the formatter's deterministic zone resolution; there is no locale-independent `Date.parse` fallback. Style output without seconds cannot recover seconds; formatting does not preserve milliseconds. These limits describe this API's supported conversion surface, rather than the full ICU pattern language.

### Decimal numbers

`NSEDecimalNumber.fromString` constructs immutable decimal values. `adding`, `subtracting`, `multiplying`, `dividing`, `rounding`, `compare` and `toString` keep arithmetic in bigint coefficient/exponent form. Representation is bounded to 38 significant digits and a decimal exponent from −128 through 127; operations round to that representation, rather than using binary floating-point or arbitrary precision. `zero`, `one` and `notANumber` are shared values.

```ts
const cents = new NSEDecimalNumberHandler({ scale: 2, roundingMode: "bankers" });
const amount = NSEDecimalNumber.fromString("0.1").adding(NSEDecimalNumber.fromString("0.2"));
const eighth = NSEDecimalNumber.one.dividing(NSEDecimalNumber.fromString("8"), cents); // 0.12
```

Rounding modes are `plain` (nearest, ties away from zero), `bankers` (nearest, ties to even), `down` (toward negative infinity) and `up` (toward positive infinity). A handler's optional `scale` is decimal places, with an omitted scale retaining the bounded precision. `raiseOnExactness`, `raiseOnOverflow`, `raiseOnUnderflow` and `raiseOnDivideByZero` control arithmetic errors. Defaults tolerate inexactness and raise the other three errors. A suppressed unrepresentable result becomes `notANumber`; suppressed inexactness returns the rounded result. `defaultBehavior` is replaceable. Custom `NSEDecimalNumberBehaviors.exceptionDuringOperation` can supply a replacement for a raised arithmetic error. Serialization returns decimal text, preserving the value without a binary-number bridge.

### Undo

`NSEUndoManager` is the worker-safe Foundation object. `registerUndo(target, handler)` records a synchronous inverse operation. While undoing or redoing, handlers register the opposite operation on the same manager. `beginUndoGrouping` / `endUndoGrouping` nest; closing the outer group creates one history entry. `setActionName` names that entry; `undoActionName` and `redoActionName` expose the frontier names. `canUndo`, `canRedo`, `isUndoing`, `isRedoing` and `groupingLevel` describe current state. `levelsOfUndo = 0` means unlimited; a positive value bounds retained groups. `removeAllActions` and `removeAllActionsWithTarget` retire registrations.

```ts
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

The explicit synchronous Foundation contract does not add browser event-loop grouping or promise replay. The runtime adapter uses the same Foundation history engine for registration, groups and replay frontiers, while retaining runtime identity, responder routing, registration partitions, reservations, asynchronous compensation and revocable mounted leases. NSE controls and mounted app histories derive their narrow registration contract from Foundation's `NSEUndoRegistrationCapability`; this TypeScript support interface is not another Cocoa class. Apps holding a mounted document history continue to use that lease, with its existing authority and teardown behaviour. A raw Foundation manager never replaces a mounted history lease.

## Value transformers

Subclass `NSEValueTransformer<Source, Target>` and implement `transformedValue(value)`. Class methods `setValueTransformer(transformer, name)`, `valueTransformerForName(name)` and `valueTransformerNames()` share a named registry in the current JavaScript realm. Registering replaces the previous instance; registering `null` removes the name. A subclass opts into reverse conversion with static `allowsReverseTransformation()`. Its `reverseTransformedValue` may implement a different inverse; the inherited implementation applies the forward operation when reverse conversion is allowed, following NSValueTransformer.

`NSENegateBooleanTransformerName`, `NSEIsNilTransformerName` and `NSEIsNotNilTransformerName` identify the built-in boolean negation and nil predicates. Both `null` and `undefined` bridge nil. Keyed-archive transformers and Objective-C class lookup by name are not provided. The former internal closure registry has been removed and object-controller bindings use the Foundation class directly.

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

Foundation owns the value types and the undo history engine. The system layer owns mounted authority and service adapters. The internal date, decimal and transformer predecessors have been removed. `ChangeSet` and `SelectionModel` remain private controller implementation models: neither has a Foundation class counterpart, and neither is published under an invented Cocoa name. Public byte contracts are described below.

## Public byte contracts

Public byte payload inputs accept `NSEDataConvertible`; delivered payloads use `NSEData` while keeping their Promise, nullable, array and stream wrappers. This includes pasteboards, document assets/resources/PDF output, file-reference byte reads, prepared share files, encoded audio/image/video/container data, MIDI messages, font files and PDF readers. There are no raw-return compatibility overloads.

Native `File` results retain file identity and metadata. MIME type and file name are separate fields on export/share records. Browser hosts create native Blobs, Files and codec buffers at explicit bridges. Numerical pixel/index planes, PCM/FFT samples and writable copy destinations retain their numerical typed arrays; they are not encoded byte payloads. `NSEData.read`, `.bytes` and `.blob` remain intentional web bridges. Genuine cross-realm web buffers are accepted using intrinsic brand checks.

Imported font storage delivers `NSEData`, font registration accepts convertible data, and `NSEFontLibrary.fontBytes` returns `NSEData | null`. The IndexedDB font host keeps its persisted ArrayBuffer envelope private.
