# NFCFX

NFCFX uses CoreNFC classes and protocols: `NFXReaderSession`, `NFXNDEFReaderSession`, `NFXNDEFReaderSessionDelegate`, `NFXNDEFTag`, `NFXNDEFMessage`, `NFXNDEFPayload`, `NFXNDEFStatus`, `NFXTypeNameFormat`, and `NFXReaderError`. Import from `@syndromatic/syncloudos/fx/nfc` inside a plugin-compiled `.app`. The compiler attributes the actual class to that application; constructing an unbound imported reader outside an application bundle fails with the application-bundle diagnostic. Binding/import is passive. Construction pins one exact live application session. Ended objects never bind to replacements.

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

The constructor takes delegate, queue, then invalidateAfterFirstRead. As in Apple's initializer, a null/omitted queue makes the session create its own serial Dispatch queue in the already-pinned application. Explicit `DFXQueue` is retained as `sessionQueue`. Delegate callbacks and completion handlers run as synchronous queue work, with authority checked again at delivery. Default invalidateAfterFirstRead is true. It delivers a message and then `readerSessionInvalidationErrorFirstNDEFTagRead`; false allows continued reads. `readerSessionDidInvalidateWithError` is required. The optional tag delegate takes priority over the message delegate, matching the read/write session style.

Declare `nfc.read` in `Info.ts` for discovery/read/connect/status and add `nfc.write` for write/lock. NFC has no public authorization API. Private per-app privacy, immutable launch entitlements, host policy and native denial all apply; saved consent cannot override native refusal. Every open/read/write/lock/connect/restart/finalization boundary classifies raw native denial before converting it to `NFXReaderError`. Revocation, exact session unregister or app teardown ends resources, drops queued deliveries, and rejects reuse even after regrant. Late native handles are closed without touching replacement sessions. Browser reads also require secure-context Web NFC, foreground visibility, user activation and suitable hardware.

`NFXNDEFReaderSession.readingAvailable` is a passive availability check within the attributed app. `begin()` starts asynchronously and `readerSessionDidBecomeActive` reports readiness. `isReady` becomes false when invalidated. `invalidate()` is terminal. Web NFC has no native NFC alert UI: setting `alertMessage` throws `readerErrorUnsupportedFeature`; its getter is the initial empty string. `invalidate(errorMessage)` still ends scanning but delivers `readerErrorUnsupportedFeature` because that native text cannot be shown. No browser page UI is invented.

For a capable private transport, implement `readerSessionDidDetectTags(session, tags)`, call `session.connect(tag, completionHandler)`, then use the protocol's completion handlers:

- `queryNDEFStatus((status, capacity, error) => {})` returns `notSupported`, `readWrite` or `readOnly` and capacity in bytes.
- `readNDEF((message, error) => {})` obtains a live read; errors carry a null message.
- `writeNDEF(message, error => {})` writes an NDEF message; `writeLock(error => {})` permanently locks a writable tag.
- `restartPolling()` retires previously detected tags. Old tag references are unavailable and cannot be reused.

Web NFC cannot connect to a particular detected tag, query its capacity/current availability, or guarantee that write/makeReadOnly affects that same tag. Its selected-tag objects therefore have `isAvailable === false`; connect fails with `readerErrorUnsupportedFeature`. Status/read/write/lock before connection report `readerTransceiveErrorTagNotConnected`; the underlying browser transport reports unsupported addressed operations. NFCFX never calls Web NFC's next-presented-tag write/makeReadOnly as a substitute. Use message-delegate reads in browsers. A scan event snapshot is never returned as a claimed fresh `readNDEF()` result.

`NFXNDEFPayload(format, type, identifier, payload)` takes `NSEData` for all three byte fields and `NFXTypeNameFormat` for format. Fields follow Apple's mutable value surface; constructors and asynchronous boundaries copy bytes/records. `NFXNDEFMessage(records).length` is the unchunked encoded NDEF size including record headers. URI helpers accept `URL` or string, encode real NFC URI prefix codes, and decode to `URL | null`. Text helpers use `Intl.Locale` (there is no Foundation locale class here), write UTF-8 with NDEF status and ASCII language bytes, and decode UTF-8 or UTF-16 to `[string | null, Intl.Locale | null]`. A nonmatching well-known type returns null values; malformed matching payloads throw `NFXReaderError`. No browser recordType, descriptor, serial number, AbortSignal or Promise API is public.

Browser-read record mapping is deliberately restricted to recoverable NDEF fields:

| Web NFC record | NDEF representation | Guarantee / limitation |
|---|---|---|
| text | TNF 1, type byte `T`; status + native ASCII language + unchanged native text bytes | Reconstructs compliant text records (reserved status bit 6 is zero), preserves native language casing and UTF-16 BOM/body. The decoder validates content without re-encoding it. The spec UTF-16 label (`utf-16be`) and Chromium label (`utf-16`) preserve the same original encoding bit and body. Unsupported/missing encoding or malformed metadata fails. |
| mime | TNF 2; UTF-8 media type, opaque payload | Preserves the exposed type string byte-for-byte when ASCII and payload range exactly. |
| smart-poster | TNF 1, type bytes `Sp`; opaque payload | Preserves container bytes; does not parse/re-serialize nested records. |
| external | TNF 4; exposed ASCII external type, opaque payload | Preserves exposed valid type and payload; unsupported names fail. |
| unknown / empty | TNF 5 / 0 | Opaque payload / empty fields, validated against format. |
| url / absolute-url | Unsupported | Browser expansion/normalization loses original prefix/type bytes; fails instead of inventing canonical bytes. Author-created URI payload helpers remain fully supported. |

Identifiers are accepted only when their exposed string round-trips losslessly through UTF-8 and contains no replacement characters; opaque non-UTF-8 identifiers fail explicitly. Web NFC joins chunks into logical records; original physical chunk framing is unavailable and is not exposed. A malformed/unrepresentable record invalidates the read session with an NFC error. Native readingerror maps to `readerTransceiveErrorTagResponseError`.

`useNFC(delegate, queue?, invalidateAfterFirstRead?)` returns the real attributed session and releases it on actual component unmount. Keep the delegate identity stable (for example, useMemo) to retain the same session across renders. StrictMode effect replay does not invalidate it. Neither SCOS, application context nor public browser/test runtime environments expose a client or adapter factory.

Automated capable-port tests prove the full tag flow, denial/revocation/late-result rules and immutable installed plugin entry. Physical NFC hardware, real permission UI and browser/device interoperability remain unverified. The sibling site's Gallery migration waits for the final SDK adoption; no compatibility shim is provided.
