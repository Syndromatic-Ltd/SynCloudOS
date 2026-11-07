# PassFX

PassFX uses `PKFXPaymentRequest`, payment summary items, and `PKFXPaymentAuthorizationController` after PassKit. Its browser transport is Payment Request. It does not provide Apple Pay entitlement, native Wallet passes, a merchant account, payment processing, or a drawn payment sheet.

Declare `payment.request` in the app's permissions. The mounted client rechecks this declaration and host policy before `canMakePayments()`, `present()`, and response completion. The browser and the merchant's configured payment method own the payment UI and authorization. Merchants must verify the returned details with their payment provider/server before completing with `"success"`.

```tsx
import { usePayment } from "@syndromatic/syncloudos/sdk";
import { PKFXPaymentRequest } from "@syndromatic/syncloudos/fx/pass";

const payment = usePayment(); // Passive, component-owned client.
const request = new PKFXPaymentRequest({
  currencyCode: "GBP",
  paymentSummaryItems: [
    { label: "Item", amount: "4.00" },
    { label: "Merchant", amount: "4.00" }, // Final item is the total.
  ],
  paymentMethodData: [
    { supportedMethods: "https://your-payment-provider.example" },
  ],
});
// Call directly from a user action, with a real configured payment method:
const controller = payment.createAuthorizationController(request);
const response = await controller.present();
try {
  await verifyWithMerchantServer(response.details);
  await response.complete("success");
} catch (error) {
  await response.complete("fail");
  throw error;
} finally {
  controller.dispose();
}
```

Amounts are exact decimal strings, never floating-point arithmetic. The last summary item becomes Payment Request's `total`; earlier items become `displayItems`. Totals must be nonnegative. `paymentMethodData` carries real browser `supportedMethods` identifiers and optional finite JSON data; request and response JSON are copied and frozen. Optional payer name, email, and phone requests map to the corresponding browser options. Payment authorization does not include native-only contact, shipping-method, coupon, or network objects.

`getCapabilities().paymentRequest` reports secure-context API availability synchronously and passively. `canMakePayments()` calls the browser's `canMakePayment()` for this request and propagates browser privacy/quota errors. It does not present UI and cannot prove that a transaction will succeed. `getAuthorizationStatus()` returns `unknown` when available, or `unavailable` without a live supported controller. Payment Request has no durable user permission; a successful availability check never becomes a `granted` authorization state. Mounted declaration/policy denial is reported as `denied`.

Each controller presents once. Browser dismissal and merchant-method failures propagate; the framework does not fabricate successful payment details. A response can complete once with `success`, `fail`, or `unknown`. An optional owner signal, component unmount, or app unmount aborts pending presentation and completes an outstanding or late response as failed. Dispose controllers promptly to release the mounted resource budget. Browser cancellation itself can fail if the browser sheet has already settled; completion still handles returned responses.

The host injects `BrowserPaymentAdapter({ isSecureContext, PaymentRequest? })`. Secure-context support, installed payment handlers, merchant configuration, browser restrictions, and user activation determine actual availability. Automated tests use injected browser ports; merchant sandbox transactions, browser payment UI, and real provider verification require end-to-end acceptance.

The owner still needs to decide whether a `PKPaymentButton`-shaped NSE control is appropriate. This framework adds no button or custom payment UI.
