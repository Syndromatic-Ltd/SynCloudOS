/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createFXSessionBinding, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { PKFXError } from "../PKFXError";
import type { PKFXPaymentAuthorizationController } from "../PKFXPaymentAuthorizationController";
export const paymentSessionBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();
export const paymentControllers = new WeakMap<PKFXPaymentAuthorizationController, { dispose(): void }>();
export const paymentBinding = (type: Function) =>
  paymentSessionBindings.get(type) ??
  createFXSessionBinding(type, reason => new PKFXError("unknownError", `PassKit application session is ${reason}.`));
