/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../Foundation/NSEData";
import type { NSEUUID } from "../../Foundation/NSEUUID";
import type { BTFXUUID } from "./BTFXUUID";
import type { BTFXPeripheralState } from "./BTFXPeripheralState";
import type { BTFXPeripheralDelegate } from "./BTFXPeripheralDelegate";
import { BTFXService } from "./BTFXService";
import { BTFXCharacteristic } from "./BTFXCharacteristic";
import { BTFXDescriptor } from "./BTFXDescriptor";
import type { BTFXCharacteristicWriteType } from "./BTFXCharacteristicWriteType";
import { BTFXError } from "./BTFXError";
import { peripheralRecord, services, characteristics, descriptors, attributes, assertAttribute } from "./internal/bluetoothObjects";
/** CBPeripheral. Objects originate from central discovery; values arrive via delegates. */
export class BTFXPeripheral {
  private constructor() {}
  get identifier(): NSEUUID {
    return peripheralRecord(this).native.identifier;
  }
  get name(): string | null {
    return peripheralRecord(this).native.name;
  }
  get state(): BTFXPeripheralState {
    const p = peripheralRecord(this);
    return p.owner.live() ? p.state : "disconnected";
  }
  get delegate(): BTFXPeripheralDelegate | null {
    return peripheralRecord(this).delegate;
  }
  set delegate(value: BTFXPeripheralDelegate | null) {
    const p = peripheralRecord(this);
    p.owner.assert();
    p.delegate = value;
  }
  get services(): readonly BTFXService[] | null {
    return peripheralRecord(this).services;
  }
  discoverServices(serviceUUIDs: readonly BTFXUUID[] | null): void {
    const p = peripheralRecord(this);
    p.owner.operation(
      this,
      () => p.connection!.discoverServices(serviceUUIDs),
      (values, error) => {
        if (values)
          p.services = Object.freeze(
            values.map(native => {
              const service = Object.create(BTFXService.prototype) as BTFXService;
              attributes.set(service, native.uuid);
              services.set(service, { native, peripheral: this, generation: p.generation, characteristics: null, includedServices: null });
              return service;
            }),
          );
        p.delegate?.peripheralDidDiscoverServices?.(this, error);
      },
    );
  }
  discoverIncludedServices(_includedServiceUUIDs: readonly BTFXUUID[] | null, service: BTFXService): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    assertAttribute(this, service);
    p.owner.enqueue(this, () =>
      p.delegate?.peripheralDidDiscoverIncludedServicesForService?.(
        this,
        service,
        new BTFXError("operationNotSupported", "Included service discovery is unavailable."),
      ),
    );
  }
  discoverCharacteristics(characteristicUUIDs: readonly BTFXUUID[] | null, service: BTFXService): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    assertAttribute(this, service);
    const s = services.get(service)!;
    p.owner.operation(
      this,
      () => s.native.discoverCharacteristics(characteristicUUIDs),
      (values, error) => {
        if (values)
          s.characteristics = Object.freeze(
            values.map(native => {
              const characteristic = Object.create(BTFXCharacteristic.prototype) as BTFXCharacteristic;
              attributes.set(characteristic, native.uuid);
              characteristics.set(characteristic, {
                native,
                service,
                value: null,
                isNotifying: false,
                notifyGeneration: 0,
                descriptors: null,
              });
              return characteristic;
            }),
          );
        p.delegate?.peripheralDidDiscoverCharacteristicsForService?.(this, service, error);
      },
    );
  }
  discoverDescriptors(characteristic: BTFXCharacteristic): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    const c = characteristics.get(characteristic);
    if (!c) throw new BTFXError("invalidHandle");
    assertAttribute(this, c.service);
    p.owner.operation(
      this,
      () => c.native.discoverDescriptors(),
      (values, error) => {
        if (values)
          c.descriptors = Object.freeze(
            values.map(native => {
              const descriptor = Object.create(BTFXDescriptor.prototype) as BTFXDescriptor;
              attributes.set(descriptor, native.uuid);
              descriptors.set(descriptor, { native, characteristic, value: null });
              return descriptor;
            }),
          );
        p.delegate?.peripheralDidDiscoverDescriptorsForCharacteristic?.(this, characteristic, error);
      },
    );
  }
  readValue(characteristic: BTFXCharacteristic): void;
  readValue(descriptor: BTFXDescriptor): void;
  readValue(attribute: BTFXCharacteristic | BTFXDescriptor): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    if (attribute instanceof BTFXCharacteristic) {
      const c = characteristics.get(attribute);
      if (!c) throw new BTFXError("invalidHandle");
      assertAttribute(this, c.service);
      p.owner.operation(
        this,
        () => c.native.read(),
        (value, error) => {
          if (value) c.value = NSEData.from(value);
          p.delegate?.peripheralDidUpdateValueForCharacteristic?.(this, attribute, error);
        },
      );
    } else {
      const d = descriptors.get(attribute);
      if (!d) throw new BTFXError("invalidHandle");
      assertAttribute(this, d.characteristic.service);
      p.owner.operation(
        this,
        () => d.native.read(),
        (value, error) => {
          if (value !== null) d.value = value instanceof NSEData ? NSEData.from(value) : value;
          p.delegate?.peripheralDidUpdateValueForDescriptor?.(this, attribute, error);
        },
      );
    }
  }
  writeValue(data: NSEData, characteristic: BTFXCharacteristic, type: BTFXCharacteristicWriteType): void;
  writeValue(data: NSEData, descriptor: BTFXDescriptor): void;
  writeValue(data: NSEData, attribute: BTFXCharacteristic | BTFXDescriptor, type?: BTFXCharacteristicWriteType): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    const captured = NSEData.from(data);
    if (attribute instanceof BTFXCharacteristic) {
      if (type !== "withResponse" && type !== "withoutResponse") throw new BTFXError("invalidParameters");
      const c = characteristics.get(attribute);
      if (!c) throw new BTFXError("invalidHandle");
      assertAttribute(this, c.service);
      p.owner.operation(
        this,
        () => c.native.write(captured, type),
        (_value, error) => {
          if (type === "withResponse") p.delegate?.peripheralDidWriteValueForCharacteristic?.(this, attribute, error);
        },
      );
    } else {
      if (type !== undefined) throw new BTFXError("invalidParameters");
      const d = descriptors.get(attribute);
      if (!d) throw new BTFXError("invalidHandle");
      assertAttribute(this, d.characteristic.service);
      p.owner.operation(
        this,
        () => d.native.write(captured),
        (_value, error) => p.delegate?.peripheralDidWriteValueForDescriptor?.(this, attribute, error),
      );
    }
  }
  setNotifyValue(enabled: boolean, characteristic: BTFXCharacteristic): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    const c = characteristics.get(characteristic);
    if (!c) throw new BTFXError("invalidHandle");
    assertAttribute(this, c.service);
    const generation = ++c.notifyGeneration;
    p.notificationCharacteristics.add(characteristic);
    p.owner.operation(
      this,
      () =>
        c.native.setNotify(enabled, value =>
          p.owner.enqueue(this, () => {
            if (generation !== c.notifyGeneration || !c.isNotifying) return;
            c.value = NSEData.from(value);
            p.delegate?.peripheralDidUpdateValueForCharacteristic?.(this, characteristic, null);
          }),
        ),
      (_value, error) => {
        if (generation !== c.notifyGeneration) return;
        if (!error) c.isNotifying = enabled;
        p.delegate?.peripheralDidUpdateNotificationStateForCharacteristic?.(this, characteristic, error);
      },
    );
  }
  readRSSI(): void {
    const p = peripheralRecord(this);
    p.owner.assert();
    p.owner.enqueue(this, () =>
      p.delegate?.peripheralDidReadRSSI?.(this, 127, new BTFXError("operationNotSupported", "RSSI measurement is unavailable.")),
    );
  }
  maximumWriteValueLength(_type: BTFXCharacteristicWriteType): number {
    peripheralRecord(this).owner.assert();
    throw new BTFXError("operationNotSupported", "The negotiated maximum write length is unavailable.");
  }
}
