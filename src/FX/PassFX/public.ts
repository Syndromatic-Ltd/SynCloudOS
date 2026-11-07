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

import type { NSEData, NSEDataConvertible } from "../../Foundation/NSEData";
import { snapshotPaymentData } from "./internal/paymentData";

export type PKFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export type PKFXPaymentCompletion = "success" | "fail" | "unknown";
/** Merchant method input, including WebAuthn/SPC BufferSource fields. */
export type PKFXPaymentData = null | boolean | number | string | NSEDataConvertible | readonly PKFXPaymentData[] | { readonly [key: string]: PKFXPaymentData };
/** Immutable method or response snapshot. Every binary leaf is NSEData. */
export type PKFXPaymentValue = null | boolean | number | string | NSEData | readonly PKFXPaymentValue[] | { readonly [key: string]: PKFXPaymentValue };

export interface PKFXCapabilities { readonly paymentRequest: boolean; }
export interface PKFXPaymentSummaryItem { readonly label: string; readonly amount: string; readonly pending?: boolean; }
export interface PKFXPaymentMethodData { readonly supportedMethods: string; readonly data?: PKFXPaymentData; }
export interface PKFXPaymentRequestDescriptor {
  readonly currencyCode: string;
  /** As in PKPaymentRequest, the last summary item is the merchant total. */
  readonly paymentSummaryItems: readonly PKFXPaymentSummaryItem[];
  /** Actual Payment Request method identifiers and merchant-supplied data. */
  readonly paymentMethodData: readonly PKFXPaymentMethodData[];
  readonly requestPayerName?: boolean;
  readonly requestPayerEmail?: boolean;
  readonly requestPayerPhone?: boolean;
}

export class PKFXPaymentRequest {
  readonly currencyCode: string;
  readonly paymentSummaryItems: readonly PKFXPaymentSummaryItem[];
  readonly paymentMethodData: readonly { readonly supportedMethods: string; readonly data?: PKFXPaymentValue }[];
  readonly requestPayerName: boolean;
  readonly requestPayerEmail: boolean;
  readonly requestPayerPhone: boolean;

  constructor(descriptor: PKFXPaymentRequestDescriptor) {
    if (!/^[A-Z]{3}$/.test(descriptor.currencyCode)) throw new TypeError("Payment currency must be a three-letter uppercase currency code.");
    if (!descriptor.paymentSummaryItems.length) throw new TypeError("Payment summary requires a merchant total.");
    if (!descriptor.paymentMethodData.length) throw new TypeError("At least one Payment Request method is required.");
    this.currencyCode = descriptor.currencyCode;
    this.paymentSummaryItems = Object.freeze(descriptor.paymentSummaryItems.map((item, index) => {
      if (!item.label || !/^-?[0-9]+(?:\.[0-9]+)?$/.test(item.amount)) throw new TypeError("Payment summary items require a label and an exact decimal amount.");
      if (index === descriptor.paymentSummaryItems.length - 1 && item.amount.startsWith("-")) throw new RangeError("Payment total must be nonnegative.");
      return Object.freeze({ label: item.label, amount: item.amount, ...(item.pending === undefined ? {} : { pending: item.pending }) });
    }));
    this.paymentMethodData = Object.freeze(descriptor.paymentMethodData.map(method => {
      if (!method.supportedMethods) throw new TypeError("A Payment Request method identifier is required.");
      return Object.freeze({ supportedMethods: method.supportedMethods, ...(method.data === undefined ? {} : { data: snapshotPaymentData(method.data) }) });
    }));
    this.requestPayerName = descriptor.requestPayerName ?? false;
    this.requestPayerEmail = descriptor.requestPayerEmail ?? false;
    this.requestPayerPhone = descriptor.requestPayerPhone ?? false;
    Object.freeze(this);
  }
}

export interface PKFXPayment {
  readonly requestId: string;
  readonly methodName: string;
  readonly details: PKFXPaymentValue;
  readonly payerName: string | null;
  readonly payerEmail: string | null;
  readonly payerPhone: string | null;
  complete(result: PKFXPaymentCompletion): Promise<void>;
}

/** Browser merchant payment authorisation. The merchant verifies returned details. */
export interface PKFXPaymentAuthorizationController {
  /** Payment Request has no durable user permission; support is not authorisation. */
  getAuthorizationStatus(): Promise<PKFXAuthorizationStatus>;
  canMakePayments(): Promise<boolean>;
  /** Must be called directly from a user gesture. */
  present(): Promise<PKFXPayment>;
  dispose(): void;
}

export interface PKFXPaymentClient {
  getCapabilities(): PKFXCapabilities;
  createAuthorizationController(request: PKFXPaymentRequest, signal?: AbortSignal): PKFXPaymentAuthorizationController;
}
