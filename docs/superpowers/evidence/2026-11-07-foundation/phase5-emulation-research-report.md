# Installed Chromium emulation research

2026-11-07. Isolated Playwright browsers only; no server or listener started, and no existing tab, browser profile, or preview touched. Exact runnable probe: `node docs/superpowers/evidence/2026-11-07-foundation/phase5-emulation-research.mjs`. Machine-readable outcomes: `phase5-emulation-research-results.json`.

Both installed executables report 149.0.7827.55, revision `3188f8a607ae7e067593be8aab7f02d2451fec07`.

| Command | Default headless shell, browser CDP | Default headless shell, page CDP | Full Chromium (`channel: "chromium"`), browser CDP | Full Chromium, page CDP |
|---|---|---|---|---|
| `BluetoothEmulation.enable` | succeeds | method not found | succeeds | method not found |
| `Page.setSPCTransactionMode` | method not found | method not found | method not found | succeeds |
| `WebAuthn.enable` / `addVirtualAuthenticator` | method not found | succeeds | method not found | succeeds |

The default headless shell exposes JavaScript `PaymentRequest` and supports WebAuthn CDP, but payment-credential enrollment fails with `NotSupportedError: Error connecting to Secure Payment Confirmation service.` Payment Request capability calls fail because the renderer cannot connect to the browser's PaymentRequest service. API property existence does not establish that service availability.

Full Chromium successfully enrolled a real payment credential through a CDP virtual authenticator, returned `true` from native `PaymentRequest.canMakePayment()`, and completed native `PaymentRequest.show()` using automatic SPC confirmation. Native response details were a `PublicKeyCredential`, with a 32-byte raw credential ID and an ECDSA assertion signature. The script awaits native `response.complete("success")` before recording success. This emulates browser authorization; it performs no merchant verification, card settlement, or money movement.

Working details:

- Launch `chromium.launch({ headless: true, channel: "chromium", args: [...] })` using the exact feature flags in the script.
- Set SPC `autoAccept` on the **page** CDP session; configure virtual Bluetooth on the **browser** CDP session. Virtual WebAuthn belongs to the page session.
- Intercept `http://localhost/` through Playwright routing. This is a trustworthy loopback origin without a listener. An intercepted fake HTTPS URL has no actual SSL connection and Payment Request rejects its `Security level: NONE`, even though JavaScript reports a secure context.
- Enroll with `extensions: { payment: { isPayment: true } }`, ES256, platform authenticator and user verification, then use the returned `rawId` for SPC `credentialIds`.
- `payeeOrigin` must remain an HTTPS URL; using the HTTP loopback page's origin fails method validation. The synthetic payee origin in this probe is only an identifier and is never charged or contacted.
- Use a valid PNG for `instrument.icon`. The script generates a 32-pixel PNG with installed `sharp` and uses its data URL, avoiding external downloads. The initial invalid one-pixel PNG caused a real native icon-decode rejection.
- Call `show()` inside a handler triggered by an actual Playwright click. The probe does not replace Payment Request, WebAuthn, or their responses with fakes.

This proves available installed-browser emulation and native Payment Request operation. It does not itself verify the mounted PassFX wrapper; the root integration harness owns that verification.
