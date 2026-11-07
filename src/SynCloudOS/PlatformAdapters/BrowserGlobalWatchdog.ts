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

import type { SynCloudOSRuntime } from "../SynCloudOS";

export interface BrowserGlobalWatchdogStatus {
  readonly capturedGlobalErrors: number;
  readonly capturedPromiseRejections: number;
  readonly capturedResourceErrors: number;
  readonly installed: boolean;
  readonly installedAt: number | null;
}

export function createBrowserGlobalWatchdog(
  runtime: Pick<SynCloudOSRuntime, "errors">,
  target: Window,
  now: () => number = Date.now,
) {
  let capturedGlobalErrors = 0;
  let capturedPromiseRejections = 0;
  let capturedResourceErrors = 0;
  let installed = false;
  let installedAt: number | null = null;

  const getTarget = (event: Event) => event.target ?? (event as Event & { srcElement?: EventTarget | null }).srcElement ?? null;
  const isResourceLoadError = (event: Event) => {
    const eventTarget = getTarget(event);
    if (!eventTarget || eventTarget === target) return false;
    return typeof (eventTarget as { tagName?: unknown }).tagName === "string";
  };
  const handleWindowError = (event: Event) => {
    if (isResourceLoadError(event)) {
      capturedResourceErrors += 1;
      runtime.errors.createAssetLoadFailedError(getTarget(event), { eventType: "error" });
      return;
    }
    const errorEvent = event as ErrorEvent;
    capturedGlobalErrors += 1;
    runtime.errors.createGlobalScriptError(errorEvent.error, {
      eventType: "error",
      filename: typeof errorEvent.filename === "string" ? errorEvent.filename : undefined,
      lineno: typeof errorEvent.lineno === "number" ? errorEvent.lineno : undefined,
      colno: typeof errorEvent.colno === "number" ? errorEvent.colno : undefined,
      message: typeof errorEvent.message === "string" ? errorEvent.message : undefined,
    });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    capturedPromiseRejections += 1;
    runtime.errors.createUnhandledPromiseRejectionError(event.reason, { eventType: "unhandledrejection" });
  };
  const getStatus = (): BrowserGlobalWatchdogStatus => ({
    capturedGlobalErrors,
    capturedPromiseRejections,
    capturedResourceErrors,
    installed,
    installedAt,
  });

  return {
    install() {
      if (installed) return getStatus();
      target.addEventListener("error", handleWindowError, true);
      target.addEventListener("unhandledrejection", handleUnhandledRejection);
      installed = true;
      installedAt = now();
      return getStatus();
    },
    uninstall() {
      if (!installed) return getStatus();
      target.removeEventListener("error", handleWindowError, true);
      target.removeEventListener("unhandledrejection", handleUnhandledRejection);
      installed = false;
      installedAt = null;
      return getStatus();
    },
    getStatus,
  };
}
