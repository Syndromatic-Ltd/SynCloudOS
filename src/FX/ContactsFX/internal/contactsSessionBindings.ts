/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createFXSessionBinding, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { CNFXError } from "../CNFXError";
import type { CNFXContactStore } from "../CNFXContactStore";
export const contactsSessionBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();
export const contactStores = new WeakMap<CNFXContactStore, { dispose(): void }>();
export const contactBinding = (type: Function) => contactsSessionBindings.get(type) ?? createFXSessionBinding(type, reason => new CNFXError("communicationError", `Contacts application session is ${reason}.`));
