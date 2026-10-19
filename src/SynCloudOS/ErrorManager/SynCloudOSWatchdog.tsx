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
import type { CapturedSynCloudOSError, SynCloudOSErrorPayload } from "./errorTypes";
import { createCapturedError } from "./errorReport";
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

/** The capture a watchdog makes for `error`: identity comes from the thrown value. */
function watchdogPayload(error: unknown, props: SynCloudOSWatchdogProps, componentStack?: string | null): SynCloudOSErrorPayload {
  const root = props.scope === "root";
  return {
    code: root ? "UNKNOWN_RUNTIME_ERROR" : "APP_CONTENT_FAILED",
    title: root ? "SynCloudOS stopped unexpectedly." : `${props.app?.displayName ?? "An application"} stopped unexpectedly.`,
    message: root
      ? "An unexpected error has prevented SynCloudOS from working properly."
      : "An unexpected error has prevented this application from working properly.",
    error,
    appId: props.app?.id,
    packageName: props.app?.packageName,
    source: root ? "SynCloudOS.RootWatchdog" : "SynCloudOS.AppWatchdog",
    severity: "fatal",
    recoverable: false,
    suggestedActions: root ? ["reload"] : ["returnToWebspring"],
    category: root ? "watchdog" : "app",
    context: {
      watchdog: props.watchdogName,
      ...(componentStack ? { componentStack } : {}),
      ...(props.presentation?.kind === "window" ? { windowId: props.presentation.id } : {}),
      ...(props.presentation ? { presentation: props.presentation.kind } : {}),
    },
  };
}

/** Shown when the runtime could not record the failure (or before it has):
 * the same identity, formatted locally without runtime state. */
function uncapturedError(error: unknown, props: SynCloudOSWatchdogProps, componentStack?: string | null): CapturedSynCloudOSError {
  const now = props.runtime.environment.now();
  const payload = watchdogPayload(error, props, componentStack);
  return createCapturedError({ ...payload, context: { ...payload.context, captureStatus: "notCaptured" } }, {
    id: `uncaptured-watchdog-error-${now}`,
    at: now,
    timestamp: new Date(now).toISOString(),
    appDisplayName: props.app?.displayName,
  });
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

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    if (this.capturedErrorId) return;

    let captured: CapturedSynCloudOSError;
    try {
      captured = this.props.runtime.errors.capture(watchdogPayload(error, this.props, errorInfo.componentStack));
    } catch {
      captured = uncapturedError(error, this.props, errorInfo.componentStack);
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
      this.localFallbackError = uncapturedError(this.state.rawError, this.props);
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
