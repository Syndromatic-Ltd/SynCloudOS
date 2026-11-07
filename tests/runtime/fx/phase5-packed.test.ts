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

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

it("loads all six new FX roots and hooks from an independently installed SDK archive", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-phase5-packed-");
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import assert from 'node:assert/strict';
import { NSEData } from '@syndromatic/syncloudos/foundation';
import * as bluetooth from '@syndromatic/syncloudos/fx/bluetooth';
import { NFXNDEFMessage } from '@syndromatic/syncloudos/fx/nfc';
import * as speech from '@syndromatic/syncloudos/fx/speech';
import { CNFXContact, CNFXContactPickerViewController } from '@syndromatic/syncloudos/fx/contacts';
import { PKFXPaymentRequest } from '@syndromatic/syncloudos/fx/pass';
import { XRFXConfiguration } from '@syndromatic/syncloudos/fx/xr';
import { useBluetooth, useNFC, useSpeech, useContacts, usePayment, useXR } from '@syndromatic/syncloudos/sdk';
for (const hook of [useBluetooth,useNFC,useSpeech,useContacts,usePayment,useXR]) assert.equal(typeof hook,'function');
const message=new NFXNDEFMessage([{recordType:'mime',mediaType:'application/octet-stream',data:new Uint8Array([42])}]);
assert.ok(message.records[0].data instanceof NSEData);
assert.equal(message.records[0].data.bytes[0],42);
const contact=new CNFXContact({displayNames:['Kavish']});assert.ok(Object.isFrozen(contact));
assert.equal(typeof CNFXContactPickerViewController,'function');
const request=new PKFXPaymentRequest({currencyCode:'GBP',paymentSummaryItems:[{label:'Test merchant',amount:'1.00'}],paymentMethodData:[{supportedMethods:'https://example.test/pay',data:{challenge:new Uint8Array([1,2])}}]});
assert.equal(request.paymentMethodData[0].data.challenge.count,2);
assert.equal(new XRFXConfiguration().referenceSpace,'viewer');
console.log('phase5 installed exports passed');
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("phase5 installed exports passed");
  writeFileSync(join(consumer.root, "consumer.ts"), `
import type { BTFXBluetoothClient, BTFXCentralManager } from '@syndromatic/syncloudos/fx/bluetooth';
import type { NFXNFCClient } from '@syndromatic/syncloudos/fx/nfc';
import type { SPFXSpeechClient, SPFXSpeechRecognizer } from '@syndromatic/syncloudos/fx/speech';
import type { CNFXContactsClient, CNFXContactStore } from '@syndromatic/syncloudos/fx/contacts';
import type { PKFXPaymentClient } from '@syndromatic/syncloudos/fx/pass';
import type { XRFXClient, XRFXSession } from '@syndromatic/syncloudos/fx/xr';
import { useBluetooth, useNFC, useSpeech, useContacts, usePayment, useXR, useSCOS } from '@syndromatic/syncloudos/sdk';
const bluetooth:()=>BTFXCentralManager=useBluetooth;
const nfc:()=>NFXNFCClient=useNFC;
const speech:()=>SPFXSpeechRecognizer=useSpeech;
const contacts:()=>CNFXContactStore=useContacts;
const payment:()=>PKFXPaymentClient=usePayment;
const xr:()=>XRFXSession=useXR;
function session() { const app=useSCOS(); const clients:[BTFXBluetoothClient,NFXNFCClient,SPFXSpeechClient,CNFXContactsClient,PKFXPaymentClient,XRFXClient]=[app.bluetooth,app.nfc,app.speech,app.contacts,app.payment,app.xr];return clients; }
void [bluetooth,nfc,speech,contacts,payment,xr,session];
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: true }, files: ["consumer.ts"] }));
  expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
// A cold npm installation can exceed two minutes while the shared Windows jobs are building.
}, 600000);
