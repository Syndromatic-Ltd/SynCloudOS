import { createSynCloudOSHostContribution } from "@syndromatic/syncloudos/browser";
import { createDeterministicRuntimeEnvironment, type SynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { SCOS, usePayment, type SynWareContextValue } from "@syndromatic/syncloudos/sdk";
import { SCOS as RootSCOS } from "@syndromatic/syncloudos";
import { NSEData, NSEDecimalNumber, NSEPersonNameComponents } from "@syndromatic/syncloudos/foundation";
import { CNFXPhoneNumber, CNFXPostalAddress } from "@syndromatic/syncloudos/fx/contacts";
import { PKFXPaymentRequest, PKFXPaymentSummaryItem, PKFXPaymentSummaryItemType, PKFXPaymentNetwork, PKFXMerchantCapability, PKFXContactField, PKFXShippingMethod, PKFXPaymentAuthorizationController, PKFXPayment, PKFXPaymentToken, PKFXPaymentMethod, PKFXPaymentMethodType, PKFXContact, PKFXPaymentAuthorizationResult, PKFXPaymentAuthorizationStatus, PKFXError, type PKFXPaymentAuthorizationControllerDelegate } from "@syndromatic/syncloudos/fx/pass";
createSynCloudOSHostContribution("pass-boundary", "installed-test", environment => {
  // @ts-expect-error Private payment adapter is absent.
  environment.payment;
  // @ts-expect-error Indexed extraction is unavailable.
  type Adapter = typeof environment["payment"];
  return {};
});
const testing = createDeterministicRuntimeEnvironment(); testing.adapters.payment.allow(); testing.adapters.payment.authorize();
// @ts-expect-error No private transport on the testing environment.
testing.environment.payment;
// @ts-expect-error No indexed transport extraction.
type Adapter = typeof testing.environment["payment"];
declare const host: SynWareTestHost;
// @ts-expect-error Test controls cannot open native sheets.
host.adapters.payment.open();
// @ts-expect-error No context client.
host.appContext.payment;
// @ts-expect-error No indexed context factory.
type ContextPayment = SynWareContextValue["payment"];
// @ts-expect-error No SCOS factory.
SCOS.payment;
// @ts-expect-error No root factory.
RootSCOS.payment;
const request = new PKFXPaymentRequest(); request.merchantIdentifier = "merchant.test"; request.countryCode = "GB"; request.currencyCode = "GBP"; request.supportedNetworks = [PKFXPaymentNetwork.visa]; request.merchantCapabilities = PKFXMerchantCapability.threeDSecure | PKFXMerchantCapability.credit; request.paymentSummaryItems = [new PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.one, PKFXPaymentSummaryItemType.final)]; request.applicationData = NSEData.from(new Uint8Array([1])); request.requiredBillingContactFields = new Set([PKFXContactField.name]); request.shippingMethods = [new PKFXShippingMethod("Delivery", NSEDecimalNumber.zero)];
const controller: PKFXPaymentAuthorizationController = usePayment(request); const delegate: PKFXPaymentAuthorizationControllerDelegate = { paymentAuthorizationControllerDidAuthorizePayment(sender, payment, handler) { const typed: PKFXPaymentAuthorizationController = sender; const token: PKFXPaymentToken = payment.token; const method: PKFXPaymentMethod = token.paymentMethod; const type: PKFXPaymentMethodType = method.type; const bytes: NSEData = token.paymentData; handler(new PKFXPaymentAuthorizationResult(PKFXPaymentAuthorizationStatus.success, null)); void [typed, type, bytes]; }, paymentAuthorizationControllerDidFinish(sender) { sender.dismiss(() => {}); } }; controller.delegate = delegate; controller.present(presented => { const yes: boolean = presented; void yes; });
PKFXPaymentAuthorizationController.canMakePayments(); PKFXPaymentAuthorizationController.canMakePayments([PKFXPaymentNetwork.visa]);
const contact = new PKFXContact(); contact.name = new NSEPersonNameComponents(); contact.name.givenName = "Ada"; contact.name.copy(); contact.phoneNumber = new CNFXPhoneNumber("123"); contact.postalAddress = new CNFXPostalAddress(); const payment: PKFXPayment = new PKFXPayment(); const error: PKFXError = new PKFXError("unknownError", "Unavailable"); void [contact, error];
// @ts-expect-error Money is never a browser string.
new PKFXPaymentSummaryItem("Merchant", "1.00");
// @ts-expect-error Apple request constructor has no gateway descriptor.
new PKFXPaymentRequest({ paymentMethodData: [] });
// @ts-expect-error Public payment has no browser completion method.
payment.complete("success");
// @ts-expect-error No invented privacy API.
controller.getAuthorizationStatus();
// @ts-expect-error No old client.
import type { PKFXPaymentClient } from "@syndromatic/syncloudos/fx/pass";
// @ts-expect-error Private ports are not exported.
import { paymentPortFor } from "@syndromatic/syncloudos/fx/pass";
// @ts-expect-error Payment button awaits owner-approved artwork.
import { PKFXPaymentButton } from "@syndromatic/syncloudos/fx/pass";
