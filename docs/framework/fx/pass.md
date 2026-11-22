# PassFX

PassFX describes a payment (what is being bought, for how much, from which merchant) and runs the authorisation sheet that collects it. You build a `PKFXPaymentRequest`, hand it to a `PKFXPaymentAuthorizationController`, and verify the resulting token with your payment processor.

Import from `@syndromatic/syncloudos/fx/pass` inside a plugin-compiled `.app`. `PKFXPaymentAuthorizationController` is attributed to your application: importing it does nothing, constructing it binds it to the mounted app, and an ended controller never binds again.

> **No production payments yet.** The browser transport reports `canMakePayments()` as `false`, and `present` throws `PKFXError("unknownError", …)`. Apple Pay on the web needs merchant validation and a merchant session, and neither can be derived from the request and two-method delegate that PassFX supports. PassFX does not fake a generic PaymentRequest gateway, merchant configuration or card-network support. Automated tests run the full controller flow through a capable test port without making a financial transaction.

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
    // Verify payment.token with your payment processor, and report success
    // only after it confirms. This example refuses the payment.
    handler(new PKFXPaymentAuthorizationResult("failure"));
  },
  paymentAuthorizationControllerDidFinish(sender) {
    sender.dismiss(() => { /* The sheet has closed. */ });
  },
};
// On a supported host, directly from a user action:
if (PKFXPaymentAuthorizationController.canMakePayments()) {
  controller.present(presented => { /* Whether the sheet appeared. */ });
}
```

In a component, `usePayment(request)` from `@syndromatic/syncloudos/sdk` returns a controller owned by that component. Keep the request object stable, for example with `useMemo`. The hook survives React StrictMode's effect replay. Unmounting, passing a different request or tearing down the app ends the controller and fails any unanswered native response. The hook does not provide a client or factory.

## Requests, results and values

- `new PKFXPaymentRequest()` has mutable `merchantIdentifier`, `countryCode`, `currencyCode`, `supportedNetworks`, `merchantCapabilities`, `paymentSummaryItems`, `requiredBillingContactFields`, `requiredShippingContactFields`, `shippingMethods` and `applicationData` (`NSEData | null`). The controller copies the request when you construct it.
- `new PKFXPaymentSummaryItem(label, amount, type?)` takes an `NSEDecimalNumber` amount and a type of `final` (the default) or `pending`. The last item is the merchant total and must not be negative. Amounts stay exact, even beyond the range a JavaScript number can hold precisely. `PKFXShippingMethod` is a summary item with an `identifier` and `detail`.
- `PKFXMerchantCapability` is a set of bit flags: `threeDSecure`, `emv`, `credit`, `debit` and `instantFundsOut`.
- `PKFXPayment` holds the `token`, `billingContact`, `shippingContact` and `shippingMethod`. `PKFXPaymentToken` holds `paymentMethod`, `transactionIdentifier` and immutable `paymentData` (`NSEData`). `PKFXPaymentMethod` holds `displayName`, `network`, `type` and `billingAddress`.
- `PKFXContact` holds `name` (`NSEPersonNameComponents`), `phoneNumber` (`CNFXPhoneNumber`), `postalAddress` (`CNFXPostalAddress`), `emailAddress` and `supplementarySubLocality`. Unknown fields are `null`. Name components are supplied individually and copied by value; PassFX does not parse or format names.
- `new PKFXPaymentAuthorizationResult(status, errors?)` reports the outcome to the sheet. `status` is one of `success`, `failure`, `invalidBillingPostalAddress`, `invalidShippingPostalAddress`, `invalidShippingContact`, `pinRequired`, `pinIncorrect` or `pinLockout`. Each delegate `handler` can be called once.

## Presentation and callbacks

`canMakePayments()` and `canMakePayments(usingNetworks)` are synchronous checks. They never grant consent and never suggest an unsupported network will work.

`present(completion)` opens the native sheet synchronously when the host allows it, with no Dispatch hop first, so the user's activation is still valid. Presentation and authorisation then proceed asynchronously. The presentation completion, the authorisation delegate call, your handler's work, the finish delegate call and the dismissal completion all run on the app's main Dispatch queue, and each rechecks the app's lifetime and access before running. `dismiss(completion)` is asynchronous and final.

## Entitlements and errors

There is no payment authorisation status or privacy prompt. Declare `payment.request` in `Info.ts`; the launch entitlement, host policy and the shared native-denial gate all apply.

`PKFXError` has the domain `PKPassKitErrorDomain` and a `code`:

| Code | When |
|---|---|
| `notEntitledError` | The launch entitlement or host authorisation is missing. |
| `invalidDataError` | A request value is invalid. |
| `unknownError` | The transport is unsupported, the native side refused, or the session ended. The message says which. |

An insecure browser context keeps its `SecurityError` classification in the shared gate before conversion, and a native `NotAllowedError` overrides saved consent.

Revocation, losing the policy or entitlement, removing the session, tearing down the app, unmounting the component or dismissing the sheet each stop every queued or awaited delivery. Granting access again, or starting a replacement, cannot revive an old generation. An outstanding or late native response fails exactly once, and its old sheet is dismissed without touching a replacement. Session and access observers are released when the controller ends. PassFX exposes no browser response object, gateway option, public adapter, or legacy `SCOS` or context client.

## Not included

There is no payment button: `PKFXPaymentButton`, `PKFXPaymentButtonType` and `PKFXPaymentButtonStyle` are held back until their artwork is approved, and no NSE payment control ships. Wallet passes, disbursements, recurring payments, shipping-update delegates and merchant-session updates are also out of scope.
