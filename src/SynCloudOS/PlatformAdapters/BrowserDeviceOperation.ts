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

/** Race a browser operation against its owner without postponing gesture-sensitive calls. */
export function browserDeviceOperation<T>(signal: AbortSignal, operation: () => Promise<T>, discard?: (value: T) => void): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("The device owner was disposed.", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new DOMException("The device owner was disposed.", "AbortError"));
    signal.addEventListener("abort", aborted, { once: true });
    let pending: Promise<T>;
    try { pending = operation(); }
    catch (error) { signal.removeEventListener("abort", aborted); reject(error); return; }
    Promise.resolve(pending).then(value => {
      signal.removeEventListener("abort", aborted);
      if (signal.aborted) { discard?.(value); aborted(); }
      else resolve(value);
    }, error => { signal.removeEventListener("abort", aborted); reject(error); });
  });
}

export function browserDeviceOwner(parent?: AbortSignal): { readonly signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const dispose = () => { parent?.removeEventListener("abort", dispose); controller.abort(); };
  parent?.addEventListener("abort", dispose, { once: true });
  if (parent?.aborted) dispose();
  return { signal: controller.signal, dispose };
}
