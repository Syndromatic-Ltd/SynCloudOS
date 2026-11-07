# Native Bluetooth emulation on installed Chromium

2026-11-07. The isolated probe uses full Chromium 149.0.7827.55 (`channel: "chromium"`), an intercepted trustworthy `http://localhost/` blank document, and a document pointer listener triggered by `page.mouse.click`. It creates no visible custom control, server, or listener and closes its own browser in `finally`.

Run: `node docs/superpowers/evidence/2026-11-07-foundation/phase5-bluetooth-research.mjs`.

Final `phase5-bluetooth-research-results.json` reports no errors and a native success outcome with read bytes `[42]` and `disconnected: true`. Browser CDP recorded connection, discovery, read, write-with-response with byte `[17]`, notification subscription, and notification unsubscription. Page CDP recorded and selected the real browser device prompt. This verifies native browser operations against the CDP-emulated peripheral; it does not verify physical Bluetooth hardware or the mounted BluetoothFX wrapper.

The fixes needed for the root harness are:

1. `BluetoothEmulation` belongs to the browser CDP session. `DeviceAccess.enable`, prompt events, and `selectPrompt` belong to the page CDP session; enabling DeviceAccess on the browser session returns method-not-found.
2. Select the emulated device using `device.id === address`. Prompt events returned `name: ""` even though the simulated device was configured with a name. Matching the configured name left the request pending. Dedupe prompt IDs before selection because the same prompt can update more than once.
3. When simulating advertisements, include `scanRecord.txPower` and `scanRecord.appearance`, although the CDP types mark them optional. Omitting them produced a pending advertisement followed by `BluetoothEmulation not enabled`. Chromium's `ToScanRecord` initializes those Mojo structs only when the CDP fields are present, while `fake_bluetooth.mojom` requires non-nullable `Appearance` and `Power` members. The working probe uses `txPower: -10` and `appearance: 0`.
4. For native notification startup, add the Client Characteristic Configuration Descriptor (`00002902-0000-1000-8000-00805f9b34fb`) to the characteristic before service discovery. Without it, `startNotifications()` rejected with `NotSupportedError`. With it, the browser emitted subscribe/unsubscribe characteristic operations, which the emulation handler answered with code zero.

Source references inspected live:

- `content/browser/devtools/protocol/bluetooth_emulation_handler.cc`: domain configuration and `ToScanRecord`.
- `content/browser/devtools/protocol/device_access_handler.cc`: prompt enable/select routing.
- `device/bluetooth/public/mojom/emulation/fake_bluetooth.mojom`: required scan-record structs.
- `device/bluetooth/emulation/fake_remote_gatt_characteristic.cc`: notification response behavior.

No framework source was changed during this investigation. All research browsers were closed. Evidence remains separate from the root's mounted-framework browser acceptance harness.
