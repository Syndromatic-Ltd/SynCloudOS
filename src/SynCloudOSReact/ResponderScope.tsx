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

import { Children, cloneElement, isValidElement, useContext, useInsertionEffect, useMemo, type FocusEvent, type PropsWithChildren, type ReactElement } from "react";
import type { ResponderKind, UndoOwner } from "../SynCloudOS/SynCloudOS";
import { registerMountedAppResponder } from "../SynCloudOS/SynCloudOS";
import { SynWareRuntimeContext, SynCloudOSRuntimeContext } from "./runtimeContext";
import { activateResponderHierarchy, clearOwnedResponderAnchor, ResponderHierarchyContext, useResponderHierarchy } from "./responderHierarchy";
import { applicationSessionFor } from "../SynCloudOS/AppSDK/applicationSession";

export interface ResponderScopeProps extends PropsWithChildren {
  readonly responderId: string;
  readonly kind: ResponderKind;
  readonly parentResponderId?: string;
  readonly scopeId: string;
  readonly undoOwner?: UndoOwner;
  readonly disabled?: boolean;
  readonly diagnosticsLabel?: string;
  /** Compose responder ownership into the existing host element without creating a layout box. */
  readonly asChild?: boolean;
}

export function ResponderScope({ responderId, kind, parentResponderId, scopeId, undoOwner, disabled = false, diagnosticsLabel, asChild = false, children }: ResponderScopeProps) {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  const runtime = appRuntime ?? kernelRuntime;
  if (!runtime) throw new Error("ResponderScope must be used within SynCloudOSProvider or a mounted SynWare.");
  const runtimeId = appRuntime ? `app:${appRuntime.app.bundleIdentifier}` : kernelRuntime!.runtimeId;
  const parentHierarchy = useResponderHierarchy();
  const resolvedParentResponderId = parentResponderId ?? parentHierarchy.responderId ?? undefined;
  const hierarchy = useMemo(() => ({
    ...parentHierarchy,
    runtimeId,
    responderId,
    applicationResponderId: kind === "application" ? responderId : parentHierarchy.applicationResponderId,
    windowResponderId: kind === "application" ? undefined : kind === "window" ? responderId : parentHierarchy.windowResponderId,
    documentResponderId: kind === "application" || kind === "window" ? undefined : kind === "document" ? responderId : parentHierarchy.documentResponderId,
  }), [kind, parentHierarchy, responderId, runtimeId]);
  // Focus scopes commit in a layout effect so their modal authority exists
  // before the browser can receive input. Responder registrations therefore
  // need an earlier phase: React runs insertion effects before every layout
  // effect, including for portal descendants.
  useInsertionEffect(() => {
    if (disabled || appRuntime) return;
    if (kind === "application" && responderId.startsWith("application:") &&
      applicationSessionFor({ runtimeId: kernelRuntime!.runtimeId, appId: responderId.slice("application:".length) })?.ownsApplicationResponder) return;
    const registration = kernelRuntime!.responders.register({ id: responderId, kind, parentId: resolvedParentResponderId, scopeId, undoOwner, diagnosticsLabel });
    return () => {
      clearOwnedResponderAnchor(kernelRuntime!, kind, responderId);
      registration.dispose({ cascade: true });
    };
  }, [appRuntime, kernelRuntime, responderId, kind, resolvedParentResponderId, scopeId, undoOwner, disabled, diagnosticsLabel]);
  // App responder leases commit in the insertion phase as well. This ensures
  // a descendant FocusScope's layout effect can resolve its parent responder;
  // the mounted registrar still queues a child whose parent insertion is later
  // in React's traversal.
  useInsertionEffect(() => {
    if (disabled || !appRuntime) return;
    const registration = registerMountedAppResponder(appRuntime, { id: responderId, kind, parentId: resolvedParentResponderId, scopeId, undoOwner, diagnosticsLabel });
    return () => { registration.dispose({ cascade: true }); };
  }, [appRuntime, responderId, kind, resolvedParentResponderId, scopeId, undoOwner, disabled, diagnosticsLabel]);
  const handleFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (disabled) return;
    if (kind === "view") {
      // A plain descendant belongs to this view; an independently registered
      // control or child view keeps its own first-responder authority.
      if (event.target.closest("[data-syncloudos-responder-id]") !== event.currentTarget || appRuntime?.signal.aborted) return;
      runtime.focus.requestFocus(responderId);
      return;
    }
    if (!(kind === "application" || kind === "window" || kind === "document")) return;
    if (appRuntime) appRuntime.focus.requestFocus(responderId);
    else activateResponderHierarchy(kernelRuntime!, hierarchy);
  };
  const hostProps = {
    "data-syncloudos-runtime-owner": runtimeId,
    "data-syncloudos-responder-id": disabled ? undefined : responderId,
    "data-syncloudos-focus-scope": scopeId,
    onFocusCapture: handleFocusCapture,
  };
  let host = <div {...hostProps}>{children}</div>;
  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) throw new TypeError("ResponderScope asChild requires one React element child.");
    const element = child as ReactElement<Record<string, unknown>>;
    const childFocusCapture = element.props.onFocusCapture as ((event: FocusEvent<HTMLElement>) => void) | undefined;
    host = cloneElement(element, {
      ...hostProps,
      onFocusCapture: (event: FocusEvent<HTMLElement>) => {
        childFocusCapture?.(event);
        if (!event.isPropagationStopped()) handleFocusCapture(event);
      },
    });
  }
  return (
    <ResponderHierarchyContext.Provider value={hierarchy}>
      {host}
    </ResponderHierarchyContext.Provider>
  );
}
