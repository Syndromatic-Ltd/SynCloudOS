# NFCFX

NFCFX reads NFC Data Exchange Format (NDEF) messages from tags and, on hosts that support it, writes and locks them. In a browser it runs on Web NFC, which limits you to reading the messages of whichever tag the user taps; the tag-level API is there for capable hosts.

The public types are `NFXReaderSession`, `NFXNDEFReaderSession`, `NFXNDEFReaderSessionDelegate`, `NFXNDEFTag`, `NFXNDEFMessage`, `NFXNDEFPayload`, `NFXNDEFStatus`, `NFXTypeNameFormat` and `NFXReaderError`. Import them from `@syndromatic/syncloudos/fx/nfc` inside a plugin-compiled `.app`. The compiler attributes each class to your app, and constructing the unbound class outside an application bundle throws an error that says so. Importing does nothing on its own. Constructing a session binds it to one live app session, and an ended session never binds to a replacement.

```ts
import { NFXNDEFReaderSession } from "@syndromatic/syncloudos/fx/nfc";

const session = new NFXNDEFReaderSession({
  readerSessionDidInvalidateWithError(sender, error) {
    console.log(error.code);
  },
  readerSessionDidDetectNDEFs(sender, messages) {
    console.log(messages[0]?.records);
  },
}, null, false);
// In a foreground user gesture:
session.begin();
// When finished:
session.invalidate();
```

## Sessions

The constructor takes a delegate, a queue and `invalidateAfterFirstRead`, in that order. With a `null` or omitted queue, the session creates its own serial Dispatch queue inside your app; an explicit `DFXQueue` is kept as `sessionQueue`. Delegate callbacks and completion handlers run as synchronous work on that queue, and the app's authority is checked again at delivery.

`readerSessionDidInvalidateWithError` is required; leaving it out throws `readerErrorInvalidParameter`. `readerSessionDidDetectNDEFs`, `readerSessionDidDetectTags` and `readerSessionDidBecomeActive` are optional. If you implement the tag callback, it takes priority over the message callback.

`invalidateAfterFirstRead` defaults to `true`: the session delivers one message and then invalidates with `readerSessionInvalidationErrorFirstNDEFTagRead`. Pass `false` to keep reading.

`NFXReaderSession.readingAvailable` (static) is a passive check for NFC reading support in your app. `begin()` starts asynchronously, and `readerSessionDidBecomeActive` tells you when the session is ready; calling `begin()` a second time throws `readerSessionInvalidationErrorSystemIsBusy`. `isReady` is `true` while the session is active. `invalidate()` is final and reports `readerSessionInvalidationErrorUserCanceled`.

Web NFC has no system alert sheet, so NFCFX does not invent one. `alertMessage` always reads as an empty string, and setting it throws `readerErrorUnsupportedFeature`. `invalidate(errorMessage)` still ends scanning, but reports `readerErrorUnsupportedFeature` because the message cannot be shown.

In a component, `useNFC(delegate, queue?, invalidateAfterFirstRead?)` from `@syndromatic/syncloudos/sdk` returns an attributed session and releases it when the component unmounts. Keep the delegate object stable (for example with `useMemo`) so the same session survives re-renders. StrictMode's effect replay does not invalidate it. No client or adapter factory is exposed on `SCOS`, the app context, or the public browser and test runtimes.

## Entitlements and access

Declare `nfc.read` in `Info.ts` for discovery, reading, connecting and status queries. Add `nfc.write` for writing and locking. NFC has no public authorisation API: per-app privacy, launch entitlements, host policy and native denial all apply, and saved consent cannot override a native refusal.

At every open, read, write, lock, connect, restart and finalisation step, a raw native denial is classified before it becomes an `NFXReaderError`. Revocation, unregistering the session or tearing down the app ends its resources, drops queued deliveries and blocks reuse, even if access is granted again. Native handles that arrive late are closed without touching any replacement session.

In a browser, reading also needs a secure context with Web NFC, a visible page, user activation and suitable hardware.

## Working with tags

On a host whose transport can address individual tags, implement `readerSessionDidDetectTags(session, tags)`, call `session.connect(tag, completionHandler)`, then use the tag's completion-handler methods:

- `queryNDEFStatus((status, capacity, error) => {})` reports `notSupported`, `readWrite` or `readOnly`, and the capacity in bytes.
- `readNDEF((message, error) => {})` performs a fresh read. On error the message is `null`.
- `writeNDEF(message, error => {})` writes a message. `writeLock(error => {})` permanently locks a writable tag.
- `restartPolling()` retires every tag detected so far. Old tag references stop working.

Web NFC cannot connect to a particular tag, read its capacity or availability, or promise that a write or lock reaches the same tag. In a browser, tag objects therefore report `isAvailable === false`, and `connect` fails with `readerErrorUnsupportedFeature`. Status, read, write and lock calls made before a successful connect report `readerTransceiveErrorTagNotConnected`. NFCFX never substitutes Web NFC's "write to the next tag presented" behaviour, and never returns a scan snapshot as if it were a fresh `readNDEF()` result. In browsers, read through the message callback.

## Messages and payloads

`new NFXNDEFPayload(format, type, identifier, payload)` takes an `NFXTypeNameFormat` and three `NSEData` byte fields. The fields are mutable; constructors and asynchronous boundaries copy bytes and records. `new NFXNDEFMessage(records).length` is the encoded size of the message, including record headers, without chunking.

Helpers build and decode well-known records:

- `NFXNDEFPayload.wellKnownTypeURIPayload(url)` accepts a `URL` or string and encodes the standard NFC URI prefix codes. The instance method of the same name decodes to `URL | null`.
- `NFXNDEFPayload.wellKnownTypeTextPayload(string, locale)` takes an `Intl.Locale` and writes UTF-8 text with the NDEF status byte and an ASCII language code. The instance method decodes UTF-8 or UTF-16 to `[string | null, Intl.Locale | null]`.

Decoding a record of a different well-known type returns `null` values; a malformed record of the right type throws `NFXReaderError`. The public API has no browser `recordType`, descriptor, serial number, `AbortSignal` or `Promise` members.

### How browser records map to NDEF

NFCFX converts a Web NFC record only when it can recover the original NDEF fields exactly:

| Web NFC record | NDEF representation | Notes |
|---|---|---|
| text | TNF 1, type `T`; status byte, ASCII language, original text bytes | Rebuilds compliant text records (reserved status bit 6 clear), keeping the language's case and any UTF-16 byte-order mark. The decoder validates the text without re-encoding it. Both `utf-16be` (the spec label) and `utf-16` (Chromium's label) keep the same encoding bit and body. A missing or unsupported encoding, or malformed metadata, fails. |
| mime | TNF 2; UTF-8 media type, opaque payload | Keeps an ASCII type string and the payload byte for byte. |
| smart-poster | TNF 1, type `Sp`; opaque payload | Keeps the container bytes without parsing nested records. |
| external | TNF 4; ASCII external type, opaque payload | Keeps a valid type and payload; unsupported names fail. |
| unknown / empty | TNF 5 / TNF 0 | Opaque payload or empty fields, validated against the format. |
| url / absolute-url | Not supported | The browser expands and normalises URLs, losing the original prefix byte, so NFCFX fails rather than guess. The URI helpers above still work for records you create. |

Record identifiers are accepted only if they round-trip through UTF-8 without loss or replacement characters; other identifiers fail. Web NFC joins chunked records, so the original chunk boundaries are not available. A record that is malformed or cannot be represented invalidates the session with an NFC error, and a browser `readingerror` becomes `readerTransceiveErrorTagResponseError`.

## Testing

Automated tests drive a capable port through the full tag flow, the denial, revocation and late-result rules, and the installed plugin entry. Physical NFC hardware, real permission prompts and cross-browser behaviour have not been verified.
