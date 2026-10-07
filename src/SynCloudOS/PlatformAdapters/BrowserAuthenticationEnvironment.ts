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

export interface BrowserAuthenticationBroadcastPort {
  postMessage(value: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface BrowserAuthenticationEnvironment {
  readonly fetch: typeof globalThis.fetch;
  readonly navigate: (destination: string) => void;
  readonly eventTarget: Pick<Window, "addEventListener" | "removeEventListener"> | undefined;
  readonly createBroadcastChannel:
    | ((name: string) => BrowserAuthenticationBroadcastPort)
    | undefined;
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

/**
 * Browser-owned defaults for the HTTP authentication client. Keeping these
 * ambient-global reads in the adapter layer lets the authentication service
 * remain usable with fully injected ports in tests and non-browser hosts.
 */
export function createBrowserAuthenticationEnvironment(): BrowserAuthenticationEnvironment {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const fetcher = globalThis.fetch.bind(globalThis);
  return Object.freeze({
    fetch: fetcher,
    navigate: (destination: string) => browserWindow?.location.assign(destination),
    eventTarget: browserWindow,
    createBroadcastChannel:
      typeof BroadcastChannel === "function"
        ? (name: string) => new BroadcastChannel(name)
        : undefined,
    setTimeout: (callback: () => void, milliseconds: number) =>
      globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
  });
}
