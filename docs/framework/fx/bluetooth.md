# BluetoothFX

BluetoothFX lets your app find a nearby Bluetooth Low Energy peripheral, connect to it, and read, write or subscribe to its GATT characteristics. In a browser it runs on Web Bluetooth, so the user picks each device from the browser's chooser. If you have written CoreBluetooth code, the central/peripheral/delegate shape will be familiar.

Import from `@syndromatic/syncloudos/fx/bluetooth` inside a plugin-compiled `.app`, and declare `bluetooth.access` in `Info.ts`. The plugin's per-app classes bind to the mounted session when you construct them; constructing the unbound base class throws an error explaining that the class must come from an application bundle.

In a component, `useBluetooth(delegate?, queue?, options?)` from `@syndromatic/syncloudos/sdk` returns a `BTFXCentralManager` owned by that component and shuts it down when the component unmounts.

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

// In a user-gesture action, once state is poweredOn:
central.scanForPeripherals([new BTFXUUID("180F")], null);
```

## How calls and callbacks work

The constructor takes a delegate, a Dispatch queue and an options dictionary, in that order. A `null` or omitted queue means the app's main queue. Every delegate method receives the sender first and runs as synchronous work on that queue.

Reads, writes and discovery calls return `void`. Results arrive by updating object properties and then calling the matching delegate method. `writeValue(data, characteristic, type)` takes `withResponse` or `withoutResponse`; `writeValue(data, descriptor)` is the descriptor overload. A write without response never triggers a "did write" delegate call. Every value you receive is an immutable `NSEData` snapshot.

`BTFXManager.authorization` (static) reports `notDetermined`, `restricted`, `denied` or `allowedAlways`. A manager's `state` is one of `unknown`, `resetting`, `unsupported`, `unauthorized`, `poweredOff` or `poweredOn`.

## What the browser supports

| Area | Behaviour |
| --- | --- |
| `state`, `authorization` | Browser availability gives `poweredOn` or `poweredOff`; a missing Web Bluetooth API gives `unsupported`; unknown radio availability stays `unknown`. App privacy supplies `notDetermined`, `denied` or `allowedAlways`, and a missing entitlement or host policy gives `restricted`. Hardware availability never counts as consent. |
| `scanForPeripherals`, `stopScan` | Each scan opens the browser chooser and yields at most one user-chosen peripheral. `stopScan` drops pending and queued discoveries, though the browser may leave its chooser on screen. A cancelled or rejected chooser produces no discovery and no error callback; a native denial revokes access. Scanning when the state is not `poweredOn`, or with options, throws `BTFXError("operationNotSupported")` before any chooser opens. |
| Advertisement data and RSSI | The advertisement dictionary is always empty: nothing is inferred from names, filters or services. RSSI is 127, the reserved "unavailable" value, never a measured signal. |
| `connect`, `cancelPeripheralConnection` | Delegate callbacks arrive asynchronously, including for disconnects the device starts. Cancelling suppresses pending GATT results and releases late connections. GATT ownership is serialised per device, so a stale result cannot disconnect a newer connection. |
| `retrievePeripherals(identifiers)` | Returns, synchronously, peripherals this central has already discovered and the app is allowed to use. It does not list other origins' grants or other apps' devices. Identifiers are `NSEUUID` values mapped privately from the browser's opaque IDs; they stay stable for that browser device object within the current process, with no promise beyond it. |
| `retrieveConnectedPeripherals(serviceUUIDs)` | Throws `operationNotSupported`: a browser cannot list system-wide connections. |
| Services, characteristics, descriptors | Real class instances with UUIDs and parent links. Results arrive through delegates and nullable collections. You can only reach services the user granted in the chooser. Scanning for several UUIDs matches any of them; a `null` service list adds no service grants. |
| `discoverIncludedServices` | The delegate receives `operationNotSupported`. |
| Reads and writes | Native failures become `BTFXError` after the shared privacy layer records any `SecurityError` or `NotAllowedError`. Standard descriptors decode as a string (0x2901), a number (0x2900, 0x2902, 0x2903) or `NSEData`; other descriptor values stay as raw bytes. |
| Notifications | `setNotifyValue` reports its state through the delegate. Each update sets `characteristic.value` and calls `peripheralDidUpdateValueForCharacteristic`. Disabling, disconnecting, losing consent or tearing down removes the listener and discards queued values. |
| `readRSSI` | The delegate receives RSSI 127 with `operationNotSupported`. |
| `maximumWriteValueLength(type)` | Throws `operationNotSupported`. Web Bluetooth does not expose the negotiated MTU, and BluetoothFX does not guess one. |
| Manager, scan and connect options | `null` or an empty dictionary is fine. Any non-empty dictionary throws `operationNotSupported`, so restoration, duplicate filtering, solicited services and background alerts are never silently dropped. |

## UUIDs

`BTFXUUID` accepts 16-, 32- and 128-bit Bluetooth UUID strings, `NSEData` or an `NSEUUID`. `uuidString`, `data` and `isEqual` respect the Bluetooth base UUID, so a 16-bit UUID equals its 128-bit expansion. `NSEUUID` (from Foundation) is an immutable UUID built from a string or 16 bytes, with an uppercase `uuidString`, `getBytes`, `isEqual` and `copy`. Malformed input throws.

## Access and lifetime

Every native call and queued delivery keeps the session and permission generation captured at construction. Revoking access ends existing managers and peripherals for good, even if the user restores consent later. A native denial stays in force after saved consent, but a stale denial cannot revoke a replacement manager. Entitlements are rechecked for retained attributes. Removing the app from the registry, or aborting it, releases native resources, delegate references and subscriptions straight away. Peripherals and attributes expose no public native port, client or factory.

The deterministic tests do not exercise physical Bluetooth hardware.
