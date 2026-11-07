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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type {
  SynCloudOSBundleLoader,
  SynCloudOSLifecycle,
  SynCloudOSRuntime,
  SynCloudOSRuntimeStore,
  SynCloudOSServiceRegistry,
} from "../Runtime/runtimeInstanceTypes";
import type {
  LifecycleRequestOptions,
  SynCloudOSLifecycleTransitionOptions,
  SynCloudOSLifecycleTransitionResult,
} from "../Lifecycle/lifecycleTypes";
import type { AppManagerLaunchExplanation, AppManagerRuntimeRecord, SynCloudOSAppLifecycleState } from "./appManagerTypes";
import type { ApplicationSessionMutationTicket } from "../Documents";
import { DocumentUnavailableError } from "../Documents/DocumentErrors";

type AppManagerLifecyclePort = Pick<SynCloudOSLifecycle, "launch" | "activate"> & {
  transition(
    appId: string,
    to: SynCloudOSAppLifecycleState,
    options?: SynCloudOSLifecycleTransitionOptions,
  ): SynCloudOSLifecycleTransitionResult;
  validateAccess?: (appId: string, stage: "launch" | "activate") => { ok: boolean; reason?: string };
};

type AppManagerRuntimePort = Pick<SynCloudOSRuntime, "undo" | "documents" | "login" | "policy"> & {
  readonly apps: Pick<SynCloudOSRuntime["apps"], "getApp">;
};

export interface AppManagerDependencies {
  bundleLoader: Pick<SynCloudOSBundleLoader, "loadBundle" | "invokeLifecycleHook">;
  lifecycle: AppManagerLifecyclePort;
  store: Pick<SynCloudOSRuntimeStore, "getSnapshot">;
  serviceRegistry: Pick<SynCloudOSServiceRegistry, "getServiceReport">;
  runtime?: AppManagerRuntimePort;
}

export class AppManager {
  readonly appInfo: SynCloudOSAppInfo;
  private loadingPromise: Promise<AppManager> | null = null;
  private launchOperation: { readonly signal: AbortSignal; cancel(reason?: string): void; result: Promise<unknown> } | null = null;
  private launchPromise: Promise<AppManager> | null = null;

  constructor(appInfo: SynCloudOSAppInfo, private readonly dependencies: AppManagerDependencies) {
    this.appInfo = appInfo;
    dependencies.runtime?.undo.create({ kind: "application", id: appInfo.bundleIdentifier });
  }

  get bundleIdentifier() {
    return this.appInfo.bundleIdentifier;
  }

  private getCurrentAppInfo(): SynCloudOSAppInfo {
    return this.dependencies.store.getSnapshot().appInfo[normalizeBundleIdentifier(this.bundleIdentifier)] ?? this.appInfo;
  }

  getState(): SynCloudOSAppLifecycleState {
    return this.dependencies.store.getSnapshot().lifecycle[normalizeBundleIdentifier(this.bundleIdentifier)] ?? "registered";
  }

  getRecord(): AppManagerRuntimeRecord {
    return this.dependencies.store.getSnapshot().managers[normalizeBundleIdentifier(this.bundleIdentifier)] ?? this.createRecord();
  }

  createRecord(previousRecord: AppManagerRuntimeRecord | null = null, lifecycleState: SynCloudOSAppLifecycleState = this.getState()): AppManagerRuntimeRecord {
    const appInfo = this.getCurrentAppInfo();
    const disabled = appInfo.isDisabled || lifecycleState === "disabled";
    const readiness =
      disabled
        ? "cold"
        : lifecycleState === "failed"
          ? "failed"
          : lifecycleState === "loading"
            ? "loading"
            : lifecycleState === "ready" || lifecycleState === "launching" || lifecycleState === "active" || lifecycleState === "suspended"
              ? "ready"
              : previousRecord?.readiness ?? "cold";

    return {
      appId: this.bundleIdentifier,
      lifecycleState,
      readiness,
      requiredServices: { ...appInfo.serviceStatus },
      disabled,
      activeAt: previousRecord?.activeAt ?? null,
      suspendedAt: previousRecord?.suspendedAt ?? null,
      failedAt: previousRecord?.failedAt ?? null,
      closedAt: previousRecord?.closedAt ?? null,
      launchCount: previousRecord?.launchCount ?? 0,
      lastLaunchAt: previousRecord?.lastLaunchAt ?? null,
      lastError: disabled ? `Required services unavailable: ${appInfo.requiredServices.join(", ") || "unknown"}.` : previousRecord?.lastError ?? null
    };
  }

  explainLaunch(): AppManagerLaunchExplanation {
    const appInfo = this.getCurrentAppInfo();
    const state = this.getState();
    const serviceReport = this.dependencies.serviceRegistry.getServiceReport(appInfo.requiredServices);
    const blockers: string[] = [];

    if (appInfo.isDisabled || state === "disabled") {
      blockers.push(`${appInfo.packageName} is disabled.`);
    }
    if (!serviceReport.ok) {
      blockers.push(`Required services unavailable: ${serviceReport.missing.join(", ") || "unknown"}.`);
    }

    return {
      appId: this.bundleIdentifier,
      canLaunch: blockers.length === 0,
      reason: blockers.length === 0 ? `${appInfo.packageName} can launch.` : blockers.join(" "),
      blockers,
      lifecycleState: state,
      serviceReport,
      disabled: appInfo.isDisabled || state === "disabled"
    };
  }

  canLaunch() {
    return this.explainLaunch().canLaunch;
  }

  transition(to: SynCloudOSAppLifecycleState, reason?: string) {
    // Activation is a protected operation. The boolean contract remains for
    // callers that use resume(), while the mutation is owned by the runtime
    // lifecycle operation.
    if (to === "active") {
      if (!(["ready", "suspended"] as SynCloudOSAppLifecycleState[]).includes(this.getState())) {
        return this.dependencies.lifecycle.transition(this.bundleIdentifier, to, {
          reason,
          source: "SynCloudOS.AppManager.transition",
        }).ok;
      }
      return this.resume(reason);
    }
    if (to === "launching") return false;
    return this.dependencies.lifecycle.transition(this.bundleIdentifier, to, {
      reason,
      source: "SynCloudOS.AppManager.transition"
    }).ok;
  }

  getReady(applicationMutation?: ApplicationSessionMutationTicket) {
    const effectiveMutation = applicationMutation ??
      this.dependencies.runtime?.documents.captureApplicationMutation(this.bundleIdentifier) ??
      null;
    this.dependencies.runtime?.documents.validateApplicationMutation(effectiveMutation);
    const appInfo = this.getCurrentAppInfo();
    if (!this.canLaunch()) {
      this.transition("disabled", "required services unavailable");
      return Promise.reject(new Error(`${appInfo.packageName} is disabled.`));
    }
    const lifecycleAccess = this.dependencies.lifecycle.validateAccess?.(this.bundleIdentifier, "launch");
    if (lifecycleAccess && !lifecycleAccess.ok) {
      return Promise.reject(new Error(lifecycleAccess.reason ?? `SynCloudOS could not prepare ${this.bundleIdentifier}.`));
    }

    const state = this.getState();
    if (state === "ready" || state === "active" || state === "launching" || state === "suspended") {
      return Promise.resolve(this);
    }
    if (state === "loading" && this.loadingPromise) return this.loadingPromise;

    this.transition("loading", "getReady");
    this.loadingPromise = this.dependencies.bundleLoader.loadBundle(this.bundleIdentifier)
      .then(() => {
        this.dependencies.runtime?.documents.validateApplicationMutation(effectiveMutation);
        if (this.getState() === "loading") this.transition("ready", "content bundle loaded");
        return this;
      })
      .catch((error: unknown) => {
        if (!(effectiveMutation && error instanceof DocumentUnavailableError)) this.fail(error);
        throw error;
      })
      .finally(() => {
        this.loadingPromise = null;
      });
    return this.loadingPromise!;
  }

  launch(applicationMutation?: ApplicationSessionMutationTicket, options: LifecycleRequestOptions = {}): Promise<AppManager> {
    const effectiveMutation = applicationMutation ??
      this.dependencies.runtime?.documents.captureApplicationMutation(this.bundleIdentifier) ??
      null;
    this.dependencies.runtime?.documents.validateApplicationMutation(effectiveMutation);
    const state = this.getState();
    if (this.launchPromise && this.launchOperation?.signal.aborted) {
      // A replacement caller owns a new operation, but the cancelled operation
      // must settle before a new lifecycle can use this manager.
      return this.launchPromise.catch(() => undefined).then(() => this.launch(effectiveMutation ?? undefined, options));
    }
    if (state === "active" || state === "launching") return Promise.resolve(this);
    if (this.launchPromise) return this.launchPromise;
    const handle = this.dependencies.lifecycle.launch(this.bundleIdentifier, {
      ...options,
      reason: options.reason ?? "SynCloudOS.AppManager.launch",
      commitGuard: () => {
        this.dependencies.runtime?.documents.validateApplicationMutation(effectiveMutation);
        options.commitGuard?.();
      },
    });
    this.launchOperation = handle;
    const promise = handle.result.then((result: { status: string; committed: boolean; error?: { message?: string }; reason?: string }) => {
      this.dependencies.runtime?.documents.validateApplicationMutation(effectiveMutation);
      if (result.status === "completed" && result.committed) return this;
      throw new Error(result.error?.message ?? result.reason ?? `SynCloudOS could not launch ${this.bundleIdentifier}.`);
    }).finally(() => {
      if (this.launchOperation === handle) this.launchOperation = null;
      if (this.launchPromise === promise) this.launchPromise = null;
    });
    this.launchPromise = promise;
    return promise;
  }

  async cancelApplicationWorkForClose(reason = "application-close") {
    const handle = this.launchOperation;
    handle?.cancel(reason);
    if (handle) await handle.result.catch(() => undefined);
    const state = this.getState();
    if (state === "loading" || state === "launching") this.transition("closed", reason);
  }

  open() {
    return this.launch();
  }

  markReady() {
    return this.transition("ready", "markReady");
  }

  resume(reason = "resume") {
    const state = this.getState();
    if (!(["ready", "suspended"] as SynCloudOSAppLifecycleState[]).includes(state)) return false;
    const lifecycleAccess = this.dependencies.lifecycle.validateAccess?.(this.bundleIdentifier, "activate");
    if (lifecycleAccess && !lifecycleAccess.ok) return false;
    const runtime = this.dependencies.runtime;
    if (!runtime?.login.getSnapshot().isAuthorised) return false;
    if (!runtime.policy.evaluate({ action: "app.launch", app: runtime.apps.getApp(this.bundleIdentifier), context: { appId: this.bundleIdentifier } }).allowed) return false;
    const handle = this.dependencies.lifecycle.activate(this.bundleIdentifier, {
      reason: `SynCloudOS.AppManager.${reason}`,
    });
    void handle.result;
    return true;
  }

  fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const ok = this.transition("failed", message);
    void this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationDidFail", { error, reason: message });
    return ok;
  }

  suspend() {
    void this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationWillSuspend", { reason: "WindowManager.closeWindow" });
    const ok = this.transition("suspended", "WindowManager.closeWindow");
    if (ok) void this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationDidSuspend", { reason: "WindowManager.closeWindow" });
  }

  async suspendForApplicationClose(reason = "WindowManager.closeApplication") {
    await this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationWillSuspend", { reason });
    const ok = this.transition("suspended", reason);
    if (ok) await this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationDidSuspend", { reason });
    return ok;
  }

  close() {
    void this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationWillClose", { reason: "close" });
    const ok = this.transition("closed", "close");
    if (ok) void this.dependencies.bundleLoader.invokeLifecycleHook(this.bundleIdentifier, "applicationDidClose", { reason: "close" });
  }
}
