import { expect, it, vi } from "vitest";
import { systemCapabilityReport } from "../../src/SynCloudOS/InstalledApplications/capabilityReport";
import { BrowserXRAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserXRAdapter";
import { associateXRAdapter } from "../../src/FX/XRFX/internal/xrPort";
import { associateBluetoothAdapter } from "../../src/FX/BluetoothFX/internal/bluetoothPort";
import { associateNFCAdapter } from "../../src/FX/NFCFX/internal/nfcPort";
import { associatePaymentAdapter } from "../../src/FX/PassFX/internal/paymentPort";
import { createTestRuntime } from "./helpers";

const familyNames = ["AnimationFX", "GraphicsFX", "ImageFX", "TextFX", "AudioFX", "VideoFX", "MediaFX", "HapticsFX", "MotionFX", "LocationFX", "MIDIFX", "LuminaFX", "NetworkFX", "BluetoothFX", "NFCFX", "SpeechFX", "ContactsFX", "PassFX", "XRFX", "CompressionFX"];

it("isolates a native XR SecurityError while retaining every other capability row", async () => {
  const runtime = createTestRuntime();
  const refusal = new DOMException("XR policy denied", "SecurityError");
  const isSessionSupported = vi.fn(async () => { throw refusal; });
  const requestSession = vi.fn(async () => { throw new Error("Passive queries must not start a session"); });
  const adapter = new BrowserXRAdapter({ isSecureContext: true, browserNavigator: { xr: { isSessionSupported, requestSession } } });
  associateXRAdapter(runtime.environment, adapter);

  // The adapter must retain native refusal semantics for attributed family operations.
  await expect(adapter.isSupported("world")).rejects.toBe(refusal);
  const rows = await systemCapabilityReport(runtime);
  expect(rows.map(row => row.family)).toEqual(familyNames);
  expect(rows.find(row => row.family === "XRFX")).toEqual({ family: "XRFX", query: "ARWorldTrackingConfiguration.isSupported", value: "XR policy denied" });
  expect(rows.find(row => row.family === "CompressionFX")?.value).toContain("zlib");
  expect(isSessionSupported).toHaveBeenCalledWith("immersive-ar");
  expect(requestSession).not.toHaveBeenCalled();
});

it.each([
  ["BluetoothFX", "CBManager.state"],
  ["NFCFX", "NFCNDEFReaderSession.readingAvailable"],
  ["PassFX", "PKPaymentAuthorizationController.canMakePayments()"],
])("isolates a synchronous %s passive-query failure", async (family, query) => {
  const runtime = createTestRuntime();
  const unavailable = () => { throw new Error(`${family} policy denied`); };
  if (family === "BluetoothFX") associateBluetoothAdapter(runtime.environment, { get state() { return unavailable(); }, scan: unavailable });
  if (family === "NFCFX") associateNFCAdapter(runtime.environment, { get readingAvailable() { return unavailable(); }, open: unavailable });
  if (family === "PassFX") associatePaymentAdapter(runtime.environment, { assertAvailable: unavailable, canMakePayments: unavailable, open: unavailable });

  const rows = await systemCapabilityReport(runtime);
  expect(rows.map(row => row.family)).toEqual(familyNames);
  expect(rows.find(row => row.family === family)).toEqual({ family, query, value: `${family} policy denied` });
});
