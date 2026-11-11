/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PKFXPayment } from "../PKFXPayment";
import type { PKFXPaymentRequest } from "../PKFXPaymentRequest";
import type { PKFXPaymentNetwork } from "../PKFXPaymentNetwork";
import type { PKFXPaymentAuthorizationResult } from "../PKFXPaymentAuthorizationResult";
import { PKFXError } from "../PKFXError";
export interface PaymentResponse {
  readonly payment: PKFXPayment;
  finish(result: PKFXPaymentAuthorizationResult): Promise<void>;
}
export interface PaymentPresentation {
  readonly presented: Promise<boolean>;
  readonly authorized: Promise<PaymentResponse>;
  dismiss(): Promise<void>;
}
export interface PaymentAdapter {
  assertAvailable(): void;
  canMakePayments(networks?: readonly PKFXPaymentNetwork[]): boolean;
  open(request: PKFXPaymentRequest, signal: AbortSignal): PaymentPresentation;
}
export interface PaymentPort extends PaymentAdapter {
  readonly generation: number;
  assertAccess(generation?: number): void;
  bindAccessLifetime(generation: number): void;
  observeAccessLoss(listener: () => void): () => void;
}
const ports = new WeakMap<object, PaymentPort>();
const adapters = new WeakMap<object, PaymentAdapter>();
export function associatePaymentPort(context: object, port: PaymentPort): void {
  ports.set(context, port);
}
export function paymentPortFor(context: object): PaymentPort {
  const port = ports.get(context);
  if (!port) throw new PKFXError("unknownError", "The PassKit service is unavailable.");
  return port;
}
export function associatePaymentAdapter(environment: object, adapter: PaymentAdapter): void {
  adapters.set(environment, adapter);
}
export function paymentAdapterFor(environment: object): PaymentAdapter | undefined {
  return adapters.get(environment);
}
export function isPaymentDenial(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}
export function paymentFailure(error: unknown): PKFXError {
  if (error instanceof PKFXError) return error;
  return new PKFXError(
    "unknownError",
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "Payment authorisation failed.",
  );
}
