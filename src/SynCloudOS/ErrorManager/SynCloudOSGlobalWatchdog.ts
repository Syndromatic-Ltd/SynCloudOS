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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

export interface SynCloudOSGlobalWatchdogStatus {
  capturedGlobalErrors: number;
  capturedPromiseRejections: number;
  capturedResourceErrors: number;
  installed: boolean;
  installedAt: number | null;
}
export function createSynCloudOSGlobalWatchdog(runtime: SynCloudOSRuntime, dependencies: { errorManager: any }) {
const ErrorManager = dependencies.errorManager;

let capturedGlobalErrors = 0;
let capturedPromiseRejections = 0;
let capturedResourceErrors = 0;
let installed = false;
let installedAt: number | null = null;
let removeErrorListener: (() => void) | null = null;
let removeUnhandledRejectionListener: (() => void) | null = null;

function getTarget(event: Event) {
  return event.target ?? (event as Event & { srcElement?: EventTarget | null }).srcElement ?? null;
}

function isResourceLoadError(event: Event) {
  const target = getTarget(event);
  if (!target || target === runtime.environment.browser.getWindow()) return false;
  const tagName = (target as { tagName?: unknown }).tagName;
  return typeof tagName === "string" && tagName.length > 0;
}

function handleWindowError(event: Event) {
  if (isResourceLoadError(event)) {
    capturedResourceErrors += 1;
    ErrorManager.createAssetLoadFailedError(getTarget(event), {
      eventType: "error",
      source: "SynCloudOS.GlobalWatchdog.resource"
    });
    return;
  }

  const errorEvent = event as ErrorEvent;
  capturedGlobalErrors += 1;
  ErrorManager.createGlobalScriptError(errorEvent.error, {
    colno: typeof errorEvent.colno === "number" ? errorEvent.colno : undefined,
    eventType: "error",
    filename: typeof errorEvent.filename === "string" ? errorEvent.filename : undefined,
    lineno: typeof errorEvent.lineno === "number" ? errorEvent.lineno : undefined,
    message: typeof errorEvent.message === "string" ? errorEvent.message : undefined,
    source: "SynCloudOS.GlobalWatchdog.error"
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  capturedPromiseRejections += 1;
  ErrorManager.createUnhandledPromiseRejectionError(event.reason, {
    eventType: "unhandledrejection",
    source: "SynCloudOS.GlobalWatchdog.unhandledrejection"
  });
}

const watchdog = {
  runtimeId: runtime.runtimeId,
  install() {
    const host = runtime.environment.browser.getWindow();
    if (installed || !host) return this.getStatus();

    removeErrorListener = runtime.environment.addWindowListener("error", handleWindowError, true);
    removeUnhandledRejectionListener = runtime.environment.addWindowListener("unhandledrejection", handleUnhandledRejection);
    installed = true;
    installedAt = runtime.environment.now();
    return this.getStatus();
  },

  uninstall() {
    if (!installed) return this.getStatus();

    removeErrorListener?.();
    removeErrorListener = null;
    removeUnhandledRejectionListener?.();
    removeUnhandledRejectionListener = null;
    installed = false;
    installedAt = null;
    return this.getStatus();
  },
  isInstalled() {
    return installed;
  },

  getStatus(): SynCloudOSGlobalWatchdogStatus {
    return {
      capturedGlobalErrors,
      capturedPromiseRejections,
      capturedResourceErrors,
      installed,
      installedAt
    };
  },

  dispose() {
    this.uninstall();
  }
};

return watchdog;
}
