/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEDecimalNumber } from "../../../Foundation/NSEDecimalNumber";
import { NSEData } from "../../../Foundation/NSEData";
import { PKFXPaymentRequest } from "../PKFXPaymentRequest";
import { PKFXPaymentSummaryItem } from "../PKFXPaymentSummaryItem";
import { PKFXShippingMethod } from "../PKFXShippingMethod";
import { PKFXError } from "../PKFXError";
/** Copies request values without ever converting money through binary floating point. */
export function paymentRequestSnapshot(source: PKFXPaymentRequest): PKFXPaymentRequest {
  const invalid = () => { throw new PKFXError("invalidDataError", "Payment requires a merchant, country, currency, networks, capabilities and valid decimal summary items."); };
  if (!(source instanceof PKFXPaymentRequest) || !source.merchantIdentifier || !/^[A-Z]{2}$/.test(source.countryCode) || !/^[A-Z]{3}$/.test(source.currencyCode) || !source.supportedNetworks.length || !source.merchantCapabilities || !source.paymentSummaryItems.length) invalid();
  const item = (value: PKFXPaymentSummaryItem): PKFXPaymentSummaryItem => {
    if (!(value instanceof PKFXPaymentSummaryItem) || !value.label || !(value.amount instanceof NSEDecimalNumber) || !/^-?\d+(?:\.\d+)?$/.test(value.amount.toString()) || !["final", "pending"].includes(value.type)) invalid();
    const copy = value instanceof PKFXShippingMethod ? new PKFXShippingMethod(value.label, value.amount, value.type) : new PKFXPaymentSummaryItem(value.label, value.amount, value.type);
    if (copy instanceof PKFXShippingMethod && value instanceof PKFXShippingMethod) { copy.identifier = value.identifier; copy.detail = value.detail; }
    return Object.freeze(copy);
  };
  const copy = new PKFXPaymentRequest();
  copy.merchantIdentifier = source.merchantIdentifier; copy.countryCode = source.countryCode; copy.currencyCode = source.currencyCode;
  copy.supportedNetworks = Object.freeze([...source.supportedNetworks]); copy.merchantCapabilities = source.merchantCapabilities;
  copy.paymentSummaryItems = Object.freeze(source.paymentSummaryItems.map(item));
  if (copy.paymentSummaryItems.at(-1)!.amount.toString().startsWith("-")) invalid();
  copy.requiredBillingContactFields = new Set(source.requiredBillingContactFields); copy.requiredShippingContactFields = new Set(source.requiredShippingContactFields);
  copy.shippingMethods = source.shippingMethods === null ? null : Object.freeze(source.shippingMethods.map(value => item(value) as PKFXShippingMethod));
  if (source.applicationData !== null && !(source.applicationData instanceof NSEData)) invalid();
  copy.applicationData = source.applicationData;
  return Object.freeze(copy);
}
