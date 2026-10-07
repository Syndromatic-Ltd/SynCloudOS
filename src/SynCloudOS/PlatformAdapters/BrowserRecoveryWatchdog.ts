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

import type { AuthenticationService } from "../SynCloudOS";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

interface RecoveryWorker {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  terminate(): void;
}
interface RecoveryWatchdogOptions {
  getSiteName(): string;
  authentication?: Pick<AuthenticationService, "getSnapshot" | "subscribe" | "refresh">;
  createWorker?: () => RecoveryWorker | null;
}
function createWorker(): RecoveryWorker | null {
  return typeof Worker === "undefined" ? null
    : new Worker(new URL("./browserResponsiveness.worker.ts", import.meta.url), { type: "module", name: "SynCloudOS Recovery Watchdog" });
}

/** Private browser host owner. No global fetch interception or product policy. */
export function createBrowserRecoveryWatchdog(runtime: SynCloudOSRuntime, options: RecoveryWatchdogOptions) {
  let installed = false;
  let worker: RecoveryWorker | null = null;
  let mode: "worker" | "long-task" | "unavailable" = "unavailable";
  let epoch = 0;
  let suspended = false;
  let lastReportedProbe = 0;
  let authenticationErrorId: string | null = null;
  let offlineErrorId: string | null = null;
  let retrying = false;
  const releases: Array<() => void> = [];
  const document = runtime.environment.browser.getDocument();
  const isVisible = () => installed && !suspended && document?.visibilityState === "visible";
  const isOffline = () => runtime.environment.browser.getNavigator()?.onLine === false;
  const ownsError = (id: string | null) => id !== null && runtime.errors.getHistory().some(error => error.id === id);
  const context = () => ({ siteName: options.getSiteName(), source: "SynCloudOS.BrowserRecoveryWatchdog", scope: "site" });

  async function retryAuthentication() {
    if (!installed || retrying || !options.authentication) return;
    retrying = true;
    try { await options.authentication.refresh(runtime.signal); }
    catch { /* Cancellation and protocol errors belong to the authentication service. */ }
    finally { retrying = false; if (installed) authenticationChanged(); }
  }
  function clearAuthenticationError() {
    if (authenticationErrorId) runtime.errors.dismiss(authenticationErrorId);
    authenticationErrorId = null;
  }
  function authenticationChanged() {
    if (!installed || !options.authentication) return;
    const snapshot = options.authentication.getSnapshot();
    if (snapshot.errorCode === "CONNECTION_ERROR" || snapshot.errorCode === "REQUEST_TIMEOUT") {
      if (isOffline()) { reportOffline(); return; }
      const code = snapshot.errorCode === "REQUEST_TIMEOUT" ? "SITE_NOT_RESPONDING" : "CONNECTION_ERROR";
      if (ownsError(authenticationErrorId) && runtime.errors.getHistory().find(error => error.id === authenticationErrorId)?.code === code) return;
      clearAuthenticationError();
      const errorContext = { ...context(), reason: snapshot.errorCode === "REQUEST_TIMEOUT" ? "request-timeout" : "transport-failure", technicalMessage: snapshot.error ?? undefined };
      const error = snapshot.errorCode === "REQUEST_TIMEOUT"
        ? runtime.errors.createNotRespondingError(null, errorContext, retryAuthentication)
        : runtime.errors.createConnectionError(null, new Error(snapshot.error ?? "Connection failed."), errorContext, retryAuthentication);
      authenticationErrorId = error.id;
    } else if (snapshot.status !== "checking" && snapshot.status !== "authenticating") clearAuthenticationError();
  }
  function reportOffline() {
    if (!installed || !isOffline() || ownsError(offlineErrorId)) return;
    clearAuthenticationError();
    offlineErrorId = runtime.errors.createConnectionError(null, new Error("The browser reports offline."), {
      ...context(), reason: "offline", fingerprint: "browser-connection:offline",
    }, options.authentication ? retryAuthentication : undefined).id;
  }
  function reportStall(durationMs: number) {
    if (!isVisible()) return;
    runtime.errors.createNotRespondingError(null, {
      ...context(), reason: "main-thread-stall", durationMs,
      activeAppId: runtime.store.getSnapshot().application.activeAppId,
      // A shared event loop cannot establish which app caused the stall.
      fingerprint: `browser-responsiveness:${epoch}:${lastReportedProbe}`,
    });
  }
  function resetProbe() {
    epoch += 1;
    lastReportedProbe = 0;
    worker?.postMessage({ kind: "state", epoch, visible: isVisible() });
  }
  function startFallback() {
    if (!installed || mode === "long-task") return;
    if (runtime.environment.observeLongTasks) {
      mode = "long-task";
      releases.push(runtime.environment.observeLongTasks(durationMs => {
        if (durationMs >= 10000) { lastReportedProbe += 1; reportStall(durationMs); }
      }));
    } else mode = "unavailable";
  }
  function releaseWorker() {
    worker?.removeEventListener("message", message);
    worker?.removeEventListener("error", workerFailed);
    worker?.terminate();
    worker = null;
  }
  function workerFailed(event: Event) {
    event.preventDefault();
    releaseWorker();
    startFallback();
  }
  function message({ data }: MessageEvent) {
    if (!installed || !data || typeof data !== "object") return;
    // Installation already sent the current state. A queued startup handshake
    // must not invalidate evidence collected while the main thread was blocked.
    if (data.kind === "ready") return;
    if (data.epoch !== epoch || !isVisible() || !Number.isInteger(data.id) || data.id <= 0) return;
    if (data.kind === "ping") worker?.postMessage({ kind: "pong", epoch, id: data.id });
    else if (data.kind === "stalled" && data.id > lastReportedProbe && Number.isFinite(data.durationMs) && data.durationMs >= 10000) {
      lastReportedProbe = data.id;
      reportStall(data.durationMs);
    }
  }
  function online() {
    if (offlineErrorId) runtime.errors.dismiss(offlineErrorId);
    offlineErrorId = null;
    // The authentication service owns passive revalidation and its logout fence.
    authenticationChanged();
  }
  const suspend = () => { suspended = true; resetProbe(); };
  const resume = () => { suspended = false; resetProbe(); };

  const watchdog = {
    install() {
      if (installed || runtime.signal.aborted) return this.getStatus();
      installed = true;
      try { worker = (options.createWorker ?? createWorker)(); } catch { worker = null; }
      if (worker) {
        mode = "worker";
        worker.addEventListener("message", message);
        worker.addEventListener("error", workerFailed);
        resetProbe();
      } else startFallback();
      document?.addEventListener("visibilitychange", resetProbe);
      document?.addEventListener("freeze", suspend);
      document?.addEventListener("resume", resume);
      releases.push(() => document?.removeEventListener("visibilitychange", resetProbe),
        () => document?.removeEventListener("freeze", suspend), () => document?.removeEventListener("resume", resume),
        runtime.environment.addWindowListener("pagehide", suspend), runtime.environment.addWindowListener("pageshow", resume),
        runtime.environment.addWindowListener("offline", reportOffline), runtime.environment.addWindowListener("online", online));
      if (options.authentication) releases.push(options.authentication.subscribe(authenticationChanged));
      runtime.signal.addEventListener("abort", dispose, { once: true });
      releases.push(() => runtime.signal.removeEventListener("abort", dispose));
      reportOffline();
      authenticationChanged();
      return this.getStatus();
    },
    getStatus: () => ({ installed, responsiveness: mode }),
    dispose,
  };
  function dispose() {
    installed = false;
    releaseWorker();
    for (const release of releases.splice(0).reverse()) release();
    mode = "unavailable";
  }
  return watchdog;
}
