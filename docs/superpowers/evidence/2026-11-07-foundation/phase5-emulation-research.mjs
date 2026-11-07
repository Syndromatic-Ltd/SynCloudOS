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
import sharp from 'sharp';

const iconURL = 'data:image/png;base64,' + (await sharp({ create: { width: 32, height: 32, channels: 4, background: '#336699' } }).png().toBuffer()).toString('base64');

const results = [];
for (const channel of [undefined, 'chromium']) {
  const result = { channel: channel ?? 'default-headless-shell', calls: [] };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel, args: [
      '--enable-experimental-web-platform-features',
      '--enable-features=SecurePaymentConfirmation,SecurePaymentConfirmationDebug,SecurePaymentConfirmationCredentialDiscoveryMode:mode/database-only',
      '--disable-features=SecurePaymentConfirmationStoreCredentialsInOS',
    ] });
    result.version = browser.version();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.route('http://localhost/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated SPC research</title>' }));
    await page.goto('http://localhost/');
    result.features = await page.evaluate(() => ({ secure: isSecureContext, paymentRequest: typeof PaymentRequest, bluetooth: typeof navigator.bluetooth, publicKeyCredential: typeof PublicKeyCredential }));
    for (const [target, session] of [['browser', await browser.newBrowserCDPSession()], ['page', await context.newCDPSession(page)]]) {
      for (const [method, params] of [
        ['Browser.getVersion', {}],
        ['Page.setSPCTransactionMode', { mode: 'autoAccept' }],
        ['BluetoothEmulation.enable', { state: 'powered-on', leSupported: true }],
        ['WebAuthn.enable', { enableUI: false }],
        ['WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } }],
      ]) {
        try { result.calls.push({ target, method, ok: true, value: await session.send(method, params) }); }
        catch (error) { result.calls.push({ target, method, ok: false, error: error.message }); }
      }
      if (target === 'page') {
        result.enrollment = await page.evaluate(async () => {
          const timeout = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 6000));
          const work = (async () => {
            try {
              const credential = await navigator.credentials.create({ publicKey: {
                rp: { id: location.hostname, name: 'Research RP' },
                user: { id: new Uint8Array([1]), name: 'test@example.test', displayName: 'Research Test' },
                challenge: new Uint8Array([1, 2, 3]), pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
                timeout: 4000, extensions: { payment: { isPayment: true } },
              } });
              window.credentialId = credential.rawId;
              return { ok: true, id: credential.id, bytes: credential.rawId.byteLength, extensions: credential.getClientExtensionResults() };
            } catch (error) { return { ok: false, name: error.name, error: error.message }; }
          })();
          return Promise.race([work, timeout]);
        });
        result.payment = await page.evaluate(async iconURL => {
          try {
            const request = new PaymentRequest([{ supportedMethods: 'secure-payment-confirmation', data: {
              action: 'authenticate', credentialIds: [window.credentialId ?? new Uint8Array([1])], challenge: new Uint8Array([4, 5, 6]),
              rpId: location.hostname, instrument: { displayName: 'Virtual test instrument', icon: iconURL },
              payeeOrigin: 'https://research-payee.example', timeout: 4000,
            } }], { total: { label: 'Research merchant', amount: { currency: 'GBP', value: '1.00' } } });
            window.paymentRequest = request;
            document.addEventListener('click', async () => {
              try {
                const response = await request.show();
                const details = { ok: true, methodName: response.methodName, detailType: response.details?.constructor?.name, rawIdBytes: response.details?.rawId?.byteLength, signatureBytes: response.details?.response?.signature?.byteLength };
                await response.complete('success');
                window.paymentResult = { ...details, completed: true };
              } catch (error) { window.paymentResult = { ok: false, name: error?.name, error: error?.message, text: String(error) }; }
            });
            return { constructed: true, canMakePayment: await request.canMakePayment().then(value => ({ ok: true, value }), error => ({ ok: false, name: error?.name, error: error?.message, text: String(error) })) };
          } catch (error) { return { constructed: false, name: error.name, error: error.message, text: String(error), stack: error.stack, type: Object.prototype.toString.call(error) }; }
        }, iconURL);
        if (result.payment.constructed) {
          await page.mouse.click(1, 1);
          try { await page.waitForFunction(() => window.paymentResult, { timeout: 6500 }); }
          catch { result.payment.timeout = true; }
          result.payment.show = await page.evaluate(() => window.paymentResult ?? null);
          if (result.payment.timeout) await page.evaluate(() => window.paymentRequest.abort().catch(() => {}));
        }
      }
    }
  } catch (error) { result.error = error.message; }
  finally { await browser?.close(); }
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(new URL('./phase5-emulation-research-results.json', import.meta.url), JSON.stringify(results, null, 2));
