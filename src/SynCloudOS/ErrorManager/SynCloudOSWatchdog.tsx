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

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { CapturedSynCloudOSError } from "./errorTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

type WatchdogScope = "root" | "app";

export interface AppPresentationWatchdogContext {
  readonly id: string;
  readonly kind: "appView" | "window";
  readonly zIndex: number;
}

interface SynCloudOSWatchdogProps {
  runtime: Pick<SynCloudOSRuntime, "errors" | "environment">;
  children: ReactNode;
  watchdogName: string;
  scope: WatchdogScope;
  app?: SynCloudOSAppInfo | null;
  presentation?: AppPresentationWatchdogContext | null;
  resetKey?: string;
  fallback?: (error: CapturedSynCloudOSError | null) => ReactNode;
}

interface SynCloudOSWatchdogState {
  hasError: boolean;
  rawError: unknown;
  capturedError: CapturedSynCloudOSError | null;
}

function fallbackCapturedError(
  error: unknown,
  watchdogName: string,
  scope: WatchdogScope,
  now: number,
  app?: SynCloudOSAppInfo | null,
): CapturedSynCloudOSError {
  const message = error instanceof Error && error.message ? error.message : String(error);
  const details = error instanceof Error && error.stack ? error.stack : String(error);

  return {
    id: `uncaptured-watchdog-error-${now}`,
    at: now,
    timestamp: new Date(now).toISOString(),
    code: scope === "root" ? "UNKNOWN_RUNTIME_ERROR" : "APP_CONTENT_FAILED",
    title: scope === "root" ? "Webspring caught a runtime error." : `${app?.packageName ?? "A SynWare"} stopped unexpectedly.`,
    message: scope === "root"
      ? "SynCloudOS caught an unexpected rendering error before it could blank the screen."
      : "An unexpected error has prevented this application from working properly.",
    appId: app?.id,
    packageName: app?.packageName,
    technicalMessage: message,
    technicalDetails: details,
    source: "SynCloudOS.Watchdog",
    severity: "fatal",
    recoverable: false,
    suggestedActions: scope === "root" ? ["reload"] : ["returnToWebspring"],
    context: {
      watchdog: watchdogName,
      captureStatus: "renderFallbackBeforeCapture"
    }
  };
}

export class SynCloudOSWatchdog extends Component<SynCloudOSWatchdogProps, SynCloudOSWatchdogState> {
  state: SynCloudOSWatchdogState = {
    hasError: false,
    rawError: null,
    capturedError: null
  };

  private capturedErrorId: string | null = null;
  private localFallbackError: CapturedSynCloudOSError | null = null;

  static getDerivedStateFromError(error: unknown): Partial<SynCloudOSWatchdogState> {
    return {
      hasError: true,
      rawError: error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.capturedErrorId) return;

    const context = {
      watchdog: this.props.watchdogName,
      source: this.props.scope === "root" ? "SynCloudOS.RootWatchdog" : "SynCloudOS.AppWatchdog",
      componentStack: errorInfo.componentStack,
      appId: this.props.app?.id ?? null,
      packageName: this.props.app?.packageName ?? null,
      windowId: this.props.presentation?.kind === "window" ? this.props.presentation.id : null,
      presentation: this.props.presentation?.kind ?? null
    };

    let captured: CapturedSynCloudOSError;
    try {
      captured = this.props.runtime.errors.capture({
        code: this.props.scope === "root" ? "UNKNOWN_RUNTIME_ERROR" : "APP_CONTENT_FAILED",
        title: this.props.scope === "root" ? "Webspring caught a runtime error." : `${this.props.app?.packageName ?? "A SynWare"} stopped unexpectedly.`,
        message: this.props.scope === "root"
          ? "SynCloudOS caught an unexpected rendering error before it could blank the screen."
          : "An unexpected error has prevented this application from working properly.",
        appId: this.props.app?.id,
        packageName: this.props.app?.packageName,
        technicalMessage: error.message,
        technicalDetails: error.stack ?? errorInfo.componentStack ?? undefined,
        source: context.source,
        severity: "fatal",
        recoverable: false,
        suggestedActions: this.props.scope === "root" ? ["reload"] : ["returnToWebspring"],
        context,
      });
    } catch (captureError) {
      captured = fallbackCapturedError(captureError, this.props.watchdogName, this.props.scope, this.props.runtime.environment.now(), this.props.app);
    }

    this.capturedErrorId = captured.id;
    this.setState({ capturedError: captured });
  }

  componentDidUpdate(previousProps: SynCloudOSWatchdogProps) {
    if (previousProps.resetKey === this.props.resetKey) return;
    if (!this.state.hasError && !this.capturedErrorId) return;

    this.capturedErrorId = null;
    this.localFallbackError = null;
    this.setState({
      hasError: false,
      rawError: null,
      capturedError: null
    });
  }

  private getDisplayError() {
    if (this.state.capturedError) return this.state.capturedError;
    if (!this.localFallbackError) {
      this.localFallbackError = fallbackCapturedError(
        this.state.rawError,
        this.props.watchdogName,
        this.props.scope,
        this.props.runtime.environment.now(),
        this.props.app,
      );
    }
    return this.localFallbackError;
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const displayError = this.getDisplayError();
    // Error capture belongs to the runtime, while the physical alert belongs
    // to the host's interaction layer. This preserves the same typed
    // fallback for root and application scopes without reversing dependency
    // direction from runtime back into NSE.
    if (this.props.fallback) return this.props.fallback(displayError);
    // Runtime-only consumers retain a minimal semantic fallback. Production
    // composition supplies the canonical modal surface above.
    return <div className="syncloudos-root-error-shell" role="alert">{displayError.title}</div>;
  }
}

export function AppPresentationErrorFallback({
  presentation,
}: {
  app: SynCloudOSAppInfo;
  presentation: AppPresentationWatchdogContext;
}) {
  const isWindowed = presentation.kind === "window";

  return (
    <div
      className={`${isWindowed ? "webspring-windowed-app-frame" : "webspring-app-view-frame"} webspring-app-watchdog-frame`}
      style={{ zIndex: isWindowed ? presentation.zIndex : presentation.zIndex + 70 }}
      aria-hidden="true"
    />
  );
}
