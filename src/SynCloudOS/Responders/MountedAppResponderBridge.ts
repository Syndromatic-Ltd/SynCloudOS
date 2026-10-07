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

import type { ResponderRegistration, ResponderRegistrationHandle } from "./responderTypes";

type AppResponderRegistrar = (registration: ResponderRegistration) => ResponderRegistrationHandle;

const registrars = new WeakMap<object, AppResponderRegistrar>();

export function registerMountedAppResponder(runtime: object, registration: ResponderRegistration): ResponderRegistrationHandle {
  const registrar = registrars.get(runtime);
  if (!registrar) throw new DOMException("The mounted application responder authority is no longer live.", "SecurityError");
  return registrar(registration);
}

export function setMountedAppResponderRegistrar(runtime: object, registrar: AppResponderRegistrar): void {
  registrars.set(runtime, registrar);
}

export function clearMountedAppResponderRegistrar(runtime: object): void {
  registrars.delete(runtime);
}
