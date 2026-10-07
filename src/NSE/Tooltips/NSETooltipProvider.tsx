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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { useNSEOverlayProvider } from "../Overlays";

type TooltipTimerKind = "open" | "close";

interface NSETooltipRegistration {
  readonly id: string;
  readonly disabled: boolean;
  /** The provider observes only this branch-local anchor, never an ambient query. */
  getAnchor(): HTMLElement | null;
  setOpen(open: boolean): void;
}

interface MutationObserverPort {
  observe(target: Element, options: { readonly childList: boolean; readonly subtree: boolean }): void;
  disconnect(): void;
}

interface MutationObserverPortConstructor {
  new (callback: () => void): MutationObserverPort;
}

type BrowserWindowWithMutationObserver = Window & { readonly MutationObserver?: MutationObserverPortConstructor };

interface PendingTooltipTimer {
  readonly id: string;
  readonly kind: TooltipTimerKind;
  readonly token: object;
  readonly handle: unknown;
}

interface NSETooltipProviderContextValue {
  readonly leaveDelayMs: number;
  readonly longPressDelayMs: number;
  register(registration: NSETooltipRegistration): () => void;
  requestOpen(id: string, delayMs: number): void;
  requestClose(id: string, delayMs: number): void;
  cancelPendingOpen(id: string): void;
  dismiss(id: string): void;
}

const NSETooltipContext = createContext<NSETooltipProviderContextValue | null>(null);

export interface NSETooltipProviderProps extends PropsWithChildren {
  /** Pointer-leave grace time, owned by the injected overlay runtime scheduler. */
  readonly leaveDelayMs?: number;
  /** Touch/pen help activation delay, also owned by the injected scheduler. */
  readonly longPressDelayMs?: number;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a finite non-negative number.`);
  return value;
}

/**
 * One provider owns the transient tooltip branch for its nearest overlay
 * runtime. It has one timer at a time, so sibling transfer cannot leave stale
 * callbacks behind after a branch changes or the runtime aborts.
 */
export function NSETooltipProvider({ children, leaveDelayMs = 100, longPressDelayMs = 600 }: NSETooltipProviderProps) {
  const { runtime } = useNSEOverlayProvider();
  const resolvedLeaveDelayMs = nonNegativeFinite(leaveDelayMs, "NSE tooltip leaveDelayMs");
  const resolvedLongPressDelayMs = nonNegativeFinite(longPressDelayMs, "NSE tooltip longPressDelayMs");
  const registrationsRef = useRef(new Map<string, NSETooltipRegistration>());
  const activeIdRef = useRef<string | null>(null);
  const visibleIdRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingTooltipTimer | null>(null);

  const cancelPending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    runtime.environment.clearTimeout(pending.handle);
  }, [runtime]);

  const setOpen = useCallback((id: string, open: boolean) => {
    if (open) visibleIdRef.current = id;
    else if (visibleIdRef.current === id) visibleIdRef.current = null;
    registrationsRef.current.get(id)?.setOpen(open);
  }, []);

  const dismiss = useCallback((id: string) => {
    if (activeIdRef.current !== id) return;
    cancelPending();
    activeIdRef.current = null;
    setOpen(id, false);
  }, [cancelPending, setOpen]);

  const requestOpen = useCallback((id: string, delayMs: number) => {
    const registration = registrationsRef.current.get(id);
    if (!registration || registration.disabled) return;
    const resolvedDelay = runtime.environment.presentation.getSnapshot().reducedMotion
      ? 0
      : nonNegativeFinite(delayMs, "NSE tooltip delayMs");
    const previousId = activeIdRef.current;
    if (previousId === id) {
      const pending = pendingRef.current;
      if (pending?.kind === "close") cancelPending();
      return;
    }
    const immediateSiblingTransfer = previousId !== null && visibleIdRef.current === previousId;
    cancelPending();
    if (previousId) setOpen(previousId, false);
    activeIdRef.current = id;
    // Once a sibling is visible (or within its leave grace), moving between
    // anchors must not make users wait through a second hover delay.
    if (resolvedDelay === 0 || immediateSiblingTransfer) {
      setOpen(id, true);
      return;
    }
    const token = {};
    const handle = runtime.environment.setTimeout(() => {
      const pending = pendingRef.current;
      if (pending?.token !== token || activeIdRef.current !== id) return;
      pendingRef.current = null;
      setOpen(id, true);
    }, resolvedDelay);
    pendingRef.current = { id, kind: "open", token, handle };
  }, [cancelPending, runtime, setOpen]);

  const requestClose = useCallback((id: string, delayMs: number) => {
    if (activeIdRef.current !== id) return;
    const resolvedDelay = runtime.environment.presentation.getSnapshot().reducedMotion
      ? 0
      : nonNegativeFinite(delayMs, "NSE tooltip close delay");
    cancelPending();
    if (resolvedDelay === 0) {
      activeIdRef.current = null;
      setOpen(id, false);
      return;
    }
    const token = {};
    const handle = runtime.environment.setTimeout(() => {
      const pending = pendingRef.current;
      if (pending?.token !== token || activeIdRef.current !== id) return;
      pendingRef.current = null;
      activeIdRef.current = null;
      setOpen(id, false);
    }, resolvedDelay);
    pendingRef.current = { id, kind: "close", token, handle };
  }, [cancelPending, runtime, setOpen]);

  const cancelPendingOpen = useCallback((id: string) => {
    const pending = pendingRef.current;
    if (!pending || pending.id !== id || pending.kind !== "open") return;
    cancelPending();
    if (activeIdRef.current === id) activeIdRef.current = null;
  }, [cancelPending]);

  const register = useCallback((registration: NSETooltipRegistration) => {
    const existing = registrationsRef.current.get(registration.id);
    if (existing && existing !== registration) {
      throw new Error(`NSE tooltip IDs must be unique within one provider: ${registration.id}`);
    }
    registrationsRef.current.set(registration.id, registration);
    return () => {
      if (registrationsRef.current.get(registration.id) !== registration) return;
      if (activeIdRef.current === registration.id) {
        cancelPending();
        activeIdRef.current = null;
      }
      if (visibleIdRef.current === registration.id) visibleIdRef.current = null;
      registrationsRef.current.delete(registration.id);
    };
  }, [cancelPending]);

  useEffect(() => {
    const dismissAll = () => {
      cancelPending();
      activeIdRef.current = null;
      visibleIdRef.current = null;
      for (const registration of registrationsRef.current.values()) registration.setOpen(false);
    };
    if (runtime.signal.aborted) {
      dismissAll();
      return undefined;
    }
    runtime.signal.addEventListener("abort", dismissAll, { once: true });
    return () => {
      runtime.signal.removeEventListener("abort", dismissAll);
      // Children are unmounting with this provider; clear owned timer/state
      // without issuing React updates into an already-disposing subtree.
      cancelPending();
      activeIdRef.current = null;
      visibleIdRef.current = null;
    };
  }, [cancelPending, runtime.signal]);

  useEffect(() => {
    const document = runtime.environment.browser.getDocument();
    const browserWindow = runtime.environment.browser.getWindow();
    const MutationObserverConstructor = (browserWindow as BrowserWindowWithMutationObserver | null)?.MutationObserver;
    if (!document?.documentElement || !MutationObserverConstructor) return undefined;
    const observer = new MutationObserverConstructor(() => {
      for (const registration of registrationsRef.current.values()) {
        const anchor = registration.getAnchor();
        if (anchor && !anchor.isConnected) dismiss(registration.id);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [dismiss, runtime]);

  const value = useMemo<NSETooltipProviderContextValue>(() => ({
    leaveDelayMs: resolvedLeaveDelayMs,
    longPressDelayMs: resolvedLongPressDelayMs,
    register,
    requestOpen,
    requestClose,
    cancelPendingOpen,
    dismiss,
  }), [cancelPendingOpen, dismiss, register, requestClose, requestOpen, resolvedLeaveDelayMs, resolvedLongPressDelayMs]);
  return <NSETooltipContext.Provider value={value}>{children}</NSETooltipContext.Provider>;
}

/** Null where no tooltip provider is mounted, for controls that fall back to a title. */
export function useOptionalNSETooltipProvider(): NSETooltipProviderContextValue | null {
  return useContext(NSETooltipContext);
}

export function useNSETooltipProvider(): NSETooltipProviderContextValue {
  const context = useContext(NSETooltipContext);
  if (!context) throw new Error("useNSETooltip must be used within an NSETooltipProvider.");
  return context;
}
