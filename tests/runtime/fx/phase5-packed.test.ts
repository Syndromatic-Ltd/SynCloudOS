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
import { NSEData, NSEDecimalNumber } from '@syndromatic/syncloudos/foundation';
import * as bluetooth from '@syndromatic/syncloudos/fx/bluetooth';
import { NFXNDEFMessage, NFXNDEFPayload } from '@syndromatic/syncloudos/fx/nfc';
import * as speech from '@syndromatic/syncloudos/fx/speech';
import { CNFXContact, CNFXContactPickerViewController } from '@syndromatic/syncloudos/fx/contacts';
import { PKFXPaymentRequest } from '@syndromatic/syncloudos/fx/pass';
import { XRFXConfiguration } from '@syndromatic/syncloudos/fx/xr';
import { useBluetooth, useNFC, useSpeech, useContacts, usePayment, useXR } from '@syndromatic/syncloudos/sdk';
for (const hook of [useBluetooth,useNFC,useSpeech,useContacts,usePayment,useXR]) assert.equal(typeof hook,'function');
const message=new NFXNDEFMessage([new NFXNDEFPayload(5,NSEData.from(new Uint8Array()),NSEData.from(new Uint8Array()),NSEData.from(new Uint8Array([42])))]);
assert.ok(message.records[0].payload instanceof NSEData);
assert.equal(message.records[0].payload.bytes[0],42);
const contact=new CNFXContact();assert.ok(Object.isFrozen(contact));
assert.equal(typeof CNFXContactPickerViewController,'function');
const request=new PKFXPaymentRequest();
request.applicationData=NSEData.from(new Uint8Array([1,2]));
assert.equal(request.applicationData.count,2);
assert.equal(new XRFXConfiguration().referenceSpace,'viewer');
console.log('phase5 installed exports passed');
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("phase5 installed exports passed");
  writeFileSync(join(consumer.root, "consumer.ts"), `
import type { BTFXCentralManager } from '@syndromatic/syncloudos/fx/bluetooth';
import type { NFXNDEFReaderSession, NFXNDEFReaderSessionDelegate } from '@syndromatic/syncloudos/fx/nfc';
import type { SPFXSpeechRecognizer } from '@syndromatic/syncloudos/fx/speech';
import type { CNFXContactStore } from '@syndromatic/syncloudos/fx/contacts';
import type { PKFXPaymentAuthorizationController, PKFXPaymentRequest } from '@syndromatic/syncloudos/fx/pass';
import type { XRFXClient, XRFXSession } from '@syndromatic/syncloudos/fx/xr';
import { useBluetooth, useNFC, useSpeech, useContacts, usePayment, useXR, useSCOS } from '@syndromatic/syncloudos/sdk';
const bluetooth:()=>BTFXCentralManager=useBluetooth;
const nfc:(delegate:NFXNDEFReaderSessionDelegate)=>NFXNDEFReaderSession=useNFC;
const speech:()=>SPFXSpeechRecognizer=useSpeech;
const contacts:()=>CNFXContactStore=useContacts;
const payment:(request:PKFXPaymentRequest)=>PKFXPaymentAuthorizationController=usePayment;
const xr:()=>XRFXSession=useXR;
function session() { const app=useSCOS(); const clients:[XRFXClient]=[app.xr];return clients; }
void [bluetooth,nfc,speech,contacts,payment,xr,session];
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: true }, files: ["consumer.ts"] }));
  expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
// A cold npm installation can exceed two minutes while the shared Windows jobs are building.
}, 600000);
