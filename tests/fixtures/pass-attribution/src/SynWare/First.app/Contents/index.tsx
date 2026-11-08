import { NSEApplication } from "@syndromatic/syncloudos";
import { NSEDecimalNumber } from "@syndromatic/syncloudos/foundation";
import { PKFXPaymentAuthorizationController, PKFXPaymentRequest, PKFXPaymentSummaryItem, PKFXPayment, PKFXPaymentAuthorizationResult, PKFXError } from "@syndromatic/syncloudos/fx/pass";
export { PKFXPaymentAuthorizationController, PKFXPayment, PKFXPaymentAuthorizationResult, PKFXError };
export function request() { const value = new PKFXPaymentRequest(); Object.assign(value, { merchantIdentifier: "merchant.test", countryCode: "GB", currencyCode: "GBP", supportedNetworks: ["visa"], merchantCapabilities: 1, paymentSummaryItems: [new PKFXPaymentSummaryItem("Test merchant", NSEDecimalNumber.fromString("9007199254740993.1234567890123456789"))] }); return value; }
export async function afterAwait() { await Promise.resolve(); return new PKFXPaymentAuthorizationController(request()); }
export function afterTimer() { return new Promise<PKFXPaymentAuthorizationController>(resolve => setTimeout(() => resolve(new PKFXPaymentAuthorizationController(request())), 0)); }
export function thirdParty(callback: (create: () => PKFXPaymentAuthorizationController) => void) { callback(() => new PKFXPaymentAuthorizationController(request())); }
export default class PassApplication extends NSEApplication {}
