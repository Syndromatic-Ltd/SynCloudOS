import { expect, it } from "vitest";
import * as P from "../../../src/FX/PassFX/public";
import * as F from "../../../src/Foundation/public";
import { CNFXPhoneNumber, CNFXPostalAddress } from "../../../src/FX/ContactsFX/public";

it("exports real PassKit classes and removes browser contracts and unapproved controls", () => {
  for (const name of ["PKFXPaymentRequest", "PKFXPaymentSummaryItem", "PKFXShippingMethod", "PKFXPaymentAuthorizationController", "PKFXPayment", "PKFXPaymentToken", "PKFXPaymentMethod", "PKFXContact", "PKFXPaymentAuthorizationResult", "PKFXError"]) expect(typeof (P as Record<string, unknown>)[name], name).toBe("function");
  for (const name of ["PKFXAuthorizationStatus", "PKFXPaymentCompletion", "PKFXCapabilities", "PKFXPaymentClient", "PKFXPaymentRequestDescriptor", "PKFXPaymentData", "PKFXPaymentValue", "PKFXPaymentMethodData", "PKFXPaymentButton", "PKFXPaymentButtonType", "PKFXPaymentButtonStyle"]) expect(name in P, name).toBe(false);
});

it("uses Apple's mutable request and exact decimal summary / shipping items", () => {
  expect(typeof P.PKFXPaymentSummaryItem).toBe("function");
  const amount = F.NSEDecimalNumber.fromString("9007199254740993.1234567890123456789");
  const item = new P.PKFXPaymentSummaryItem("Merchant", amount);
  const shipping = new P.PKFXShippingMethod("Delivery", F.NSEDecimalNumber.fromString("1.25"), P.PKFXPaymentSummaryItemType.pending);
  shipping.identifier = "delivery"; shipping.detail = "Next day";
  expect(shipping).toBeInstanceOf(P.PKFXPaymentSummaryItem);
  const request = new P.PKFXPaymentRequest();
  Object.assign(request, { merchantIdentifier: "merchant.test", countryCode: "GB", currencyCode: "GBP", supportedNetworks: [P.PKFXPaymentNetwork.visa], merchantCapabilities: P.PKFXMerchantCapability.threeDSecure | P.PKFXMerchantCapability.credit, paymentSummaryItems: [item], shippingMethods: [shipping], applicationData: F.NSEData.from(new Uint8Array([1, 2])) });
  request.requiredShippingContactFields = new Set([P.PKFXContactField.postalAddress]);
  expect(request.paymentSummaryItems[0]!.amount.toString()).toBe("9007199254740993.1234567890123456789");
  expect(item.type).toBe("final"); expect(shipping.type).toBe("pending");
  expect("paymentMethodData" in request).toBe(false); expect("requestPayerName" in request).toBe(false);
});

it("uses Foundation person-name and Contacts value counterparts without guessed names", () => {
  expect(typeof F.NSEPersonNameComponents).toBe("function");
  const name = new F.NSEPersonNameComponents();
  expect(name.givenName).toBeNull(); name.givenName = "Ada"; name.familyName = "Lovelace";
  const contact = new P.PKFXContact(); contact.name = name; contact.emailAddress = "ada@example.test"; contact.phoneNumber = new CNFXPhoneNumber("123"); contact.postalAddress = new CNFXPostalAddress();
  expect(contact.name).toBeInstanceOf(F.NSEPersonNameComponents); expect(contact.phoneNumber.stringValue).toBe("123"); expect(contact.supplementarySubLocality).toBeNull();
  name.phoneticRepresentation = new F.NSEPersonNameComponents(); name.phoneticRepresentation.givenName = "Ayda";
  const copy = name.copy(); name.givenName = "Changed"; name.phoneticRepresentation.givenName = "Changed";
  expect(copy.givenName).toBe("Ada"); expect(copy.phoneticRepresentation?.givenName).toBe("Ayda");
});

it("keeps system-supplied payments read-only and the authorization result handler-shaped", () => {
  expect(typeof P.PKFXPayment).toBe("function");
  const payment = new P.PKFXPayment();
  expect(payment.token).toBeInstanceOf(P.PKFXPaymentToken); expect(payment.token.paymentMethod).toBeInstanceOf(P.PKFXPaymentMethod); expect(payment.token.paymentData).toBeInstanceOf(F.NSEData);
  expect("complete" in payment).toBe(false); expect("details" in payment).toBe(false);
  const result = new P.PKFXPaymentAuthorizationResult(P.PKFXPaymentAuthorizationStatus.failure, [new P.PKFXError("unknownError", "Declined")]);
  expect(result.errors?.[0]).toBeInstanceOf(P.PKFXError); result.status = P.PKFXPaymentAuthorizationStatus.success;
  expect(result.status).toBe("success");
});
