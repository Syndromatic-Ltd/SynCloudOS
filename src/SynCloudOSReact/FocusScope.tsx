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

import { cloneElement, isValidElement, useContext, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PropsWithChildren, type ReactElement } from "react";
import { type FocusScopeKind, type UndoOwner } from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "./SynCloudOSProvider";
import { retainUndoOwner } from "./undoOwnerLease";
import { createRuntimeInputProtocol, useRuntimeInputProtocol } from "./runtimeInputProtocol";
import { AppFocusScope } from "./AppFocusScope";
import { SynWareRuntimeContext, SynCloudOSRuntimeContext } from "./runtimeContext";
import { resolveNSEFocusReturnTarget, isWithinNSEFocusOrigin } from "../NSE/hostComposition";

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=true], [tabindex]:not([tabindex='-1'])";

function belongsToRuntime(element: HTMLElement, runtimeId: string): boolean {
  return element.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner === runtimeId;
}

function isAvailableFocusTarget(element: HTMLElement, runtimeId: string): boolean {
  return belongsToRuntime(element, runtimeId) &&
    !element.hasAttribute("disabled") &&
    !element.closest("[inert], [aria-hidden='true']");
}

/** Surface chrome (a window's title-bar controls) is tabbable but never the
 * first responder a scope picks; it is the fallback when nothing else is. */
const focusChromeSelector = "[data-syncloudos-focus-chrome]";

function focusableTarget(root: HTMLElement, runtimeId: string): HTMLElement | null {
  if (root.matches(focusableSelector) && isAvailableFocusTarget(root, runtimeId)) return root;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((target) => isAvailableFocusTarget(target, runtimeId));
  return candidates.find((target) => !target.closest(focusChromeSelector)) ?? candidates[0] ?? null;
}

function focusableTargets(root: HTMLElement, runtimeId: string): HTMLElement[] {
  const targets = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
  if (root.matches(focusableSelector)) targets.unshift(root);
  return targets.filter((target) => isAvailableFocusTarget(target, runtimeId));
}

function scopeRoot(document: Document | null, runtimeId: string, scopeId: string): HTMLElement | null {
  const matches = Array.from(document?.querySelectorAll<HTMLElement>("[data-syncloudos-focus-scope]") ?? [])
    .filter((element) => element.dataset.syncloudosRuntimeOwner === runtimeId && element.dataset.syncloudosFocusScope === scopeId);
  return matches.find((element) => focusableTarget(element, runtimeId)) ?? matches.at(-1) ?? null;
}

export interface FocusScopeProps extends PropsWithChildren {
  readonly scopeId: string;
  readonly kind: FocusScopeKind;
  readonly parentScopeId?: string;
  readonly parentResponderId: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  readonly undoOwner?: UndoOwner;
  /** The runtime focus manager already owns this logical scope (for example,
   * an NSEWindowController-owned modal). FocusScope still provides the DOM
   * trap and keyboard boundary without registering a duplicate scope. */
  readonly externallyManagedScope?: boolean;
  /** Another runtime owner applies and restores physical `inert` state.
   * FocusScope retains its logical trap but must not become a second inert
   * owner. */
  readonly externallyManagedInert?: boolean;
  /** Attach logical scope markers to the existing host instead of adding a
   * wrapper. Use for components that already own a physical modal/trap. */
  readonly asChild?: boolean;
}

function KernelFocusScope({ scopeId, kind, parentScopeId, parentResponderId, modal = kind === "modal", trapFocus = modal, restoreFocus = true, undoOwner, externallyManagedScope = false, externallyManagedInert = false, asChild = false, children }: FocusScopeProps) {
  const runtime = useKernelSynCloudOS();
  const inheritedProtocol = useRuntimeInputProtocol();
  const fallbackProtocolRef = useRef<ReturnType<typeof createRuntimeInputProtocol> | null>(null);
  if (!fallbackProtocolRef.current || fallbackProtocolRef.current.runtimeId !== runtime.runtimeId) fallbackProtocolRef.current = createRuntimeInputProtocol(runtime.runtimeId);
  const protocol = inheritedProtocol?.runtimeId === runtime.runtimeId ? inheritedProtocol : fallbackProtocolRef.current;
  useLayoutEffect(() => {
    let live = true;
    const handle = externallyManagedScope
      ? null
      : runtime.focus.openScope({ id: scopeId, kind, parentScopeId, parentResponderId, modal, trapFocus });
    if (!externallyManagedScope) runtime.focus.requestFocus(parentResponderId);
    const undoLease = undoOwner ? retainUndoOwner(runtime, undoOwner) : null;
    const document = runtime.environment.browser.getDocument();
    const root = scopeRoot(document, runtime.runtimeId, scopeId);
    // The control this scope was opened from. A scope opened by a menu
    // command sees the menu row as focused; that row will be gone, so resolve
    // it to the control that opened the menu.
    const openedFrom = document?.activeElement && !root?.contains(document.activeElement)
      ? resolveNSEFocusReturnTarget(document.activeElement)
      : null;
    // NSEAlertBackdrop already owns sibling inertness and restores the exact
    // prior state. A second owner would make parent/child effect cleanup order
    // restore the modal's captured `true` state after this scope restores it.
    const ownsBackgroundContainment = !externallyManagedInert && !root?.classList.contains("nse-control-alert-backdrop");
    const restoredBackground: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
    if (trapFocus && root && ownsBackgroundContainment) {
      let branch: HTMLElement | null = root;
      while (branch?.parentElement) {
        const parentElement: HTMLElement = branch.parentElement;
        const parentOwner = parentElement.closest<HTMLElement>("[data-syncloudos-runtime-owner]");
        if (parentOwner && parentOwner.dataset.syncloudosRuntimeOwner !== runtime.runtimeId) break;
        for (const sibling of Array.from(parentElement.children)) {
          if (!(sibling instanceof HTMLElement) || sibling === branch || restoredBackground.some(({ element }) => element === sibling)) continue;
          const siblingOwner = sibling.closest<HTMLElement>("[data-syncloudos-runtime-owner]");
          if (siblingOwner && siblingOwner.dataset.syncloudosRuntimeOwner !== runtime.runtimeId) continue;
          restoredBackground.push({ element: sibling, inert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden") });
          sibling.inert = true;
          sibling.setAttribute("aria-hidden", "true");
        }
        branch = parentElement;
      }
    }
    let redirectingFocus = false;
    const containFocus = (event: FocusEvent) => {
      if (redirectingFocus || !trapFocus || !root || !(event.target instanceof Node) || isWithinNSEFocusOrigin(root, event.target)) return;
      const targetRuntimeOwner = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-syncloudos-runtime-owner]")
        : null;
      if (targetRuntimeOwner && targetRuntimeOwner.dataset.syncloudosRuntimeOwner !== runtime.runtimeId) return;
      const targetScope = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-syncloudos-focus-scope]")
        : undefined;
      if (
        targetScope &&
        belongsToRuntime(targetScope, runtime.runtimeId) &&
        runtime.focus.isScopeWithin(targetScope.dataset.syncloudosFocusScope!, scopeId)
      ) return;
      const target = focusableTarget(root, runtime.runtimeId);
      if (!target || document?.activeElement === target) return;
      // HTMLElement#focus synchronously emits focusin. A browser or host focus
      // delegate can reject that target and immediately re-emit the outside
      // focus event, so retain the guard through the current microtask rather
      // than recursively redirecting the same transition.
      redirectingFocus = true;
      try {
        target.focus({ preventScroll: true });
      } finally {
        queueMicrotask(() => {
          redirectingFocus = false;
        });
      }
    };
    if (trapFocus) document?.addEventListener("focusin", containFocus, true);
    if (trapFocus) queueMicrotask(() => {
      if (!live) return;
      const activeScope = (document?.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-syncloudos-focus-scope]") ?? null;
      if (
        activeScope &&
        belongsToRuntime(activeScope, runtime.runtimeId) &&
        runtime.focus.isScopeWithin(activeScope.dataset.syncloudosFocusScope!, scopeId)
      ) return;
      const scopeRoot = Array.from(document?.querySelectorAll<HTMLElement>("[data-syncloudos-focus-scope]") ?? [])
        .find((element) => (
          element.dataset.syncloudosFocusScope === scopeId &&
          belongsToRuntime(element, runtime.runtimeId) &&
          focusableTarget(element, runtime.runtimeId)
        ));
      if (scopeRoot) focusableTarget(scopeRoot, runtime.runtimeId)?.focus({ preventScroll: true });
    });
    return () => {
      live = false;
      redirectingFocus = false;
      document?.removeEventListener("focusin", containFocus, true);
      for (const { element, inert, ariaHidden } of restoredBackground) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      const result = handle?.close({ restore: restoreFocus }) ?? {
        status: "closed" as const,
        restoredResponderId: restoreFocus ? runtime.focus.getFocusedResponderId() : null,
      };
      undoLease?.release();
      if (result.status === "closed" && result.restoredResponderId) {
        const restoreDOMFocus = () => {
          const document = runtime.environment.browser.getDocument();
          // Restore only focus this scope stranded. When something else
          // already holds focus (a dialog the scope's command opened, or a
          // trigger its owner refocused), moving it would pull it away.
          const active = document?.activeElement ?? null;
          const stranded = !active || active === document?.body || active === document?.documentElement
            || !active.isConnected || Boolean(root?.contains(active));
          if (!stranded) return;
          const target = Array.from(document?.querySelectorAll<HTMLElement>("[data-syncloudos-responder-id]") ?? [])
            .find((element) => (
              element.dataset.syncloudosResponderId === result.restoredResponderId &&
              belongsToRuntime(element, runtime.runtimeId)
            ));
          // Focus goes back into the responder the runtime restores (a sheet's
          // parent window). The control the scope was opened from wins when it
          // lives there, or when that responder has no surface of its own; a
          // control outside it (shell or fixture chrome) never takes focus
          // from the window the sheet belonged to.
          if (openedFrom?.isConnected && belongsToRuntime(openedFrom, runtime.runtimeId) && (!target || isWithinNSEFocusOrigin(target, openedFrom))) {
            openedFrom.focus({ preventScroll: true });
            if (document?.activeElement === openedFrom) return;
          }
          if (target) focusableTarget(target, runtime.runtimeId)?.focus({ preventScroll: true });
        };
        // An externally managed modal releases its manager-owned `inert`
        // attributes in the same React commit that unmounts this trap. Restore
        // after that commit so the browser does not reject focus on a parent
        // that is still physically inert during layout-effect cleanup.
        if (externallyManagedInert) queueMicrotask(restoreDOMFocus);
        else restoreDOMFocus();
      }
    };
  }, [runtime, scopeId, kind, parentScopeId, parentResponderId, modal, trapFocus, restoreFocus, undoOwner, externallyManagedScope, externallyManagedInert]);
  const handleKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent;
    if (!protocol.owns(nativeEvent, event.target) || protocol.hasClaimed(nativeEvent)) return;
    if (trapFocus && event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const root = scopeRoot(runtime.environment.browser.getDocument(), runtime.runtimeId, scopeId);
      const targets = root ? focusableTargets(root, runtime.runtimeId) : [];
      if (targets.length > 0) {
        const current = runtime.environment.browser.getDocument()?.activeElement;
        const index = current instanceof HTMLElement ? targets.indexOf(current) : -1;
        if (index < 0 || (!event.shiftKey && index === targets.length - 1) || (event.shiftKey && index === 0)) {
          event.preventDefault();
          event.stopPropagation();
          targets[event.shiftKey ? targets.length - 1 : 0]?.focus({ preventScroll: true });
          return;
        }
      }
    }
    const claim = runtime.keyBindings.claimKeyboardEvent(nativeEvent, { scopeId });
    if (!claim || !protocol.claim(nativeEvent)) return;
    event.preventDefault();
    event.stopPropagation();
    void runtime.keyBindings.handleKeyboardEvent(nativeEvent, { scopeId }, claim);
  };
  const scopeProps = {
    "data-syncloudos-runtime-owner": runtime.runtimeId,
    "data-syncloudos-focus-scope": scopeId,
    onKeyDownCapture: handleKeyDownCapture,
  };
  if (asChild) {
    if (!isValidElement(children)) throw new Error("FocusScope asChild requires exactly one host element.");
    const child = children as ReactElement<{ onKeyDownCapture?: (event: ReactKeyboardEvent<HTMLDivElement>) => void }>;
    return cloneElement(child, {
      ...scopeProps,
      onKeyDownCapture: (event: ReactKeyboardEvent<HTMLDivElement>) => {
        handleKeyDownCapture(event);
        if (!event.defaultPrevented) child.props.onKeyDownCapture?.(event);
      },
    });
  }
  return <div {...scopeProps}>{children}</div>;
}

export function FocusScope(props: FocusScopeProps) {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  if (appRuntime) {
    return <AppFocusScope runtime={appRuntime} runtimeId={`app:${appRuntime.app.id}`} options={props}>{props.children}</AppFocusScope>;
  }
  if (!kernelRuntime) throw new Error("FocusScope must be used within SynCloudOSProvider or a mounted SynWare.");
  return <KernelFocusScope {...props} />;
}
