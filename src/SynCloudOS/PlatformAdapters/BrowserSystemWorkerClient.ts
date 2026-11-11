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

/** A bounded request/reply channel to the runtime's active worker. */
export async function systemWorkerRequest<T>(navigator: Navigator, message: unknown, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  if (!navigator.serviceWorker) throw new DOMException("A service worker is unavailable.", "NotSupportedError");
  const registration = await navigator.serviceWorker.getRegistration();
  signal.throwIfAborted();
  if (!registration?.active) throw new DOMException("The installed application worker is not active.", "InvalidStateError");
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const lifetime = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const cleanup = () => { lifetime.removeEventListener("abort", abort); channel.port1.close(); };
    const abort = () => { cleanup(); reject(lifetime.reason ?? new DOMException("The application closed.", "AbortError")); };
    lifetime.addEventListener("abort", abort, { once: true });
    channel.port1.onmessage = event => {
      cleanup(); const reply = event.data;
      if (reply?.ok) resolve(reply.value as T); else reject(new DOMException(reply?.error ?? "The worker refused this request.", "OperationError"));
    };
    try { registration.active!.postMessage(message, [channel.port2]); }
    catch (error) { cleanup(); reject(error); }
  });
}
