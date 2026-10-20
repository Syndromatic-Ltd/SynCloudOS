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

import { cloneElement, isValidElement, useCallback, useContext, useLayoutEffect, useRef, type ReactElement, type ReactNode, type Ref } from "react";
import type { FocusScopeKind } from "../SynCloudOS/SynCloudOS";
import { SynWareRuntimeContext } from "./runtimeContext";
import type { SynWareRuntime } from "./appRuntimeTypes";
import { isWithinNSEFocusOrigin } from "../NSE/hostComposition";

export interface AppFocusScopeOptions {
  readonly scopeId: string;
  readonly kind: FocusScopeKind;
  readonly parentResponderId?: string;
  readonly parentScopeId?: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  readonly asChild?: boolean;
}

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=true], [tabindex]:not([tabindex='-1'])";

/** App-owned counterpart to the kernel FocusScope. It keeps the same DOM
 * focus/trap semantics while all logical scope operations use the mounted
 * app focus lease. */
export function AppFocusScope({ runtime, runtimeId, options, children }: { readonly runtime: SynWareRuntime; readonly runtimeId: string; readonly options: AppFocusScopeOptions; readonly children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const child = isValidElement(children) ? children as ReactElement<{ ref?: Ref<HTMLDivElement> }> : null;
  const childRef = child?.props.ref;
  const composedRootRef = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    if (typeof childRef === "function") childRef(element);
    else if (childRef) childRef.current = element;
  }, [childRef]);
  const modal = options.modal ?? options.kind === "modal";
  const trapFocus = options.trapFocus ?? modal;
  useLayoutEffect(() => {
    const parentResponderId = options.parentResponderId ?? `application:${runtime.app.bundleIdentifier}`;
    const handle = runtime.focus.openScope({
      id: options.scopeId,
      kind: options.kind,
      parentScopeId: options.parentScopeId,
      parentResponderId,
      modal,
      trapFocus,
    });
    runtime.focus.requestFocus(parentResponderId);
    const root = rootRef.current;
    const doc = root?.ownerDocument ?? (typeof document === "undefined" ? null : document);
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
    let redirectingFocus = false;
    const onFocus = (event: FocusEvent) => {
      if (redirectingFocus || !trapFocus || !root || !(event.target instanceof Node) || isWithinNSEFocusOrigin(root, event.target)) return;
      // A surface opened from inside this one (a listbox or popover portalled
      // out of the sheet) nests its scope here; focus entering it stays in.
      const targetScope = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-syncloudos-focus-scope]")
        : null;
      const targetScopeId = targetScope?.dataset.syncloudosFocusScope;
      if (targetScopeId && targetScope.dataset.syncloudosRuntimeOwner === runtimeId
        && runtime.focus.isScopeWithin(targetScopeId, options.scopeId)) return;
      const target = focusables()[0];
      if (!target || doc?.activeElement === target) return;
      // A rejected programmatic focus can synchronously re-emit focusin for
      // the same outside element. Hold the guard for that transition so an
      // app-owned trap cannot recurse through its own redirect.
      redirectingFocus = true;
      try {
        target.focus({ preventScroll: true });
      } finally {
        queueMicrotask(() => {
          redirectingFocus = false;
        });
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!trapFocus || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || !root) return;
      const targets = focusables();
      if (targets.length === 0) return;
      const current = doc?.activeElement instanceof HTMLElement ? targets.indexOf(doc.activeElement) : -1;
      if (current < 0 || (!event.shiftKey && current === targets.length - 1) || (event.shiftKey && current === 0)) {
        event.preventDefault();
        targets[event.shiftKey ? targets.length - 1 : 0]?.focus({ preventScroll: true });
      }
    };
    if (trapFocus) doc?.addEventListener("focusin", onFocus, true);
    root?.addEventListener("keydown", onKeyDown, true);
    queueMicrotask(() => {
      if (root && doc?.activeElement && !isWithinNSEFocusOrigin(root, doc.activeElement)) focusables()[0]?.focus({ preventScroll: true });
    });
    return () => {
      redirectingFocus = false;
      doc?.removeEventListener("focusin", onFocus, true);
      root?.removeEventListener("keydown", onKeyDown, true);
      // The mount owner aborts before React removes descendant scopes. The
      // app focus facade is intentionally revoked at that point, so its
      // logical close must not call back into a dead capability.
      if (!runtime.signal.aborted) handle.close({ restore: options.restoreFocus });
    };
  }, [modal, options.kind, options.parentResponderId, options.parentScopeId, options.restoreFocus, options.scopeId, runtime, runtimeId, trapFocus]);

  const host = <div ref={rootRef} data-syncloudos-runtime-owner={runtimeId} data-syncloudos-focus-scope={options.scopeId}>{children}</div>;
  if (!options.asChild) return host;
  if (!child) throw new Error("App focus scope asChild requires one React element.");
  return cloneElement(child, {
    ref: composedRootRef,
    "data-syncloudos-runtime-owner": runtimeId,
    "data-syncloudos-focus-scope": options.scopeId,
  } as never);
}

/** Kept as a tiny hook-level assertion for callers that accidentally render
 * this helper without a mounted app provider. */
export function useMountedAppFocusRuntime(): SynWareRuntime {
  const runtime = useContext(SynWareRuntimeContext);
  if (!runtime) throw new Error("AppFocusScope requires a mounted SynWare.");
  return runtime;
}
