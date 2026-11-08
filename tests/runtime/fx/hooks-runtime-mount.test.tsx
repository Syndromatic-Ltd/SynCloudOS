// @vitest-environment jsdom
import React, { StrictMode, Suspense, useLayoutEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SynWareRuntimeMount } from "../../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../../src/SynCloudOSReact";
import { useSynWareContext } from "../../../src/SynCloudOS/AppSDK/SynWareContext";
import { useNetwork, useSpeech, useContacts, usePayment, useNFC, useBluetooth, useXR } from "../../../src/SynCloudOS/AppSDK";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { scosSessionsForApp } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { NWFXPathMonitor } from "../../../src/FX/NetworkFX/public";
import { SPFXSpeechRecognizer } from "../../../src/FX/SpeechFX/public";
import { CNFXContactStore } from "../../../src/FX/ContactsFX/public";
import { PKFXPaymentAuthorizationController, PKFXPaymentRequest, PKFXPaymentSummaryItem } from "../../../src/FX/PassFX/public";
import { NFXNDEFReaderSession, NFXReaderSession } from "../../../src/FX/NFCFX/public";
import { BTFXCentralManager, BTFXManager } from "../../../src/FX/BluetoothFX/public";
import { XRFXSession, XRFXOrientationTrackingConfiguration } from "../../../src/FX/XRFX/public";
import { NSEDecimalNumber } from "../../../src/Foundation/NSEDecimalNumber";
import { dispatchQueueForSession } from "../../../src/FX/DispatchFX/internal/sessionBinding";
import { createTestBundle, createTestRuntime } from "../helpers";

const appId = "com.example.hooks-real-mount";
const entitlements = ["network.read", "speech.recognize", "contacts.select", "payment.request", "nfc.read", "bluetooth.access", "xr.session"];
const branding = Object.freeze({ name: "Hook mount", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Hook mount" });
const classes = { NWFXPathMonitor, SPFXSpeechRecognizer, CNFXContactStore, PKFXPaymentAuthorizationController, NFXNDEFReaderSession, BTFXCentralManager, XRFXSession };
const bound = bindFXFamily(classes, appId);
const nfcDelegate = { readerSessionDidInvalidateWithError() {} };
const request = new PKFXPaymentRequest();
Object.assign(request, { merchantIdentifier: "merchant.test", countryCode: "GB", currencyCode: "GBP", supportedNetworks: ["visa"], merchantCapabilities: 1, paymentSummaryItems: [new PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.one)] });
type Fixture = {
  runtime: ReturnType<typeof createTestRuntime>;
  environment: ReturnType<typeof createDeterministicRuntimeEnvironment>;
  app: NonNullable<ReturnType<ReturnType<typeof createTestRuntime>["apps"]["getApp"]>>;
};
const fixtures: Fixture[] = [];
function fixture(): Fixture {
  const environment = createDeterministicRuntimeEnvironment({ document });
  const finish = environment.prepareRuntimeBootstrap();
  let runtime: ReturnType<typeof createTestRuntime>;
  try { runtime = createTestRuntime({ id: "duplicate-configured-runtime-id", environment: environment.environment, authenticationPolicy: "optional" }); } finally { finish(); }
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: appId }, { entitlements }));
  runtime.responders.register({ id: `application:${appId}`, kind: "application", parentId: "workspace", scopeId: `application:${appId}` });
  environment.adapters.permissions.allow(); environment.adapters.policy.allow(); environment.adapters.network.allow();
  const value = { runtime, environment, app: runtime.apps.getApp(appId)! };
  fixtures.push(value);
  return value;
}
function Mount({ value, children }: { value: ReturnType<typeof fixture>; children: React.ReactNode }) {
  return <StrictMode><SynCloudOSProvider runtime={value.runtime}><HostSiteBrandingProvider value={branding}>
    <SynWareRuntimeMount runtime={value.runtime} app={value.app} responderId={`application:${appId}`}>{children}</SynWareRuntimeMount>
  </HostSiteBrandingProvider></SynCloudOSProvider></StrictMode>;
}
function useOwners() {
  return { NWFXPathMonitor: useNetwork(), SPFXSpeechRecognizer: useSpeech(), CNFXContactStore: useContacts(), PKFXPaymentAuthorizationController: usePayment(request), NFXNDEFReaderSession: useNFC(nfcDelegate), BTFXCentralManager: useBluetooth(), XRFXSession: useXR() };
}
afterEach(async () => {
  cleanup();
  for (const value of fixtures.splice(0)) { await value.runtime.dispose("hook test cleanup"); value.environment.dispose(); }
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it("pins all real hook objects to branded mounts despite duplicate runtime IDs, survives replay, and cancels only the unmounted owner", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } });
  const flush = () => { while (jobs.length) jobs.shift()!(); };
  const first = fixture(), second = fixture();
  await Promise.all([first.runtime.identity.session.refresh(), second.runtime.identity.session.refresh()]);
  const held: ReturnType<typeof useOwners>[] = []; const setups = [0, 0]; const received = [vi.fn(), vi.fn()];
  function Probe({ index }: { index: number }) {
    const context = useSynWareContext()!;
    const selected = scosSessionsForApp(appId).filter(session => session.context.signal === context.signal);
    expect(selected).toHaveLength(1); expect(selected[0].context).not.toBe(context); expect(context.branding).toBe(branding);
    const owners = useOwners(); held[index] = owners;
    useLayoutEffect(() => { setups[index]++; owners.NWFXPathMonitor.pathUpdateHandler = received[index]; owners.NWFXPathMonitor.start(); }, [owners.NWFXPathMonitor]);
    return null;
  }
  const firstView = render(<Mount value={first}><Probe index={0} /></Mount>);
  const secondView = render(<Mount value={second}><Probe index={1} /></Mount>);
  expect(setups).toEqual([2, 2]);
  for (const owners of held) {
    for (const name of Object.keys(classes) as (keyof typeof classes)[]) { expect(owners[name]).toBeInstanceOf(classes[name]); expect(owners[name]).toBeInstanceOf(bound[name]); }
    expect(owners.BTFXCentralManager).toBeInstanceOf(BTFXManager); expect(owners.NFXNDEFReaderSession).toBeInstanceOf(NFXReaderSession);
  }
  expect(first.environment.adapters.network.activeMonitorCount()).toBe(1); expect(second.environment.adapters.network.activeMonitorCount()).toBe(1);
  flush(); expect(received.map(listener => listener.mock.calls.length)).toEqual([1, 1]);
  first.environment.adapters.network.setStatus("unsatisfied"); second.environment.adapters.network.setStatus("requiresConnection");
  firstView.unmount();
  expect(first.environment.adapters.network.activeMonitorCount()).toBe(0); expect(second.environment.adapters.network.activeMonitorCount()).toBe(1);
  flush(); expect(received.map(listener => listener.mock.calls.length)).toEqual([1, 2]); expect(held[1].NWFXPathMonitor.currentPath.status).toBe("requiresConnection");
  const old = held[0]; expect(() => old.NWFXPathMonitor.start()).toThrow(); expect(old.SPFXSpeechRecognizer.isAvailable).toBe(false);
  expect(() => old.CNFXContactStore.requestAccess("contacts", vi.fn())).toThrow(); expect(() => old.PKFXPaymentAuthorizationController.present()).toThrow();
  expect(() => old.NFXNDEFReaderSession.begin()).toThrow(); expect(() => old.BTFXCentralManager.scanForPeripherals(null)).toThrow(); expect(() => old.XRFXSession.run(new XRFXOrientationTrackingConfiguration())).toThrow();
  secondView.unmount(); expect(second.environment.adapters.network.activeMonitorCount()).toBe(0);
});

it("keeps discarded real-mount renders passive, including Bluetooth and XR lifetime subscriptions", async () => {
  const value = fixture(); let discarded = 0;
  await value.runtime.identity.session.refresh();
  const pending = new Promise<never>(() => {});
  function Suspended(): React.ReactNode {
    const context = useSynWareContext()!;
    const session = scosSessionsForApp(appId).find(candidate => candidate.context.signal === context.signal)!;
    // Dispatch owns its session queue independently of a component's objects.
    void dispatchQueueForSession(session).main;
    const additions = vi.spyOn(context.signal, "addEventListener");
    const before = additions.mock.calls.length;
    useOwners();
    expect(additions.mock.calls.length).toBe(before);
    discarded++; throw pending;
  }
  render(<Mount value={value}><Suspense fallback={null}><Suspended /></Suspense></Mount>);
  expect(discarded).toBeGreaterThan(0); expect(value.environment.adapters.network.activeMonitorCount()).toBe(0);
  for (const name of ["speech", "contacts", "payment", "nfc", "bluetooth", "xr"] as const) expect(value.environment.adapters[name].calls()).toHaveLength(0);
});
