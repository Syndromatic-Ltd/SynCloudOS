# NFCFX

NFCFX follows Core NFC's `NDEFReaderSession` and NDEF message/payload objects using the `NFX` prefix. It exposes foreground NDEF through Web NFC. It does not expose ISO 7816, ISO 15693, FeliCa, MIFARE commands, background tag discovery, or native wallet access.

Declare `nfc.read` for scanning, and `nfc.write` for writing or making a tag read-only. Mounted clients recheck the declaration and host policy at each operation and before delivering readings. Removing access revokes the scanning session. Browser permission remains separate: `getAuthorizationStatus()` returns the Permissions API's `nfc` state, `unknown` when that descriptor is unsupported, and `unavailable` without secure-context Web NFC. It never starts a scan.

```tsx
import { useNFC } from "@syndromatic/syncloudos/sdk";
import { NFXNDEFMessage } from "@syndromatic/syncloudos/fx/nfc";

const nfc = useNFC(); // Component-owned client. No browser prompt.
// Run from an explicit user action:
const session = nfc.createReaderSession();
await session.scan(({ serialNumber, message }) => {
  console.log(serialNumber, message.records);
});
// Or, with nfc.write:
await session.write(new NFXNDEFMessage([
  { recordType: "text", data: "Hello" },
]));
session.dispose();
```

`getCapabilities()` synchronously reports `reading`, `writing`, and `makingReadOnly` without constructing a reader or querying permission. These report exposed API support, not the presence of a tag or permission to access one. Web NFC availability varies by browser and device; a secure context, foreground document, user activation, browser permission, and NFC hardware may all be required.

`NFXNDEFMessage.records` and `NFXNDEFPayload` are immutable. Payload input accepts strings, `NSEDataConvertible` bytes, and nested messages. Browser-read bytes return as `NSEData`, preserving the original record's `encoding` and `lang` metadata; the framework does not guess text decoding. Binary data is copied using the browser view's byte offset and length. Nested messages remain NDEF messages.

Each session supports one scan. `scan(listener, onError?)` resolves when scanning starts; readings continue until disposal or cancellation. `readingerror` reaches `onError` as `NotReadableError`; malformed record conversion errors also reach that callback. Browser scan/write errors propagate. `write(message, { overwrite? })` does not require scanning. `makeReadOnly()` is an explicit, irreversible tag operation and rejects with `NotSupportedError` when absent. NFCFX never calls it automatically.

Sessions accept an optional `AbortSignal`; component unmount and app unmount revoke them, reject pending operations, abort the browser's scan/write signal, and remove event handlers. Dispose sessions promptly to release the mounted resource budget. Browser NFC references enter only through the host's `BrowserNFCAdapter({ isSecureContext, NDEFReader?, permissions? })`; apps receive the mounted client.

Automated coverage uses injected browser ports. Actual NFC hardware, permission prompts, foreground visibility behavior, nested-record interoperability, and physical tag writing need device testing.
