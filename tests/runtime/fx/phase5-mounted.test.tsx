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

// @vitest-environment jsdom
import React from "react";
import { CNFXContactStore } from "../../../src/FX/ContactsFX/public";
import { expect, it } from "vitest";
import { createSynWare, useBluetooth, useNFC, useSpeech, useContacts, usePayment, useXR, useSCOS } from "../../../src/SynCloudOS/AppSDK";
import { createSynWareTestHost } from "../../../src/SynCloudOS/AppSDK/testing";

it("projects mounted clients and the real Speech recognizer and revokes component owners on unmount", async () => {
  let owners!: {
    bluetooth: ReturnType<typeof useBluetooth>; nfc: ReturnType<typeof useNFC>;
    speech: ReturnType<typeof useSpeech>; contacts: ReturnType<typeof useContacts>;
    payment: ReturnType<typeof usePayment>; xr: ReturnType<typeof useXR>;
    session: ReturnType<typeof useSCOS>;
  };
  const app = createSynWare({
    manifest: { schemaVersion: 1, bundleIdentifier: "com.syndromatic.phase5-probe", version: "1.0.0", displayName: "Phase 5 Probe",
      entitlements: ["bluetooth.access", "nfc.read", "nfc.write", "speech.recognize", "contacts.select", "payment.request", "xr.session"] },
    root() {
      owners = { bluetooth: useBluetooth(), nfc: useNFC(), speech: useSpeech(), contacts: useContacts(), payment: usePayment(), xr: useXR(), session: useSCOS() };
      return null;
    },
  });
  const host = createSynWareTestHost({ app, document, strictMode: true });
  host.adapters.permissions.allow(); host.adapters.policy.allow();
  await host.render();
  for (const name of ["bluetooth", "nfc", "payment", "xr"] as const)
    expect(typeof owners.session[name].getCapabilities).toBe("function");
  expect("speech" in owners.session).toBe(false);
  expect("contacts" in owners.session).toBe(false);
  expect(owners.contacts).toBeInstanceOf(CNFXContactStore);
  expect(await owners.bluetooth.getAuthorizationStatus()).toBe("unavailable");
  expect(owners.speech.isAvailable).toBe(false);
  expect(() => owners.contacts.unifiedContacts(null, [])).toThrow();
  expect(await owners.xr.getAuthorizationStatus()).toBe("unavailable");
  await host.dispose();
  expect(owners.bluetooth.getCapabilities().apiAvailable).toBe(false);
  expect(owners.xr.getCapabilities().apiAvailable).toBe(false);
  expect(owners.speech.isAvailable).toBe(false);
  expect(() => owners.contacts.unifiedContacts(null, [])).toThrow();
});
