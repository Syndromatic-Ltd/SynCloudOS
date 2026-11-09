/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import { PKFXError } from "./PKFXError";
import type { PKFXPaymentRequest } from "./PKFXPaymentRequest";
import type { PKFXPaymentNetwork } from "./PKFXPaymentNetwork";
import type { PKFXPaymentAuthorizationControllerDelegate } from "./PKFXPaymentAuthorizationControllerDelegate";
import { PKFXPaymentAuthorizationResult } from "./PKFXPaymentAuthorizationResult";
import { paymentBinding, paymentControllers } from "./internal/paymentSessionBindings";
import { paymentPortFor, paymentFailure, type PaymentPresentation, type PaymentResponse } from "./internal/paymentPort";
import { paymentRequestSnapshot } from "./internal/paymentRequestSnapshot";
/** PKPaymentAuthorizationController. Delegates and completions use the selected app's main queue. */
export class PKFXPaymentAuthorizationController {
  delegate: PKFXPaymentAuthorizationControllerDelegate | null = null;
  #binding;
  #session;
  #port;
  #generation;
  #request;
  #state: "idle" | "presenting" | "dismissed" | "ended" = "idle";
  #presentation: PaymentPresentation | undefined;
  #response: PaymentResponse | undefined;
  #owner = new AbortController();
  #releaseSession: (() => void) | undefined;
  #releaseAccess: (() => void) | undefined;
  constructor(paymentRequest: PKFXPaymentRequest) {
    this.#binding = paymentBinding(new.target);
    this.#session = this.#binding.resolve();
    this.#port = paymentPortFor(this.#session.context);
    this.#generation = this.#port.generation;
    this.#request = paymentRequestSnapshot(paymentRequest);
    paymentControllers.set(this, { dispose: () => this.#end() });
  }
  static canMakePayments(usingNetworks?: readonly PKFXPaymentNetwork[]): boolean {
    return paymentPortFor(paymentBinding(this).resolve().context).canMakePayments(usingNetworks);
  }
  /** Call from the user gesture. Unsupported transports throw PKFXError without opening a sheet. */
  present(completion?: ((presented: boolean) => void) | null): void {
    this.#assertLive();
    if (this.#state !== "idle") throw new PKFXError("unknownError", "This payment controller has already been presented.");
    this.#watch();
    try {
      this.#presentation = this.#port.open(this.#request, this.#owner.signal);
    } catch (error) {
      this.#end();
      throw paymentFailure(error);
    }
    this.#state = "presenting";
    void this.#presentation.presented.then(
      presented =>
        this.#enqueue(() => {
          completion?.(presented);
          if (!presented) this.#end();
        }),
      () =>
        this.#enqueue(() => {
          completion?.(false);
          this.#end();
        }),
    );
    void this.#presentation.authorized.then(
      response => {
        if (!this.#live()) {
          try {
            void response.finish(new PKFXPaymentAuthorizationResult("failure")).catch(() => {});
          } catch {
            /* The port already released the stale response. */
          }
          return;
        }
        this.#response = response;
        this.#enqueue(() => {
          let completed = false;
          const handler = (result: PKFXPaymentAuthorizationResult) => {
            this.#assertLive();
            if (completed) throw new PKFXError("unknownError", "The payment authorization handler was already called.");
            if (!(result instanceof PKFXPaymentAuthorizationResult))
              throw new PKFXError("invalidDataError", "The handler requires PKPaymentAuthorizationResult.");
            completed = true;
            const capturedResult = Object.freeze(
              new PKFXPaymentAuthorizationResult(result.status, result.errors === null ? null : Object.freeze([...result.errors])),
            );
            this.#enqueue(() => {
              void response.finish(capturedResult).then(
                () => this.#enqueue(() => this.delegate?.paymentAuthorizationControllerDidFinish(this)),
                () => this.#enqueue(() => this.delegate?.paymentAuthorizationControllerDidFinish(this)),
              );
            });
          };
          if (!this.delegate) {
            handler(new PKFXPaymentAuthorizationResult("failure"));
            return;
          }
          this.delegate.paymentAuthorizationControllerDidAuthorizePayment(this, response.payment, handler);
        });
      },
      () => this.#enqueue(() => this.delegate?.paymentAuthorizationControllerDidFinish(this)),
    );
  }
  /** Terminal dismissal; completion runs only while this exact application's authority remains live. */
  dismiss(completion?: (() => void) | null): void {
    this.#assertLive();
    this.#watch();
    this.#state = "dismissed";
    const pending = this.#presentation?.dismiss() ?? Promise.resolve();
    this.#owner.abort();
    void pending.then(
      () =>
        this.#enqueue(() => {
          try {
            completion?.();
          } finally {
            this.#end();
          }
        }, true),
      () => this.#end(),
    );
  }
  #watch(): void {
    this.#port.bindAccessLifetime(this.#generation);
    this.#releaseAccess ??= this.#port.observeAccessLoss(() => this.#end());
    this.#releaseSession ??= observeFXSessionEnd(this.#session, () => this.#end());
  }
  #assertLive(dismissed = false): void {
    if (this.#state === "ended" || (this.#state === "dismissed" && !dismissed))
      throw new PKFXError("unknownError", "The payment controller has ended.");
    this.#binding.resolve();
    this.#port.assertAccess(this.#generation);
  }
  #live(dismissed = false): boolean {
    try {
      this.#assertLive(dismissed);
      return true;
    } catch {
      return false;
    }
  }
  #enqueue(work: () => void, dismissed = false): void {
    if (!this.#live(dismissed)) return;
    dispatchQueueForSession(this.#session).main.async(() => {
      if (this.#live(dismissed)) work();
    });
  }
  #end(): void {
    if (this.#state === "ended") return;
    this.#state = "ended";
    this.#owner.abort();
    try {
      void this.#presentation?.dismiss().catch(() => {});
    } catch {
      /* A native sheet may already be gone. */
    }
    this.#response = undefined;
    this.delegate = null;
    this.#releaseSession?.();
    this.#releaseSession = undefined;
    this.#releaseAccess?.();
    this.#releaseAccess = undefined;
  }
}
Object.defineProperty(PKFXPaymentAuthorizationController, fxAttributedClass, { value: true });
