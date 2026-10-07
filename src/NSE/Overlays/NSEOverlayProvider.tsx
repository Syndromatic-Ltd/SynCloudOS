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

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { createNSEOverlayManager } from "./NSEOverlayManager";
import { belongsToNearestNSEOverlayProvider, isWithinNSEOverlay, markNSEOverlayDocumentProviderActive, nseOverlayEventPath, retainNSEOverlayDocumentProvider } from "./overlayEventOwnership";
import type { NSEOverlayDismissReason, NSEOverlayManager, NSEOverlayRegistration, NSEOverlayRuntimePort } from "./overlayTypes";
import { useNSEAppearanceProjection } from "../Appearance";
import "./nse-overlays.css";

export interface NSEOverlayProviderContextValue {
  readonly manager: NSEOverlayManager;
  readonly runtime: NSEOverlayRuntimePort;
  readonly portalHost: HTMLElement | null;
  readonly defaultParentResponderId?: string;
  register(registration: NSEOverlayRegistration): () => void;
  retainFocusTarget(target: HTMLElement): () => void;
}

interface InternalNSEOverlayProviderContextValue extends NSEOverlayProviderContextValue {
  /** Undefined mounts locally; null defers mounting; an element relocates overlays. */
  readonly portalContainer?: HTMLElement | null;
}

const NSEOverlayContext = createContext<InternalNSEOverlayProviderContextValue | null>(null);

interface MutationObserverPort {
  observe(target: Element, options: { readonly childList: boolean; readonly subtree: boolean }): void;
  disconnect(): void;
}
interface MutationObserverPortConstructor {
  new (callback: () => void): MutationObserverPort;
}
type BrowserWindowWithMutationObserver = Window & { readonly MutationObserver?: MutationObserverPortConstructor };

export interface NSEOverlayProviderProps extends PropsWithChildren {
  readonly manager?: NSEOverlayManager;
  readonly runtimePort: NSEOverlayRuntimePort;
  readonly defaultParentResponderId?: string;
  /**
   * Where this provider's overlays mount. An omitted destination inherits the
   * nearest explicit destination, or mounts beside the content. A host that
   * clips its content (a window's rounded surface) passes
   * an element outside the clip, so a menu or popover can extend past the
   * host's edge. Null while that element is still mounting.
   */
  readonly portalContainer?: HTMLElement | null;
}

export function NSEOverlayProvider({
  manager: providedManager,
  runtimePort: runtime,
  defaultParentResponderId,
  portalContainer,
  children,
}: NSEOverlayProviderProps) {
  const parent = useContext(NSEOverlayContext);
  const destination = portalContainer === undefined ? parent?.portalContainer : portalContainer;
  const appearanceProjection = useNSEAppearanceProjection();
  const managerRef = useRef<NSEOverlayManager | null>(null);
  if (!managerRef.current) managerRef.current = providedManager ?? createNSEOverlayManager();
  const manager = providedManager ?? managerRef.current;
  const providerId = `nse-overlay-provider:${runtime.runtimeId}:${useId()}`;
  const restoredFocusTargetsRef = useRef(new Map<HTMLElement, number>());
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);

  const register = useCallback((registration: NSEOverlayRegistration) => {
    return manager.register(registration);
  }, [manager]);

  const retainFocusTarget = useCallback((target: HTMLElement) => {
    const nextCount = (restoredFocusTargetsRef.current.get(target) ?? 0) + 1;
    restoredFocusTargetsRef.current.set(target, nextCount);
    return () => {
      const count = restoredFocusTargetsRef.current.get(target) ?? 0;
      if (count <= 1) restoredFocusTargetsRef.current.delete(target);
      else restoredFocusTargetsRef.current.set(target, count - 1);
    };
  }, []);

  useEffect(() => {
    const document = runtime.environment.browser.getDocument();
    if (!document) return;
    const releaseDocumentProvider = retainNSEOverlayDocumentProvider(
      document,
      providerId,
      () => manager.getSnapshot().topmostId !== null,
    );
    let lastTopmostId: string | null = null;
    const publishActivation = () => {
      const topmostId = manager.getSnapshot().topmostId;
      if (topmostId === lastTopmostId) return;
      lastTopmostId = topmostId;
      if (topmostId) markNSEOverlayDocumentProviderActive(document, providerId);
    };
    const unsubscribeActivation = manager.subscribe(publishActivation);
    publishActivation();
    const dismissTopmost = (reason: NSEOverlayDismissReason, event: Event) => {
      if (!belongsToNearestNSEOverlayProvider(event, runtime.runtimeId, providerId)) return false;
      const topmostId = manager.getSnapshot().topmostId;
      if (!topmostId) return false;
      const registration = manager.getRegistration(topmostId);
      if (!registration || !registration.dismissOn.has(reason)) return false;
      if (reason !== "escape" && isWithinNSEOverlay(nseOverlayEventPath(event), registration)) return false;
      return manager.dismiss(topmostId, reason);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dismissTopmost("outside-pointer", event);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (nseOverlayEventPath(event).some((target) => restoredFocusTargetsRef.current.has(target as HTMLElement))) return;
      dismissTopmost("focus-left", event);
    };
    // Bubble phase: a control inside the overlay sees Escape first and may
    // claim it (a text field reverting an edit calls preventDefault); only an
    // unclaimed Escape dismisses the topmost overlay.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Escape") return;
      if (dismissTopmost("escape", event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("keydown", handleKeyDown);
      unsubscribeActivation();
      releaseDocumentProvider();
    };
  }, [manager, providerId, runtime]);
  useEffect(() => {
    const dismissRuntimeOverlays = () => {
      const roots = manager.getSnapshot().orderedIds.filter((id) => manager.getSnapshot().parentById.get(id) === null);
      for (const rootId of roots) manager.dismissBranch(rootId, "programmatic");
      restoredFocusTargetsRef.current.clear();
    };
    if (runtime.signal.aborted) {
      dismissRuntimeOverlays();
      return;
    }
    runtime.signal.addEventListener("abort", dismissRuntimeOverlays, { once: true });
    return () => runtime.signal.removeEventListener("abort", dismissRuntimeOverlays);
  }, [manager, runtime]);


  useEffect(() => {
    const document = runtime.environment.browser.getDocument();
    const browserWindow = runtime.environment.browser.getWindow();
    const MutationObserverConstructor = (browserWindow as BrowserWindowWithMutationObserver | null)?.MutationObserver;
    if (!document?.documentElement || !MutationObserverConstructor) return;
    const observer = new MutationObserverConstructor(() => {
      for (const id of manager.getSnapshot().orderedIds) {
        const registration = manager.getRegistration(id);
        if (!registration) continue;
        // Only overlays that are positioned against their anchor go with it; a
        // modal sheet keeps its anchor solely as a focus-return origin.
        if (registration.anchor && !registration.anchor.isConnected && registration.dismissOn.has("anchor-removed")) {
          manager.dismissBranch(registration.id, "anchor-removed");
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [manager, runtime]);

  const contextValue = useMemo<InternalNSEOverlayProviderContextValue>(() => ({
    manager,
    runtime,
    portalHost,
    portalContainer: destination,
    defaultParentResponderId,
    register,
    retainFocusTarget,
  }), [defaultParentResponderId, manager, portalHost, destination, register, retainFocusTarget, runtime]);

  const relocated = destination !== undefined;
  const portalHostNode = (
    <div
      ref={setPortalHost}
      {...appearanceProjection}
      // Mounted away from the provider element, the host carries the provider
      // marker itself so events from its overlays still resolve here.
      data-nse-overlay-provider={relocated ? providerId : undefined}
      data-nse-overlay-portal-host="true"
      data-syncloudos-runtime-owner={runtime.runtimeId}
    />
  );

  return (
    <NSEOverlayContext.Provider value={contextValue}>
      <div
        data-nse-overlay-provider={providerId}
        data-syncloudos-runtime-owner={runtime.runtimeId}
        // Providers are logical event/focus boundaries, never a new layout
        // surface. In particular, Webspring's staged application frame must
        // remain an effective direct child of its positioning container.
        style={{ display: "contents" }}
      >
        {children}
        {relocated
          ? destination && createPortal(portalHostNode, destination)
          : portalHostNode}
      </div>
    </NSEOverlayContext.Provider>
  );
}

export function useNSEOverlayProvider(): NSEOverlayProviderContextValue {
  const context = useOptionalNSEOverlayProvider();
  if (!context) throw new Error("useNSEOverlay must be used within an NSEOverlayProvider.");
  return context;
}

/** Compatibility adapters can opt into the overlay runtime only when their host supplied it. */
export function useOptionalNSEOverlayProvider(): NSEOverlayProviderContextValue | null {
  return useContext(NSEOverlayContext);
}
