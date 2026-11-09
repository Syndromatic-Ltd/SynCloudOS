# BluetoothFX

BluetoothFX maps CoreBluetooth classes and delegates to the `BTFX` prefix. Import from `@syndromatic/syncloudos/fx/bluetooth` inside a plugin-compiled `.app`. Declare `bluetooth.access` in `Info.ts`. The application-specific classes pin the exact mounted session when constructed; constructing an unbound base class gives the application-bundle error. `useBluetooth(delegate?, queue?, options?)` returns a real component-owned `BTFXCentralManager` and ends it on actual unmount.

```ts
import { BTFXCentralManager, BTFXUUID } from "@syndromatic/syncloudos/fx/bluetooth";
const central = new BTFXCentralManager({
  centralManagerDidUpdateState(sender) { console.log(sender.state); },
  centralManagerDidDiscoverPeripheral(sender, peripheral, advertisementData, rssi) {
    peripheral.delegate = {
      peripheralDidDiscoverServices(p, error) {
        if (!error) p.discoverCharacteristics(null, p.services![0]!);
      },
      peripheralDidDiscoverCharacteristicsForService(p, service, error) {
        if (!error) p.readValue(service.characteristics![0]!);
      },
      peripheralDidUpdateValueForCharacteristic(p, characteristic, error) {
        if (!error) console.log(characteristic.value); // NSEData
        sender.cancelPeripheralConnection(p);
      },
    };
    sender.connect(peripheral);
  },
  centralManagerDidConnectPeripheral(_sender, peripheral) { peripheral.discoverServices(null); },
}, null, null);
// In a user-gesture action, after state becomes poweredOn:
central.scanForPeripherals([new BTFXUUID("180F")], null);
```

The constructor order is delegate, Dispatch queue, options. Null/omitted queue selects the pinned application's main queue. Every delegate has its sender first and runs as synchronous queue work. Reads/writes/discovery return `void`; outcomes update object properties and their exact delegate methods. `writeValue(data, characteristic, type)` requires `withResponse` or `withoutResponse`; `writeValue(data, descriptor)` is the separate descriptor overload. Writes without response have no successful write delegate, matching Apple. All data snapshots are immutable `NSEData`.

| Apple member | Browser behavior |
| --- | --- |
| `CBManager.state` / static `authorization` | Apple cases only. Browser availability gives poweredOn/poweredOff; missing API gives unsupported; unknown radio availability stays unknown. App privacy supplies notDetermined/denied/allowedAlways; missing entitlement or host policy gives restricted. Hardware availability never grants consent. |
| `CBCentralManager.scanForPeripherals` / `stopScan` | One user-chosen peripheral per scan, using the browser chooser. Stop invalidates pending and queued discovery; the browser may leave its chooser visible. Canceled/rejected choosers produce no discovery. CoreBluetooth has no scan-error delegate; native denial revokes access. Unsupported state/options throw `BTFXError(operationNotSupported)` before a chooser. |
| Discovery advertisement dictionary / RSSI | Empty dictionary; no packet fields are inferred from names, filters or services. RSSI is Apple's reserved unavailable value **127**, never a measured signal. Apple-authored `CBCentralManager.h` (macOS 11.3 SDK, lines 275–277) explicitly defines this for didDiscover; the header is [mirrored here](https://raw.githubusercontent.com/phracker/MacOSX-SDKs/master/MacOSX11.3.sdk/System/Library/Frameworks/CoreBluetooth.framework/Versions/A/Headers/CBCentralManager.h). |
| Connect / cancel connection | Asynchronous delegates, including native spontaneous disconnect. Cancel suppresses pending GATT results and releases late connections. Native browser GATT ownership is serialized per shared device so an old result cannot disconnect its replacement. |
| `retrievePeripherals(identifiers)` | Synchronous retrieval of this central's previously discovered, app-authorized peripherals. It does not enumerate origin grants or other applications. Identifiers are genuine `NSEUUID`, privately mapped from opaque browser IDs and stable for that browser Bluetooth object in the current process. No persisted or cross-process identity guarantee. |
| `retrieveConnectedPeripherals(withServices)` | Throws `operationNotSupported`; the browser cannot enumerate system-wide connections. |
| Services / characteristics / descriptors | Real class instances, UUIDs and parent relationships; results arrive through delegates and nullable collections. Service access is limited to chooser-granted services. Scanning with several UUIDs uses alternatives (Apple's any-service match). A null service scan does not add invented service grants. |
| `discoverIncludedServices` | Delegate receives `operationNotSupported`; browser included-service discovery is unavailable. |
| Read / write characteristic and descriptor | Native read/write failure is converted to `BTFXError` after shared privacy has recorded any current SecurityError/NotAllowedError. Standard descriptor values use string (2901), number (2900/2902/2903), or `NSEData`; other values remain opaque bytes. |
| Notifications | `setNotifyValue` reports state through its delegate; updates use `characteristic.value` plus `peripheralDidUpdateValueForCharacteristic`. Disabling, disconnect, consent loss and teardown remove listeners and invalidate queued values. |
| `readRSSI` | Delegate receives unavailable RSSI 127 and `operationNotSupported`; no RSSI query is fabricated. |
| `maximumWriteValueLength(type)` | Throws `operationNotSupported`; Web Bluetooth exposes no negotiated maximum length. No MTU constant is guessed. |
| Native manager/scan/connect options | Null or empty dictionaries accepted. Nonempty dictionaries throw `operationNotSupported`; restoration, duplicates, solicited services and native alert/background behavior are not silently ignored. |

`BTFXUUID` supports 16/32/128-bit Bluetooth UUID strings, `NSEData` and `NSEUUID` initializers. `uuidString`, `data` and `isEqual` preserve the Bluetooth base-UUID equivalence. `NSEUUID` adds Foundation's immutable UUID value with string/16-byte initialization, uppercase `uuidString`, `getBytes`, `isEqual` and `copy`; malformed inputs throw rather than producing invalid identifiers.

All native and queued boundaries retain the selected session and captured permission generation. Revocation is terminal for existing managers/peripherals, even after consent is restored. Native denial remains authoritative after saved consent; stale denial cannot revoke a replacement. Entitlements are rechecked for retained attributes. Registry removal and app abort immediately release native resources, delegate references and subscriptions. Peripherals and attributes have no public native port, client or factory. No physical Bluetooth acceptance is claimed by deterministic tests.
