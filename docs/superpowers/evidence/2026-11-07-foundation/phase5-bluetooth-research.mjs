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

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const result = { events: [], errors: [] };
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-experimental-web-platform-features'] });
const watchdog = setTimeout(() => { result.watchdog = true; void browser.close(); }, 20000);
const stage = text => { result.events.push({ stage: text }); console.log(text); };
let advertising;
try {
  result.version = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('http://localhost/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated Bluetooth research</title>' }));
  await page.goto('http://localhost/');
  stage('navigated');
  const browserCDP = await browser.newBrowserCDPSession();
  const pageCDP = await context.newCDPSession(page);
  const address = '09:09:09:09:09:09';
  const name = 'Isolated research battery';
  const serviceUuid = '0000180f-0000-1000-8000-00805f9b34fb';
  const characteristicUuid = '00002a19-0000-1000-8000-00805f9b34fb';
  await browserCDP.send('BluetoothEmulation.enable', { state: 'powered-on', leSupported: true });
  stage('bluetooth enabled');
  await browserCDP.send('BluetoothEmulation.simulatePreconnectedPeripheral', { address, name, manufacturerData: [], knownServiceUuids: [serviceUuid] });
  const { serviceId } = await browserCDP.send('BluetoothEmulation.addService', { address, serviceUuid });
  const { characteristicId } = await browserCDP.send('BluetoothEmulation.addCharacteristic', { serviceId, characteristicUuid, properties: { read: true, write: true, notify: true } });
  await browserCDP.send('BluetoothEmulation.addDescriptor', { characteristicId, descriptorUuid: '00002902-0000-1000-8000-00805f9b34fb' });
  result.serviceId = serviceId; result.characteristicId = characteristicId;
  stage('peripheral configured');
  const advertise = () => browserCDP.send('BluetoothEmulation.simulateAdvertisement', { entry: { deviceAddress: address, rssi: -30, scanRecord: { name, uuids: [serviceUuid], txPower: -10, appearance: 0, manufacturerData: [] } } }).catch(error => result.errors.push(`advertise: ${error.message}`));
  const selectedPrompts = new Set();
  for (const [target, session] of [['browser', browserCDP], ['page', pageCDP]]) {
    session.on('DeviceAccess.deviceRequestPrompted', event => {
      console.log('prompt', target, JSON.stringify(event));
      result.events.push({ target, event: 'prompt', ...event });
      const device = event.devices.find(device => device.id === address);
      if (device && !selectedPrompts.has(event.id)) {
        selectedPrompts.add(event.id);
        void session.send('DeviceAccess.selectPrompt', { id: event.id, deviceId: device.id }).then(() => result.events.push({ target, event: 'selected' }), error => result.errors.push(`select: ${error.message}`));
      }
      else void advertise();
    });
    session.on('BluetoothEmulation.gattOperationReceived', event => {
      result.events.push({ target, event: 'gatt', ...event });
      void session.send('BluetoothEmulation.simulateGATTOperationResponse', { ...event, code: 0 }).catch(error => result.errors.push(`gattResponse: ${error.message}`));
    });
    session.on('BluetoothEmulation.characteristicOperationReceived', event => {
      result.events.push({ target, event: 'characteristic', ...event });
      void session.send('BluetoothEmulation.simulateCharacteristicOperationResponse', { characteristicId: event.characteristicId, type: event.type, code: 0, ...(event.type === 'read' ? { data: Buffer.from([42]).toString('base64') } : {}) }).catch(error => result.errors.push(`characteristicResponse: ${error.message}`));
    });
    stage(`enabling DeviceAccess ${target}`);
    try { await session.send('DeviceAccess.enable'); result.events.push({ target, event: 'DeviceAccess.enabled' }); }
    catch (error) { result.events.push({ target, event: 'DeviceAccess.unavailable', error: error.message }); }
  }
  await page.evaluate(() => {
    window.steps = [];
    document.addEventListener('pointerdown', async () => {
      try {
        window.steps.push('request');
        const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['battery_service'] }] });
        window.steps.push('selected');
        const server = await device.gatt.connect();
        window.steps.push('connected');
        const services = await server.getPrimaryServices();
        window.steps.push(`services:${services.length}`);
        const characteristics = await services[0].getCharacteristics();
        window.steps.push(`characteristics:${characteristics.length}`);
        const view = await characteristics[0].readValue();
        window.steps.push('read');
        await characteristics[0].writeValueWithResponse(new Uint8Array([17]));
        window.steps.push('wrote');
        await characteristics[0].startNotifications();
        window.steps.push('notifications-started');
        await characteristics[0].stopNotifications();
        server.disconnect();
        window.outcome = { ok: true, name: device.name, read: [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)], disconnected: !server.connected };
      } catch (error) { window.outcome = { ok: false, name: error.name, message: error.message }; }
    }, { once: true });
  });
  stage('gesture listener installed');
  await page.mouse.click(2, 2);
  stage('clicked');
  await advertise();
  advertising = setInterval(() => void advertise(), 250);
  try { await page.waitForFunction(() => window.outcome, undefined, { timeout: 12000 }); }
  catch { result.timeout = true; }
  result.native = await page.evaluate(() => ({ steps: window.steps, outcome: window.outcome ?? null }));
} catch (error) { result.error = error.message; }
finally { clearInterval(advertising); clearTimeout(watchdog); await browser.close(); }
console.log(JSON.stringify(result, null, 2));
await writeFile(new URL('./phase5-bluetooth-research-results.json', import.meta.url), JSON.stringify(result, null, 2));
