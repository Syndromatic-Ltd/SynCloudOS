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
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import sharp from "sharp";
import { createServer as createNetServer } from "node:net";

const evidence = resolve("docs/superpowers/evidence/2026-11-07-foundation");
const report = { checkedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim(), browserMode: "Full headless Chromium; SwiftShader WebGL; virtual Bluetooth/SPC", families: {}, errors: [] };
const allocation = createNetServer();
await new Promise(resolve => allocation.listen(0, "127.0.0.1", resolve));
const allocatedPort = allocation.address().port;
await new Promise(resolve => allocation.close(resolve));
assert.ok(![5173, 5199, 5210, 5387].includes(allocatedPort));
report.port = allocatedPort;
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: allocatedPort, strictPort: true }, optimizeDeps: { noDiscovery: true, include: [] }, logLevel: "error" });
server.middlewares.use((request, response, next) => {
  if (request.url === "/phase5") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><html><body></body></html>"); }
  else next();
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--enable-experimental-web-platform-features", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-features=SecurePaymentConfirmation,SecurePaymentConfirmationDebug,SecurePaymentConfirmationCredentialDiscoveryMode:mode/database-only,WebBluetoothNewPermissionsBackend", "--disable-features=SecurePaymentConfirmationStoreCredentialsInOS", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  report.chromium = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  const origin = `http://localhost:${server.httpServer.address().port}`;
  await page.route(origin + "/**", async route => {
    const requested = new URL(route.request().url());
    if (requested.pathname === "/phase5") return route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><body></body></html>"});
    const response = await fetch(`http://127.0.0.1:${allocatedPort}${requested.pathname}${requested.search}`);
    await route.fulfill({status:response.status,contentType:response.headers.get("content-type") ?? "text/javascript",body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(`${origin}/phase5`);
  await page.evaluate(async () => {
    const base = "/src/SynCloudOS/PlatformAdapters/";
    const [bt, nfc, speech, contacts, payment, xr, pass, xrfx] = await Promise.all([
      import(base + "BrowserBluetoothAdapter.ts"), import(base + "BrowserNFCAdapter.ts"), import(base + "BrowserSpeechAdapter.ts"),
      import(base + "BrowserContactsAdapter.ts"), import(base + "BrowserPaymentAdapter.ts"), import(base + "BrowserXRAdapter.ts"),
      import("/src/FX/PassFX/public.ts"), import("/src/FX/XRFX/public.ts"),
    ]);
    globalThis.phase5 = {
      bt: new bt.BrowserBluetoothAdapter({ isSecureContext, browserNavigator: { bluetooth: navigator.bluetooth && {
        requestDevice: options => navigator.bluetooth.requestDevice(options).then(device => { globalThis.phase5NativeBTDevice = device; return device; }),
        ...(navigator.bluetooth.getDevices ? {getDevices: () => navigator.bluetooth.getDevices()} : {}),
      } } }),
      nfc: new nfc.BrowserNFCAdapter({ isSecureContext, NDEFReader: globalThis.NDEFReader, permissions: navigator.permissions }),
      speech: new speech.BrowserSpeechAdapter({ isSecureContext, browserWindow: window }),
      contacts: new contacts.BrowserContactsAdapter({ isSecureContext, browserNavigator: navigator }),
      payment: new payment.BrowserPaymentAdapter({ isSecureContext, PaymentRequest: globalThis.PaymentRequest }),
      xr: new xr.BrowserXRAdapter({ isSecureContext, browserNavigator: navigator, createRenderingLayer: xr.createBrowserXRRenderingLayerFactory(window) }),
      PKFXPaymentRequest: pass.PKFXPaymentRequest, XRFXConfiguration: xrfx.XRFXConfiguration,
    };
  });
  const cdp = await context.newCDPSession(page);
  const btCdp = await browser.newBrowserCDPSession();
  const iconURL = "data:image/png;base64," + (await sharp({create:{width:32,height:32,channels:4,background:"#336699"}}).png().toBuffer()).toString("base64");
  await page.evaluate(icon => {phase5.iconURL=icon;}, iconURL);
  async function gesture(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, userGesture: true, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  report.capabilities = await page.evaluate(() => Object.fromEntries(["bt", "nfc", "speech", "contacts", "payment", "xr"].map(key => [key, phase5[key].getCapabilities()])));
  let advertising;
  try {
    await btCdp.send("BluetoothEmulation.enable", { state: "powered-on", leSupported: true });
    await cdp.send("DeviceAccess.enable");
    const address = "09:09:09:09:09:09", serviceUuid = "0000180f-0000-1000-8000-00805f9b34fb";
    await btCdp.send("BluetoothEmulation.simulatePreconnectedPeripheral", { address, name: "SynCloudOS phase5 battery", manufacturerData: [], knownServiceUuids: [serviceUuid] });
    const { serviceId } = await btCdp.send("BluetoothEmulation.addService", { address, serviceUuid });
    const { characteristicId } = await btCdp.send("BluetoothEmulation.addCharacteristic", { serviceId, characteristicUuid: "00002a19-0000-1000-8000-00805f9b34fb", properties: { read: true, write: true, notify: true } });
    await btCdp.send("BluetoothEmulation.addDescriptor", { characteristicId, descriptorUuid: "00002902-0000-1000-8000-00805f9b34fb" });
    const writes = [], operations = [];
    const selected = new Set();
    const advertise = () => btCdp.send("BluetoothEmulation.simulateAdvertisement", { entry: { deviceAddress: address, rssi: -30,
      scanRecord: { name: "SynCloudOS phase5 battery", uuids: [serviceUuid], txPower: -10, appearance: 0, manufacturerData: [] } } }).catch(error => report.errors.push(error.message));
    cdp.on("DeviceAccess.deviceRequestPrompted", event => {
      const target = event.devices.find(device => device.id === address || device.name === "SynCloudOS phase5 battery");
      if (target && !selected.has(event.id)) {
        selected.add(event.id);
        void cdp.send("DeviceAccess.selectPrompt", { id: event.id, deviceId: target.id }).catch(error => report.errors.push(error.message));
      } else if (!target) void advertise();
    });
    btCdp.on("BluetoothEmulation.gattOperationReceived", event => {
      operations.push(event.type);
      void btCdp.send("BluetoothEmulation.simulateGATTOperationResponse", { ...event, code: 0 }).catch(error => report.errors.push(error.message));
    });
    btCdp.on("BluetoothEmulation.characteristicOperationReceived", event => {
      operations.push(event.type); if (event.data) writes.push(event.data);
      void btCdp.send("BluetoothEmulation.simulateCharacteristicOperationResponse", { characteristicId: event.characteristicId, type: event.type, code: 0, ...(event.type === "read" ? { data: Buffer.from([42]).toString("base64") } : {}) }).catch(error => report.errors.push(error.message));
    });
    const request = gesture(`(async()=>{
      const manager = phase5.bt.createCentralManager();
      const peripheral = await manager.requestAuthorization({ filters: [{ services: ['battery_service'] }] });
      await peripheral.connect();
      const services = await peripheral.discoverServices();
      const characteristics = await services[0].discoverCharacteristics();
      const read = [...(await characteristics[0].readValue()).bytes];
      await characteristics[0].writeValue(new Uint8Array([17]));
      await characteristics[0].setNotifyValue(true, () => {});
      await characteristics[0].setNotifyValue(false);
      const authorization = await manager.getAuthorizationStatus();
      manager.dispose();
      return { read, authorization, disconnected: !peripheral.isConnected, nativeDisconnected: !globalThis.phase5NativeBTDevice.gatt.connected, services: services.length, characteristics: characteristics.length };
    })()`);
    await advertise(); advertising = setInterval(() => void advertise(), 250);
    const value = await Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(new Error("Bluetooth emulation timeout")), 18000))]);
    assert.deepEqual(value.read, [42]); assert.equal(value.disconnected, true); assert.equal(value.nativeDisconnected, true);
    report.families.bluetooth = { status: "verified-emulated", ...value, operations, writes, characteristicId };
  } catch (error) { report.families.bluetooth = { status: "failed", error: String(error) }; }
  finally { clearInterval(advertising); }
  for (const key of ["nfc", "contacts"]) {
    report.families[key] = await page.evaluate(async key => {
      const owner = key === "nfc" ? phase5.nfc.createReaderSession() : phase5.contacts.createContactStore();
      const authorization = await owner.getAuthorizationStatus();
      let error;
      try { if (key === "nfc") await owner.scan(() => {}); else await owner.requestAccess(); }
      catch (value) { error = value.name; }
      owner.dispose();
      return { status: "verified-availability-only", authorization, error };
    }, key);
  }
  try {
    report.families.speech = await gesture(`(async()=>{
      const recognizer = phase5.speech.createRecognizer();
      const task = recognizer.recognitionTask({ locale: 'en-GB' });
      const outcome = await Promise.race([task.result.then(value=>({result:value}),error=>({error:error.name,message:error.message})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),5000))]);
      recognizer.dispose();return {status:'verified-browser-start-only',...outcome};
    })()`);
  } catch (error) { report.families.speech = { status: "failed", error: String(error) }; }
  try {
    report.families.xr = await gesture(`(async()=>{
      const session = phase5.xr.createSession();
      const configuration = new phase5.XRFXConfiguration();
      const supported = await session.isSupported(configuration);
      if (!supported) { session.dispose(); return {status:'verified-unavailable',supported}; }
      let frames=0, first;
      await session.run(configuration, frame=>{frames++;first??=frame;});
      await new Promise(resolve=>setTimeout(resolve,500));
      await session.pause();session.dispose();
      return {status:frames?'verified-live-inline':'failed-no-frames',supported,frames,first};
    })()`);
  } catch (error) { report.families.xr = { status: "failed", error: String(error) }; }
  try {
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await cdp.send("Page.setSPCTransactionMode", { mode: "autoAccept" });
    const registration = await gesture(`(async()=>{
      const credential = await navigator.credentials.create({publicKey:{rp:{id:'localhost',name:'SynCloudOS test'},user:{id:new Uint8Array([1,2,3]),name:'phase5@example.test',displayName:'Phase 5'},challenge:new Uint8Array(32).fill(1),pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'},extensions:{payment:{isPayment:true}}}});
      phase5.credentialId=credential.rawId;return {id:credential.id};
    })()`);
    report.families.payment = await gesture(`(async()=>{
      const request = new phase5.PKFXPaymentRequest({currencyCode:'GBP',paymentSummaryItems:[{label:'SynCloudOS test only',amount:'0.01'}],paymentMethodData:[{supportedMethods:'secure-payment-confirmation',data:{action:'authenticate',credentialIds:[phase5.credentialId],challenge:new Uint8Array(32).fill(2),rpId:'localhost',instrument:{displayName:'Virtual test instrument',icon:phase5.iconURL},payeeName:'SynCloudOS test only',payeeOrigin:'https://phase5-payee.example',timeout:10000}}]});
      const controller = phase5.payment.createAuthorizationController(request);
      const statusBefore = await controller.getAuthorizationStatus();
      const payment = await controller.present();
      const result={status:'verified-SPC-emulation',statusBefore,methodName:payment.methodName,signatureBytes:payment.details.response.signature.count,rawIdBytes:payment.details.rawId.count};
      await payment.complete('success');controller.dispose();return result;
    })()`);
    report.families.payment.registration = registration;
    report.families.payment.virtualAuthenticator = authenticatorId;
  } catch (error) { report.families.payment = { status: "failed", error: String(error) }; }
  await context.close();
} finally {
  await browser.close(); await server.close();
  writeFileSync(resolve(evidence, "phase5-browser-results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length || report.families.bluetooth?.status !== "verified-emulated" || report.families.xr?.status !== "verified-live-inline" || report.families.payment?.status !== "verified-SPC-emulation") process.exitCode = 1;
}
