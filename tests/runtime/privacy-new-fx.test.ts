/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { describe, expect, it, vi } from "vitest";
import { createPrivacyStore, type PrivacyApplicationPort, type PrivacyAuthorizationStatus } from "../../src/SynCloudOS/Privacy";
import { createMountedBluetoothClient } from "../../src/SynCloudOS/AppSDK/mountedBluetoothClient";
import { createMountedNFCClient } from "../../src/SynCloudOS/AppSDK/mountedNFCClient";
import { createMountedSpeechClient } from "../../src/SynCloudOS/AppSDK/mountedSpeechClient";
import { createMountedContactsClient } from "../../src/SynCloudOS/AppSDK/mountedContactsClient";
import { createMountedPaymentClient } from "../../src/SynCloudOS/AppSDK/mountedPaymentClient";
import { createMountedXRClient } from "../../src/SynCloudOS/AppSDK/mountedXRClient";
import { NSEData } from "../../src/Foundation/NSEData";
import { NFXNDEFMessage, type NFXNDEFReading } from "../../src/FX/NFCFX/public";
import { XRFXConfiguration, type XRFXFrame } from "../../src/FX/XRFX/public";
import { PKFXPaymentRequest } from "../../src/FX/PassFX/public";
import type { SPFXSpeechRecognitionResult } from "../../src/FX/SpeechFX/public";
import type { BTFXPeripheral } from "../../src/FX/BluetoothFX/public";

const families = ["bluetooth", "nfc", "speech", "contacts", "payment", "xr"] as const;
type Family = typeof families[number];
interface Probe {
  status(): Promise<PrivacyAuthorizationStatus>;
  capabilities(): unknown;
  request(): Promise<unknown>;
  dispose(): void;
  nativeRequest: ReturnType<typeof vi.fn>;
  nativeDispose: ReturnType<typeof vi.fn>;
  nativeStatus: ReturnType<typeof vi.fn>;
  lateValue: unknown;
  received: ReturnType<typeof vi.fn>;
  emit?(): void;
  startLive?(): Promise<void>;
}
const speechResult: SPFXSpeechRecognitionResult = { bestTranscription: { formattedString: "hello", confidence: 1 }, transcriptions: [{ formattedString: "hello", confidence: 1 }], isFinal: true };
function probe(family: Family, port: PrivacyApplicationPort, signal: AbortSignal): Probe {
  const nativeDispose = vi.fn(); const nativeStatus = vi.fn(async () => "granted" as const); const received = vi.fn();
  if (family === "bluetooth") {
    const capabilities = () => ({ apiAvailable: true, retrievesGrantedPeripherals: true, backgroundScanning: false as const, peripheralRole: false as const });
    let notify: ((value: NSEData) => void) | undefined;
    const characteristic = { uuid: "value", readValue: async () => NSEData.from(new Uint8Array([1])), writeValue: async () => {}, setNotifyValue: async (_enabled: boolean, listener?: (value: NSEData) => void) => { notify = listener; } };
    const peripheral: BTFXPeripheral = { identifier: "peripheral", name: "Sensor", isConnected: true, connect: async () => {}, disconnect: vi.fn(), discoverServices: async () => [{ uuid: "service", isPrimary: true, discoverCharacteristics: async () => [characteristic] }] };
    const nativeRequest = vi.fn(async () => peripheral);
    const client = createMountedBluetoothClient({ getCapabilities: capabilities, createCentralManager: () => ({ getCapabilities: capabilities, getAuthorizationStatus: nativeStatus, requestAuthorization: nativeRequest, retrievePeripherals: async () => [], dispose: nativeDispose }) }, signal, () => ["bluetooth.access"], () => true, port);
    const manager = client.createCentralManager(); let selected: BTFXPeripheral | undefined;
    return { capabilities: client.getCapabilities, status: manager.getAuthorizationStatus, request: async () => selected = await manager.requestAuthorization({ acceptAllDevices: true }), dispose: manager.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: peripheral, received,
      startLive: async () => { const service = (await selected!.discoverServices())[0]; const value = (await service.discoverCharacteristics())[0]; await value.setNotifyValue(true, received); }, emit: () => notify?.(NSEData.from(new Uint8Array([2]))) };
  }
  if (family === "nfc") {
    let reading: ((value: NFXNDEFReading) => void) | undefined;
    const nativeRequest = vi.fn(async (listener: (value: NFXNDEFReading) => void) => { reading = listener; });
    const client = createMountedNFCClient({ getCapabilities: () => ({ reading: true, writing: true, makingReadOnly: true }), createReaderSession: () => ({ getAuthorizationStatus: nativeStatus, scan: nativeRequest, write: async () => {}, makeReadOnly: async () => {}, dispose: nativeDispose }) }, signal, () => ["nfc.read", "nfc.write"], () => true, port);
    const session = client.createReaderSession();
    return { capabilities: client.getCapabilities, status: session.getAuthorizationStatus, request: () => session.scan(received), dispose: session.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: undefined, received, emit: () => reading?.({ serialNumber: "tag", message: new NFXNDEFMessage([]) }) };
  }
  if (family === "speech") {
    let listener: ((value: SPFXSpeechRecognitionResult) => void) | undefined;
    const capabilities = () => ({ recognition: true, onDeviceRecognition: false as const });
    const nativeRequest = vi.fn(async () => "granted" as const);
    const client = createMountedSpeechClient({ getCapabilities: capabilities, createRecognizer: () => ({ getCapabilities: capabilities, getAuthorizationStatus: nativeStatus, requestAuthorization: nativeRequest, recognitionTask: (_request, next) => { listener = next; return { result: new Promise<SPFXSpeechRecognitionResult>(() => {}), finish() {}, cancel() {} }; }, dispose: nativeDispose }) }, signal, () => ["speech.recognize"], () => true, port);
    const recognizer = client.createRecognizer();
    return { capabilities: client.getCapabilities, status: recognizer.getAuthorizationStatus, request: () => recognizer.requestAuthorization(), dispose: recognizer.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: "granted", received,
      startLive: async () => { void recognizer.recognitionTask({}, received).result.catch(() => {}); await Promise.resolve(); await Promise.resolve(); }, emit: () => listener?.(speechResult) };
  }
  if (family === "contacts") {
    const capabilities = () => ({ contactPicker: true, persistentAccess: false as const }); const nativeRequest = vi.fn(async () => []);
    const client = createMountedContactsClient({ getCapabilities: capabilities, createContactStore: () => ({ getCapabilities: capabilities, getAuthorizationStatus: nativeStatus, requestAccess: nativeRequest, dispose: nativeDispose }) }, signal, () => ["contacts.select"], () => true, port);
    const store = client.createContactStore();
    return { capabilities: client.getCapabilities, status: store.getAuthorizationStatus, request: () => store.requestAccess(), dispose: store.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: [], received };
  }
  if (family === "payment") {
    const payment = { requestId: "payment", methodName: "https://merchant.example/pay", details: null, payerName: null, payerEmail: null, payerPhone: null, complete: vi.fn(async () => {}) };
    const nativeRequest = vi.fn(async () => payment);
    const client = createMountedPaymentClient({ getCapabilities: () => ({ paymentRequest: true }), createAuthorizationController: () => ({ getAuthorizationStatus: nativeStatus, canMakePayments: async () => true, present: nativeRequest, dispose: nativeDispose }) }, signal, () => ["payment.request"], () => true, port);
    const controller = client.createAuthorizationController(new PKFXPaymentRequest({ currencyCode: "GBP", paymentSummaryItems: [{ label: "Merchant", amount: "1.00" }], paymentMethodData: [{ supportedMethods: "https://merchant.example/pay" }] }));
    return { capabilities: client.getCapabilities, status: controller.getAuthorizationStatus, request: controller.present, dispose: controller.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: payment, received };
  }
  let frame: ((value: XRFXFrame) => void) | undefined;
  const capabilities = () => ({ apiAvailable: true, worldTracking: false as const, nativeARKit: false as const });
  const nativeRequest = vi.fn(async (_configuration: XRFXConfiguration, listener: (value: XRFXFrame) => void) => { frame = listener; });
  const client = createMountedXRClient({ getCapabilities: capabilities, createSession: () => ({ getCapabilities: capabilities, getAuthorizationStatus: nativeStatus, isSupported: async () => true, run: nativeRequest, pause: async () => {}, dispose: nativeDispose }) }, signal, () => ["xr.session"], () => true, port);
  const session = client.createSession();
  return { capabilities: client.getCapabilities, status: session.getAuthorizationStatus, request: () => session.run(new XRFXConfiguration(), received), dispose: session.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: undefined, received, emit: () => frame?.({ timestamp: 1, viewerTransform: null, anchors: [] }) };
}
function fixture(family: Family) {
  const mount = new AbortController(); const store = createPrivacyStore({ runtimeId: "new-fx" });
  const scope = { userId: "user", appId: "com.example.app", service: family };
  const port = store.forApplication({ ...scope, signal: mount.signal });
  return { store, scope, mount, port, device: probe(family, port, mount.signal) };
}

describe.each(families)("shared privacy for %s", family => {
  it("does not turn origin permission or passive capability queries into app consent", async () => {
    const f = fixture(family);
    try {
      f.device.capabilities();
      expect(f.store.getSnapshot()).toEqual([]);
      expect(await f.device.status()).toBe("prompt");
      expect(f.device.nativeRequest).not.toHaveBeenCalled();
      expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "prompt", browserStatus: "granted" });
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("denies an app before active native access while retaining passive status inspection", async () => {
    const f = fixture(family);
    try {
      f.store.revoke(f.scope);
      expect(await f.device.status()).toBe("denied");
      expect(f.device.nativeStatus).toHaveBeenCalledTimes(1);
      await expect(f.device.request()).rejects.toMatchObject({ name: "NotAllowedError" });
      expect(f.device.nativeRequest).not.toHaveBeenCalled();
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("records explicit successful use, then releases live resources and suppresses callbacks on revocation", async () => {
    const f = fixture(family);
    try {
      await f.device.request(); await f.device.startLive?.();
      expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "granted" });
      expect(await f.device.status()).toBe("granted");
      f.device.emit?.();
      const delivered = f.device.received.mock.calls.length;
      f.store.revoke(f.scope);
      expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
      f.device.emit?.(); expect(f.device.received).toHaveBeenCalledTimes(delivered);
      await expect(f.device.request()).rejects.toMatchObject({ name: "AbortError" });
      f.device.dispose(); expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("keeps browser denial authoritative and revokes the live manager", async () => {
    const f = fixture(family);
    try {
      await f.device.request();
      f.device.nativeStatus.mockResolvedValueOnce("denied");
      expect(await f.device.status()).toBe("denied");
      expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "granted", browserStatus: "denied", authorizationStatus: "denied" });
      expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("rejects stale in-flight results immediately after revocation", async () => {
    const f = fixture(family);
    let finish!: (value: unknown) => void;
    f.device.nativeRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    try {
      const pending = f.device.request();
      await vi.waitFor(() => expect(f.device.nativeRequest).toHaveBeenCalledTimes(1));
      f.store.revoke(f.scope);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      finish(f.device.lateValue); await Promise.resolve(); await Promise.resolve();
      expect(f.store.getSnapshot()[0].decision).toBe("denied");
      expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
    } finally { f.mount.abort(); f.store.dispose(); }
  });
});
it("does not enumerate Bluetooth origin grants until this app has explicitly requested access", async () => {
  const mount = new AbortController();
  const store = createPrivacyStore({ runtimeId: "bluetooth-retrieval" });
  const privacy = store.forApplication({ userId: "user", appId: "com.example.app", service: "bluetooth", signal: mount.signal });
  const capabilities = () => ({ apiAvailable: true, retrievesGrantedPeripherals: true, backgroundScanning: false as const, peripheralRole: false as const });
  const retrieve = vi.fn(async () => []);
  const peripheral: BTFXPeripheral = { identifier: "device", name: "Device", isConnected: false, connect: async () => {}, disconnect() {}, discoverServices: async () => [] };
  const client = createMountedBluetoothClient({ getCapabilities: capabilities, createCentralManager: () => ({ getCapabilities: capabilities, getAuthorizationStatus: async () => "granted", requestAuthorization: async () => peripheral, retrievePeripherals: retrieve, dispose() {} }) }, mount.signal, () => ["bluetooth.access"], () => true, privacy);
  const manager = client.createCentralManager();
  try {
    expect(await manager.getAuthorizationStatus()).toBe("prompt");
    await expect(manager.retrievePeripherals()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(retrieve).not.toHaveBeenCalled();
    expect(store.getSnapshot()[0].decision).toBe("prompt");
    await manager.requestAuthorization({ acceptAllDevices: true });
    expect(await manager.retrievePeripherals()).toEqual([]);
    expect(retrieve).toHaveBeenCalledTimes(1);
  } finally { mount.abort(); store.dispose(); }
});
it("returns a completed Speech authorisation refusal without converting it into self-cancellation", async () => {
  const f = fixture("speech");
  f.device.nativeRequest.mockResolvedValueOnce("denied");
  try {
    expect(await f.device.request()).toBe("denied");
    expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "denied", authorizationStatus: "denied" });
  } finally { f.mount.abort(); f.store.dispose(); }
});