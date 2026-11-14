#!/usr/bin/env node
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

import assert from "node:assert/strict";
import { parseConsumerArgs, runInstalledAppBrowserCheck } from "./check-fx-app-browser-harness.mjs";

const appInfoSource = `export default {
  bundleIdentifier: "org.example.device-fx-probe",
  displayName: "Device FX Probe",
  version: "1.0.0",
  entitlements: [
    "network.read",
    "bluetooth.access",
    "nfc.read",
    "speech.recognize",
    "contacts.select",
    "payment.request",
    "xr.session",
  ],
  routes: [{ path: "/device-probe", primary: true }],
};
`;

const appSource = `import { useEffect, useMemo } from "react";
import { NSEApplication, NSEViewController } from "@syndromatic/syncloudos";
import { NSEDecimalNumber } from "@syndromatic/syncloudos/foundation";
import {
  useBluetooth,
  useContacts,
  useNetwork,
  useNFC,
  usePayment,
  useSpeech,
  useXR,
} from "@syndromatic/syncloudos/sdk";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { NWFXError, NWFXPathMonitor } from "@syndromatic/syncloudos/fx/network";
import { BTFXCentralManager } from "@syndromatic/syncloudos/fx/bluetooth";
import { NFXNDEFReaderSession, type NFXNDEFReaderSessionDelegate } from "@syndromatic/syncloudos/fx/nfc";
import { SPFXSpeechRecognizer } from "@syndromatic/syncloudos/fx/speech";
import { CNFXContactStore, CNFXEntityType } from "@syndromatic/syncloudos/fx/contacts";
import {
  PKFXError,
  PKFXMerchantCapability,
  PKFXPaymentAuthorizationController,
  PKFXPaymentRequest,
  PKFXPaymentSummaryItem,
} from "@syndromatic/syncloudos/fx/pass";
import {
  XRFXOrientationTrackingConfiguration,
  XRFXSession,
  XRFXWorldTrackingConfiguration,
} from "@syndromatic/syncloudos/fx/xr";

export {
  NWFXPathMonitor,
  BTFXCentralManager,
  NFXNDEFReaderSession,
  SPFXSpeechRecognizer,
  CNFXContactStore,
  PKFXPaymentAuthorizationController,
  XRFXSession,
};

declare global {
  interface Window {
    fxDeviceHooks?: {
      mounted: boolean;
      networkHookBound: boolean;
      bluetoothHookBound: boolean;
      nfcHookBound: boolean;
      speechHookBound: boolean;
      contactsHookBound: boolean;
      passHookBound: boolean;
      xrHookBound: boolean;
    };
  }
}

function makePaymentRequest(): PKFXPaymentRequest {
  const request = new PKFXPaymentRequest();
  request.merchantIdentifier = "merchant.org.example.probe";
  request.countryCode = "GB";
  request.currencyCode = "GBP";
  request.supportedNetworks = ["visa"];
  request.merchantCapabilities = PKFXMerchantCapability.threeDSecure;
  request.paymentSummaryItems = [new PKFXPaymentSummaryItem("Probe", NSEDecimalNumber.one)];
  return request;
}

function DeviceProbeView() {
  const network = useNetwork();
  const bluetooth = useBluetooth();
  const nfcDelegate = useMemo<NFXNDEFReaderSessionDelegate>(() => ({
    readerSessionDidInvalidateWithError() {},
  }), []);
  const nfc = useNFC(nfcDelegate);
  const speech = useSpeech();
  const contacts = useContacts();
  const paymentRequest = useMemo(() => makePaymentRequest(), []);
  const payment = usePayment(paymentRequest);
  const xr = useXR();

  useEffect(() => {
    window.fxDeviceHooks = {
      mounted: true,
      networkHookBound: network instanceof NWFXPathMonitor,
      bluetoothHookBound: bluetooth instanceof BTFXCentralManager,
      nfcHookBound: nfc instanceof NFXNDEFReaderSession,
      speechHookBound: speech instanceof SPFXSpeechRecognizer,
      contactsHookBound: contacts instanceof CNFXContactStore,
      passHookBound: payment instanceof PKFXPaymentAuthorizationController,
      xrHookBound: xr instanceof XRFXSession,
    };
  }, [network, bluetooth, nfc, speech, contacts, payment, xr]);

  return <p id="device-probe">Device FX probe</p>;
}

class DeviceProbeViewController extends NSEViewController {
  static override view = DeviceProbeView;
}

export async function runDeviceFamilyChecks() {
  const expectedOnlineStatus = navigator.onLine ? "satisfied" : "unsatisfied";
  const monitor = new NWFXPathMonitor();
  const observedPath = await new Promise<{ status: string; unsupportedInterfacesErrorCode: number | null }>((resolve, reject) => {
    monitor.pathUpdateHandler = (path) => {
      let unsupportedInterfacesErrorCode: number | null = null;
      try {
        void path.availableInterfaces;
      } catch (error) {
        if (error instanceof NWFXError && error.code === "posix") unsupportedInterfacesErrorCode = error.error;
      }
      monitor.cancel();
      resolve({ status: path.status, unsupportedInterfacesErrorCode });
    };
    try {
      monitor.start(DFXQueue.main);
    } catch (error) {
      reject(error);
    }
  });
  const networkCancelledThrows = (() => {
    try {
      void monitor.currentPath;
      return false;
    } catch (error) {
      return error instanceof NWFXError;
    }
  })();

  const bluetoothAuthorization = BTFXCentralManager.authorization;
  const bluetoothManager = new BTFXCentralManager();
  const bluetoothState = bluetoothManager.state;

  const nfcReadingAvailable = NFXNDEFReaderSession.readingAvailable;
  const nfcInvalidationError = await new Promise<string | null>((resolve) => {
    const session = new NFXNDEFReaderSession({
      readerSessionDidInvalidateWithError(_session, error) {
        resolve(error instanceof Error ? error.message : String(error));
      },
    });
    session.begin();
  });

  const speechStatus = SPFXSpeechRecognizer.authorizationStatus();
  const speechRequested = await new Promise<string>((resolve) => {
    SPFXSpeechRecognizer.requestAuthorization(status => resolve(status));
  });
  const speechRecognizer = new SPFXSpeechRecognizer(new Intl.Locale("en-GB"));
  const speechAvailable = speechRecognizer.isAvailable;

  const contactsStatus = CNFXContactStore.authorizationStatus(CNFXEntityType.contacts);
  const contactStore = new CNFXContactStore();
  const contactsAccess = await new Promise<{ granted: boolean; code: string | null }>((resolve) => {
    contactStore.requestAccess(CNFXEntityType.contacts, (granted, error) => {
      resolve({ granted, code: error?.code ?? null });
    });
  });

  const passCanMakePayments = PKFXPaymentAuthorizationController.canMakePayments();
  const paymentController = new PKFXPaymentAuthorizationController(makePaymentRequest());
  const passPresentFailedCleanly = (() => {
    try {
      paymentController.present();
      return false;
    } catch (error) {
      return error instanceof PKFXError;
    }
  })();

  const xrWorldSupported = await XRFXWorldTrackingConfiguration.isSupported;
  const xrOrientationSupported = await XRFXOrientationTrackingConfiguration.isSupported;
  const xrSession = new XRFXSession();
  xrSession.pause();

  return {
    network: {
      expectedOnlineStatus,
      ...observedPath,
      networkCancelledThrows,
    },
    bluetooth: {
      authorization: bluetoothAuthorization,
      state: bluetoothState,
    },
    nfc: {
      readingAvailable: nfcReadingAvailable,
      invalidationDelivered: typeof nfcInvalidationError === "string" && nfcInvalidationError.length > 0,
    },
    speech: {
      status: speechStatus,
      requested: speechRequested,
      isAvailable: speechAvailable,
      locale: speechRecognizer.locale.baseName,
    },
    contacts: {
      status: contactsStatus,
      requestAccess: contactsAccess,
    },
    pass: {
      canMakePayments: passCanMakePayments,
      presentFailedCleanly: passPresentFailedCleanly,
    },
    xr: {
      worldSupported: xrWorldSupported,
      orientationSupported: xrOrientationSupported,
      hasSession: xrSession instanceof XRFXSession,
    },
    verifyEnded() {
      try {
        new NWFXPathMonitor();
        return false;
      } catch (error) {
        return error instanceof NWFXError;
      }
    },
  };
}

export default class DeviceProbe extends NSEApplication {
  static override mainViewController = DeviceProbeViewController;
}
`;

const mainSource = `import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import { NSEDecimalNumber } from "@syndromatic/syncloudos/foundation";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { NWFXPathMonitor as BaseMonitor } from "@syndromatic/syncloudos/fx/network";
import { BTFXCentralManager as BaseCentral } from "@syndromatic/syncloudos/fx/bluetooth";
import { NFXNDEFReaderSession as BaseNFC } from "@syndromatic/syncloudos/fx/nfc";
import { SPFXSpeechRecognizer as BaseSpeech } from "@syndromatic/syncloudos/fx/speech";
import { CNFXContactStore as BaseContacts } from "@syndromatic/syncloudos/fx/contacts";
import {
  PKFXPaymentAuthorizationController as BasePayment,
  PKFXMerchantCapability,
  PKFXPaymentRequest,
  PKFXPaymentSummaryItem,
} from "@syndromatic/syncloudos/fx/pass";
import { XRFXSession as BaseXR } from "@syndromatic/syncloudos/fx/xr";
import {
  BTFXCentralManager,
  CNFXContactStore,
  NFXNDEFReaderSession,
  NWFXPathMonitor,
  PKFXPaymentAuthorizationController,
  SPFXSpeechRecognizer,
  XRFXSession,
  runDeviceFamilyChecks,
} from "./SynWare/DeviceProbe.app/Contents/index";

declare global {
  interface Window {
    fxDeviceProbe?: Record<string, unknown>;
  }
}

function rejectsOutsideApp(construct: () => unknown): boolean {
  try {
    construct();
    return false;
  } catch {
    return true;
  }
}

async function run() {
  const samplePayment = new PKFXPaymentRequest();
  samplePayment.merchantIdentifier = "merchant.org.example.outside";
  samplePayment.countryCode = "GB";
  samplePayment.currencyCode = "GBP";
  samplePayment.supportedNetworks = ["visa"];
  samplePayment.merchantCapabilities = PKFXMerchantCapability.threeDSecure;
  samplePayment.paymentSummaryItems = [new PKFXPaymentSummaryItem("Outside", NSEDecimalNumber.one)];

  const unattributedRejected = {
    network: rejectsOutsideApp(() => new BaseMonitor()),
    bluetooth: rejectsOutsideApp(() => new BaseCentral()),
    nfc: rejectsOutsideApp(() => new BaseNFC({ readerSessionDidInvalidateWithError() {} })),
    speech: rejectsOutsideApp(() => new BaseSpeech()),
    contacts: rejectsOutsideApp(() => new BaseContacts()),
    pass: rejectsOutsideApp(() => new BasePayment(samplePayment)),
    xr: rejectsOutsideApp(() => new BaseXR()),
  };

  const distinctBoundClasses = {
    network: NWFXPathMonitor !== BaseMonitor,
    bluetooth: BTFXCentralManager !== BaseCentral,
    nfc: NFXNDEFReaderSession !== BaseNFC,
    speech: SPFXSpeechRecognizer !== BaseSpeech,
    contacts: CNFXContactStore !== BaseContacts,
    pass: PKFXPaymentAuthorizationController !== BasePayment,
    xr: XRFXSession !== BaseXR,
  };

  const host = await mountSynCloudOS({
    element: document.getElementById("root")!,
    application: { bundleIdentifier: "org.example.device-fx-probe" },
    authentication: "disabled",
    deploymentBasePath: import.meta.env.BASE_URL,
  });

  const checks = await runDeviceFamilyChecks();
  await new Promise(resolve => setTimeout(resolve, 25));
  const hooks = window.fxDeviceHooks ?? null;
  await host.dispose("Device FX installed browser verification");
  const endedAfterDispose = checks.verifyEnded();

  window.fxDeviceProbe = {
    ready: true,
    base: import.meta.env.BASE_URL,
    unattributedRejected,
    distinctBoundClasses,
    hooks,
    checks,
    endedAfterDispose,
  };
}

run().catch(error => {
  window.fxDeviceProbe = {
    ready: false,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});
`;

async function main() {
  const { base, keep } = parseConsumerArgs();
  const evidence = await runInstalledAppBrowserCheck({
    prefix: "synware-fx-device-",
    receiptFileName: base === "/" ? "fx-device-families-consumer.json" : "fx-device-families-nested-consumer.json",
    base,
    keep,
    files: {
      "src/SynWare/DeviceProbe.app/Contents/Info.ts": appInfoSource,
      "src/SynWare/DeviceProbe.app/Contents/index.tsx": appSource,
      "src/main.tsx": mainSource,
    },
    async verifyPage({ engine, page }) {
      await page.waitForFunction(() => Boolean(window.fxDeviceProbe?.ready || window.fxDeviceProbe?.error), { timeout: 30_000 });
      const result = await page.evaluate(() => window.fxDeviceProbe);
      assert.equal(result.error ?? null, null, `${engine} device families probe failed: ${result.error}`);
      assert.equal(result.ready, true, `${engine} device families probe did not reach ready state.`);
      assert.equal(result.base, base, `${engine} served unexpected BASE_URL.`);
      assert.deepEqual(result.unattributedRejected, {
        network: true,
        bluetooth: true,
        nfc: true,
        speech: true,
        contacts: true,
        pass: true,
        xr: true,
      }, `${engine} must reject unattributed construction outside .app bundles.`);
      assert.deepEqual(result.distinctBoundClasses, {
        network: true,
        bluetooth: true,
        nfc: true,
        speech: true,
        contacts: true,
        pass: true,
        xr: true,
      }, `${engine} must bind distinct per-app classes for every attributed FX family.`);
      assert.deepEqual(result.hooks, {
        mounted: true,
        networkHookBound: true,
        bluetoothHookBound: true,
        nfcHookBound: true,
        speechHookBound: true,
        contactsHookBound: true,
        passHookBound: true,
        xrHookBound: true,
      }, `${engine} React FX hooks must return app-bound instances.`);
      assert.equal(result.checks.network.status, result.checks.network.expectedOnlineStatus);
      assert.equal(result.checks.network.unsupportedInterfacesErrorCode, 45);
      assert.equal(result.checks.network.networkCancelledThrows, true);
      assert.equal(typeof result.checks.bluetooth.authorization, "string");
      assert.equal(typeof result.checks.bluetooth.state, "string");
      assert.equal(result.checks.nfc.readingAvailable, false);
      assert.equal(result.checks.nfc.invalidationDelivered, true);
      assert.equal(result.checks.speech.requested, "restricted");
      assert.equal(result.checks.speech.isAvailable, false);
      assert.deepEqual(result.checks.contacts.requestAccess, { granted: false, code: "featureNotAvailable" });
      assert.equal(result.checks.pass.canMakePayments, false);
      assert.equal(result.checks.pass.presentFailedCleanly, true);
      assert.equal(typeof result.checks.xr.worldSupported, "boolean");
      assert.equal(typeof result.checks.xr.orientationSupported, "boolean");
      assert.equal(result.checks.xr.hasSession, true);
      assert.equal(result.endedAfterDispose, true, `${engine} must fail attributed FX construction after host disposal.`);
      return result;
    },
  });
  console.log(`FX device-families installed browser consumer passed (${Object.keys(evidence.browsers).join(", ")}) at base ${evidence.base}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
