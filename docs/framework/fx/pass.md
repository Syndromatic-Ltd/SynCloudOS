# PassFX

PassFX follows PassKit's payment request, summary, authorization controller, delegate, payment/token and contact objects. Import from `@syndromatic/syncloudos/fx/pass` inside a plugin-compiled `.app`. `PKFXPaymentAuthorizationController` is an attributed application class: binding/import is passive, construction pins the selected mounted application, and ended instances never rebind.

The production browser transport currently reports `canMakePayments()` as false and throws `PKFXError("unknownError", ...)` for presentation. Apple's web payment flow requires merchant validation and a merchant session; neither can be inferred from the approved `PKPaymentRequest` and two-method delegate subset. Generic PaymentRequest gateways, merchant configuration and card-network support are not fabricated. Automated capable-port tests prove the controller flow without making a financial transaction. This is not production Apple Pay support.

```ts
import { NSEDecimalNumber } from "@syndromatic/syncloudos/foundation";
import {
  PKFXPaymentRequest, PKFXPaymentSummaryItem, PKFXPaymentNetwork,
  PKFXMerchantCapability, PKFXPaymentAuthorizationController,
  PKFXPaymentAuthorizationResult,
} from "@syndromatic/syncloudos/fx/pass";

const request = new PKFXPaymentRequest();
request.merchantIdentifier = "merchant.example";
request.countryCode = "GB";
request.currencyCode = "GBP";
request.supportedNetworks = [PKFXPaymentNetwork.visa];
request.merchantCapabilities = PKFXMerchantCapability.threeDSecure;
request.paymentSummaryItems = [
  new PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.fromString("12.34")),
];
const controller = new PKFXPaymentAuthorizationController(request);
controller.delegate = {
  paymentAuthorizationControllerDidAuthorizePayment(sender, payment, handler) {
    // The merchant verifies payment.token with its payment processor.
    // Supply success only after real verification; this example refuses payment.
    handler(new PKFXPaymentAuthorizationResult("failure"));
  },
  paymentAuthorizationControllerDidFinish(sender) {
    sender.dismiss(() => { /* Sheet has closed. */ });
  },
};
// In a supported host, directly from a user action:
if (PKFXPaymentAuthorizationController.canMakePayments()) {
  controller.present(presented => { /* Native presentation result. */ });
}
```

`usePayment(request)` returns a real component-owned controller. Keep the request identity stable, for example with React `useMemo`. The hook survives StrictMode's effect replay; true unmount, request replacement or app teardown ends the owned controller and fails any unfinished native response. It supplies no client or factory.

## Values and supported members

- `PKFXPaymentRequest()` has mutable `merchantIdentifier`, `countryCode`, `currencyCode`, `supportedNetworks`, `merchantCapabilities`, `paymentSummaryItems`, `requiredBillingContactFields`, `requiredShippingContactFields`, `shippingMethods` and `applicationData: NSEData | null`.
- `PKFXPaymentSummaryItem(label, amount, type?)` uses `NSEDecimalNumber` and `final`/`pending`; the final item is the nonnegative merchant total. Controller construction copies the request. Decimal values remain exact, including amounts beyond IEEE-754 integer precision. `PKFXShippingMethod` adds `identifier` and `detail`.
- `PKFXPayment` exposes its `token`, `billingContact`, `shippingContact` and `shippingMethod`. `PKFXPaymentToken` exposes `paymentMethod`, `transactionIdentifier` and immutable `paymentData: NSEData`. `PKFXPaymentMethod` exposes `displayName`, `network`, `type` and `billingAddress`. Native Wallet pass objects are outside this subset.
- `PKFXContact` uses `NSEPersonNameComponents`, `CNFXPhoneNumber` and `CNFXPostalAddress`, plus `emailAddress` and `supplementarySubLocality`. Unknown fields are null. Foundation person-name components are supplied individually and copied by value; no name parser or formatter is introduced.
- `PKFXPaymentAuthorizationResult(status, errors?)` preserves Apple's status cases and error array. The delegate handler replaces browser response completion methods. A handler is single-use.

## Callbacks, availability and authority

`canMakePayments()` and `canMakePayments(usingNetworks)` are synchronous, passive boolean checks. They never grant consent or imply an unsupported network is usable. `present(completion)` opens the private native port synchronously while the existing host gate permits it; no dispatch hop precedes native presentation. Native presentation/authorization is asynchronous. Its completion, authorization delegate, merchant handler work, finish delegate and dismissal completion all run on the already-selected application's DispatchFX main queue, rechecking the captured lifetime and access generation at delivery. `dismiss(completion)` is terminal and asynchronous.

PassKit has no authorization enum or privacy API. Declare `payment.request` in `Info.ts`; launch entitlements, host policy and the existing shared native-denial/resource gate remain mandatory. Missing launch authorization reports `PKFXError` with `notEntitledError`; invalid request values report `invalidDataError`; unsupported transport, native denial and ended sessions use `unknownError` with an explanatory message. The error domain is `PKPassKitErrorDomain`. Insecure browser contexts preserve their native SecurityError classification in the shared gate before conversion; native NotAllowedError likewise overrides saved consent.

Revocation, policy/entitlement loss, session removal, app teardown, component unmount and dismissal prevent every queued or awaited delivery. Regrant and replacement operations cannot revive an old generation. An outstanding or late native response is failed exactly once and its old sheet is dismissed without touching a replacement. Session/access observers are released when the controller ends. No browser response, gateway option, public adapter or legacy SCOS/context client is exposed.

`PKFXPaymentButton`, `PKFXPaymentButtonType` and `PKFXPaymentButtonStyle` are excluded pending artwork approval. No NSE payment control or artwork is shipped. Wallet passes, disbursements, recurring payments, shipping-update delegates and merchant-session updates are outside this approved subset.

## Apple sources

- [PKPaymentAuthorizationController](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationcontroller)
- [PKPaymentAuthorizationControllerDelegate](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationcontrollerdelegate)
- [PKPaymentRequest](https://developer.apple.com/documentation/passkit/pkpaymentrequest)
- [PKPaymentToken](https://developer.apple.com/documentation/passkit/pkpaymenttoken) and [PKContact](https://developer.apple.com/documentation/passkit/pkcontact)
- [PKPassKitError.Code](https://developer.apple.com/documentation/passkit/pkpasskiterror/code)
- [NSPersonNameComponents](https://developer.apple.com/documentation/foundation/nspersonnamecomponents)
- [Apple Pay merchant validation](https://developer.apple.com/documentation/applepayontheweb/providing-merchant-validation)
