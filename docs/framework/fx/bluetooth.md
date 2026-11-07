# BluetoothFX

BluetoothFX (`BTFX`) follows Core Bluetooth's central, peripheral, service and characteristic concepts using Web Bluetooth. Import its types from `@syndromatic/syncloudos/fx/bluetooth`. Device access comes from the mounted session, through `useBluetooth()` or `useSCOS().bluetooth.createCentralManager(signal?)`.

Declare `bluetooth.access` in the app's `Info.ts` entitlements (the transitional `permissions` declaration is also accepted by the runtime). The mounted client checks that declaration and host authorisation before access, including calls through retained service and characteristic objects. The browser still owns the device chooser and its device-specific grants. Construction and `getCapabilities()` do not open a chooser.

```ts
const manager = useBluetooth();
// In an NSEButton action, directly from the user's gesture:
const peripheral = await manager.requestAuthorization({
  filters: [{ services: ["battery_service"] }],
});
await peripheral.connect();
const services = await peripheral.discoverServices();
const characteristics = await services[0].discoverCharacteristics();
const bytes = await characteristics[0].readValue(); // NSEData
peripheral.disconnect();
```

| Public API | Role |
| --- | --- |
| `BTFXBluetoothClient` | `getCapabilities()`, `createCentralManager(signal?)` |
| `BTFXCentralManager` | `getAuthorizationStatus()`, `requestAuthorization(request)`, `retrievePeripherals()`, `dispose()` |
| `BTFXPeripheral` | Identifier, name, connection state, `connect()`, `disconnect()`, `discoverServices()` |
| `BTFXService` | UUID, primary status, `discoverCharacteristics()` |
| `BTFXCharacteristic` | UUID, `readValue()`, `writeValue(data, withResponse?)`, `setNotifyValue(enabled, listener?)` |
| `BTFXCapabilities` | Secure API availability and granted-device retrieval; background scanning and peripheral role are always false |
| `BTFXPeripheralRequest` | Browser chooser filters, optional services or `acceptAllDevices` |
| `BTFXAuthorizationStatus` | `unknown`, `prompt`, `granted`, `denied`, `unavailable` |

Byte results and notifications are immutable `NSEData` snapshots. Writes accept `NSEDataConvertible`. Writes with and without response are separate browser operations; an unsupported mode fails with `NotSupportedError`. Disposing a manager, aborting its signal or closing the mount removes notification listeners and disconnects owned devices. An outstanding chooser promise rejects on owner cancellation; the browser may keep its native chooser open, but a late selection is discarded and disconnected.

`requestAuthorization` combines the chooser grant with returning its selected peripheral. It is not Apple's blanket Bluetooth grant. If `getDevices()` exists, status is `granted` when this origin has at least one granted peripheral and `prompt` otherwise; no device grant authorises every peripheral or every service. Without that browser API, status remains `unknown` until an explicit request succeeds or is denied. Cancelling a chooser is not a durable denial. Secure context and browser user activation are required; platform and enterprise policies may block requests independently.

Web Bluetooth provides central-role GATT access only. There is no background scan, advertising, peripheral/server role, pairing administration, classic Bluetooth, native restoration or native connection-event guarantee. Those Core Bluetooth APIs are omitted. Service access is limited to services granted by the chooser. `retrievePeripherals()` fails honestly when the browser lacks `getDevices()`.
