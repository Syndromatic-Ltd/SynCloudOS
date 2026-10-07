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

import { useContext, useMemo, type ReactNode } from "react";
import type { FocusScopeKind } from "../SynCloudOS/SynCloudOS";
import { FocusScope } from "./FocusScope";
import { AppFocusScope } from "./AppFocusScope";
import { useResponderHierarchy } from "./responderHierarchy";
import { SynWareRuntimeContext, SynCloudOSRuntimeContext } from "./runtimeContext";
import { getMountedAppOverlayAuthority } from "../SynCloudOS/SynCloudOS";

/** Structural counterpart to NSEFocusPort; kept here so NSE stays runtime-neutral. */
export interface RuntimeNSEFocusScopeOptions {
  readonly scopeId: string;
  readonly kind: FocusScopeKind;
  readonly parentResponderId?: string;
  readonly parentScopeId?: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  readonly asChild?: boolean;
}

export interface RuntimeNSEFocusPort {
  readonly runtimeId: string;
  wrapFocusScope(options: RuntimeNSEFocusScopeOptions, children: ReactNode): ReactNode;
}

export function useRuntimeNSEFocusPort(defaultParentResponderId?: string): RuntimeNSEFocusPort {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  const hierarchy = useResponderHierarchy();
  const appAuthority = appRuntime ? getMountedAppOverlayAuthority(appRuntime) : null;
  const runtimeId = appAuthority?.runtimeId ?? kernelRuntime?.runtimeId;
  if (!runtimeId) throw new Error("useRuntimeNSEFocusPort must be used within SynCloudOSProvider or a mounted SynWare.");
  return useMemo(() => ({
    runtimeId,
    wrapFocusScope(options: RuntimeNSEFocusScopeOptions, children: ReactNode) {
      if (appRuntime) {
        return <AppFocusScope runtime={appRuntime} runtimeId={runtimeId} options={options}>{children}</AppFocusScope>;
      }
      const inheritedResponderId = hierarchy.runtimeId === runtimeId ? hierarchy.responderId : null;
      const parentResponderId = options.parentResponderId ?? defaultParentResponderId ?? inheritedResponderId ?? "workspace";
      return (
        <FocusScope
          key={`${runtimeId}:${options.scopeId}`}
          scopeId={options.scopeId}
          kind={options.kind}
          parentScopeId={options.parentScopeId}
          parentResponderId={parentResponderId}
          modal={options.modal}
          trapFocus={options.trapFocus}
          restoreFocus={options.restoreFocus}
          asChild={options.asChild}
        >
          {children}
        </FocusScope>
      );
    },
  }), [appRuntime, defaultParentResponderId, hierarchy.responderId, hierarchy.runtimeId, runtimeId]);
}

/**
 * Runtime-backed interaction port for NSE overlays. NSE receives this through
 * its own provider so the presentation layer never imports the React runtime
 * layer directly.
 */
export function useRuntimeNSEOverlayPort(defaultParentResponderId?: string) {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  const focusPort = useRuntimeNSEFocusPort(defaultParentResponderId);
  if (appRuntime) return useMemo(() => {
    const authority = getMountedAppOverlayAuthority(appRuntime);
    return ({
    runtimeId: authority.runtimeId,
    signal: appRuntime.signal,
    environment: authority.environment,
    restoreFocus(responderId: string, anchor: HTMLElement | null) {
      const result = appRuntime.focus.requestFocus(responderId);
      if (result.status === "focused" && anchor?.isConnected) anchor.focus({ preventScroll: true });
    },
    observeFiniteWork: authority.observeFiniteWork,
    reportPlacementFailure({ overlayId, overlayKind }: { readonly overlayId: string; readonly overlayKind: string }) {
      appRuntime.errors.capture({ code: "UNKNOWN_RUNTIME_ERROR", title: "SynCloudOS could not place an overlay.", message: "The interface could not position an overlay.", source: "NSE.Overlays", severity: "warning", recoverable: true, suggestedActions: ["dismiss"], category: "event", context: { overlayId, overlayKind }, fingerprint: `nse-overlay-placement:${overlayId}` });
    },
    wrapFocusScope: focusPort.wrapFocusScope,
  });
  }, [appRuntime, focusPort]);
  if (!kernelRuntime) throw new Error("useRuntimeNSEOverlayPort must be used within SynCloudOSProvider or a mounted SynWare.");
  const runtime = kernelRuntime;
  return useMemo(() => ({
    runtimeId: runtime.runtimeId,
    signal: runtime.signal,
    environment: {
      browser: runtime.environment.browser,
      workArea: {
        getSnapshot: () => runtime.environment.workArea.getSnapshot(),
        subscribe: (listener: () => void) => runtime.environment.workArea.subscribe(() => listener()),
      },
      visualViewport: {
        getSnapshot: () => runtime.environment.visualViewport.getSnapshot(),
        subscribe: (listener: () => void) => runtime.environment.visualViewport.subscribe(() => listener()),
      },
      presentation: {
        getSnapshot: () => runtime.presentationTraits.getSnapshot(),
        subscribe: (listener: () => void) => runtime.presentationTraits.subscribe(listener),
      },
      setTimeout: runtime.environment.setTimeout,
      clearTimeout: runtime.environment.clearTimeout,
    },
    restoreFocus(responderId: string, anchor: HTMLElement | null) {
      const result = runtime.focus.requestFocus(responderId);
      if (result.status === "focused" && anchor?.isConnected) anchor.focus({ preventScroll: true });
    },
    reportPlacementFailure({ overlayId, overlayKind }: { readonly overlayId: string; readonly overlayKind: string }) {
      runtime.errors.capture({
        code: "UNKNOWN_RUNTIME_ERROR",
        title: "SynCloudOS could not place an overlay.",
        message: "The interface could not position an overlay.",
        source: "NSE.Overlays",
        severity: "warning",
        recoverable: true,
        suggestedActions: ["dismiss"],
        category: "event",
        context: { overlayId, overlayKind },
        fingerprint: `nse-overlay-placement:${overlayId}`,
      });
    },
    wrapFocusScope: focusPort.wrapFocusScope,
  }), [focusPort, runtime]);
}
