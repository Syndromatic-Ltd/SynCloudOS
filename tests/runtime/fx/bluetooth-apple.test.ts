import { expect, it } from "vitest";
import * as B from "../../../src/FX/BluetoothFX/public";
import * as F from "../../../src/Foundation/public";
it("exports actual CoreBluetooth classes, Apple enums and no old browser client", () => {
  for (const name of ["Manager", "CentralManager", "Peripheral", "Attribute", "Service", "Characteristic", "Descriptor", "UUID", "Error"]) expect(typeof Reflect.get(B, `BTFX${name}`)).toBe("function");
  expect(Object.keys(B)).not.toEqual(expect.arrayContaining(["BTFXBluetoothClient", "BTFXCapabilities"]));
  expect(Reflect.get(B, "BTFXManagerState")).toEqual({ unknown: "unknown", resetting: "resetting", unsupported: "unsupported", unauthorized: "unauthorized", poweredOff: "poweredOff", poweredOn: "poweredOn" });
  expect(Reflect.get(B, "BTFXManagerAuthorization")).toEqual({ notDetermined: "notDetermined", restricted: "restricted", denied: "denied", allowedAlways: "allowedAlways" });
});
it("provides immutable Foundation UUIDs and Bluetooth 16/32/128-bit UUID values", () => {
  const UUID = Reflect.get(F, "NSEUUID"); expect(typeof UUID).toBe("function");
  const value = new UUID("0000180f-0000-1000-8000-00805f9b34fb"); expect(value.uuidString).toBe("0000180F-0000-1000-8000-00805F9B34FB"); expect(new UUID().uuidString).toMatch(/^[A-F0-9-]{36}$/); expect(() => new UUID("opaque-device-id")).toThrow(); const bytes=new Uint8Array(16);value.getBytes(bytes);expect(new UUID(bytes).isEqual(value)).toBe(true);bytes[0]=255;expect(value.uuidString).toBe("0000180F-0000-1000-8000-00805F9B34FB");expect(value.copy()).toBe(value);expect(value.isEqual({uuidString:value.uuidString})).toBe(false);
  const BT = Reflect.get(B, "BTFXUUID"); const short = new BT("180f"); expect(short.uuidString).toBe("180F"); expect(short.data.bytes).toEqual(new Uint8Array([0x18, 0x0f])); expect(new BT(F.NSEData.from(new Uint8Array([0x18, 0x0f]))).uuidString).toBe("180F"); expect(new BT(value).uuidString).toBe(value.uuidString); expect(() => new BT("battery_service")).toThrow();
});
it("retains Apple characteristic option bits and error domain", () => {
  expect(Reflect.get(B, "BTFXCharacteristicProperties")).toMatchObject({ broadcast: 1, read: 2, writeWithoutResponse: 4, write: 8, notify: 16, indicate: 32, authenticatedSignedWrites: 64, extendedProperties: 128 });
  expect(Reflect.get(B, "BTFXCharacteristicWriteType")).toEqual({ withResponse: "withResponse", withoutResponse: "withoutResponse" });
  expect(Reflect.get(B, "BTFXError")?.errorDomain).toBe("CBErrorDomain");
});
