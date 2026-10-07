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
      const resource = getTarget(event) as { tagName?: string; currentSrc?: string; src?: string; href?: string } | null;
      runtime.errors.capture({
        code: "ASSET_LOAD_FAILED",
        title: "A SynCloudOS resource could not be loaded.",
        message: "A required resource failed to load.",
        technicalMessage: resource?.currentSrc ?? resource?.src ?? resource?.href ?? resource?.tagName ?? "Unknown resource",
        source: "SynCloudOS.GlobalWatchdog.resource",
        severity: "error",
        recoverable: true,
        suggestedActions: ["retry", "dismiss"],
        category: "resource",
      });
      return;
    }
    const errorEvent = event as ErrorEvent;
    capturedGlobalErrors += 1;
    const cause = errorEvent.error ?? errorEvent.message ?? "Unknown global script error";
    runtime.errors.capture({
      code: "GLOBAL_SCRIPT_ERROR",
      title: "SynCloudOS encountered a script error.",
      message: "An unexpected script error was captured by the runtime watchdog.",
      technicalMessage: cause instanceof Error ? cause.message : String(cause),
      technicalDetails: cause instanceof Error ? cause.stack : undefined,
      source: "SynCloudOS.GlobalWatchdog.error",
      severity: "error",
      recoverable: true,
      suggestedActions: ["reload", "dismiss"],
      category: "watchdog",
      context: {
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
      },
    });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    capturedPromiseRejections += 1;
    const reason = event.reason;
    runtime.errors.capture({
      code: "UNHANDLED_PROMISE_REJECTION",
      title: "SynCloudOS caught an unhandled promise rejection.",
      message: "Asynchronous runtime work failed without a local handler.",
      technicalMessage: reason instanceof Error ? reason.message : String(reason),
      technicalDetails: reason instanceof Error ? reason.stack : undefined,
      source: "SynCloudOS.GlobalWatchdog.unhandledrejection",
      severity: "error",
      recoverable: true,
      suggestedActions: ["retry", "dismiss"],
      category: "watchdog",
    });
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
