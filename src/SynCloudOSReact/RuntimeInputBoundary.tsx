import { useNSEThemeProjection } from "../NSE/hostComposition";
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

import { useRef, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type PropsWithChildren } from "react";
import { useAppearance, useResolvedAppearance } from "./serviceHooks";
import { useKernelSynCloudOS } from "./SynCloudOSProvider";
import { RuntimeInputProtocolProvider, createRuntimeInputProtocol, focusScopeFromEvent } from "./runtimeInputProtocol";

export function RuntimeInputBoundary({ children }: PropsWithChildren) {
  const runtime = useKernelSynCloudOS();
  const themeProjection = useNSEThemeProjection();
  const appearance = useAppearance();
  const resolvedMode = useResolvedAppearance();
  const lastAcceptedFocusTarget = useRef<HTMLElement | null>(null);
  const restoringBlockedFocus = useRef(false);
  const protocolRef = useRef<ReturnType<typeof createRuntimeInputProtocol> | null>(null);
  if (!protocolRef.current || protocolRef.current.runtimeId !== runtime.runtimeId) protocolRef.current = createRuntimeInputProtocol(runtime.runtimeId);
  const protocol = protocolRef.current;
  const handleFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    if (restoringBlockedFocus.current) return;
    if (!protocol.owns(event.nativeEvent, event.target)) return;
    const path = typeof event.nativeEvent.composedPath === "function" ? event.nativeEvent.composedPath() : [event.target];
    const responder = path.find((target): target is HTMLElement => target instanceof HTMLElement && Boolean(target.dataset.syncloudosResponderId));
    if (!responder?.dataset.syncloudosResponderId) return;
    const result = runtime.focus.requestFocus(responder.dataset.syncloudosResponderId);
    if (result.status === "focused") {
      if (event.target instanceof HTMLElement) lastAcceptedFocusTarget.current = event.target;
      return;
    }
    const trappedModal = runtime.focus.inspect().scopes.filter((scope) => scope.modal && scope.trapFocus).at(-1);
    if (result.status === "blocked" && trappedModal) {
      const previous = lastAcceptedFocusTarget.current;
      if (!previous?.isConnected) return;
      // Restoring DOM focus emits focusin synchronously. If a host rejects the
      // target and emits the same blocked event again, retain this guard until
      // the current focus transition has fully unwound.
      restoringBlockedFocus.current = true;
      try {
        previous.focus({ preventScroll: true });
      } finally {
        queueMicrotask(() => {
          restoringBlockedFocus.current = false;
        });
      }
    }
  };
  const handleKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent;
    if (!protocol.owns(nativeEvent, event.target) || protocol.hasClaimed(nativeEvent)) return;
    const scopeId = focusScopeFromEvent(nativeEvent, event.target);
    const context = scopeId ? { scopeId } : {};
    const claim = runtime.keyBindings.claimKeyboardEvent(nativeEvent, context);
    if (!claim || !protocol.claim(nativeEvent)) return;
    event.preventDefault();
    event.stopPropagation();
    void runtime.keyBindings.handleKeyboardEvent(nativeEvent, context, claim);
  };
  return (
    <RuntimeInputProtocolProvider value={protocol}>
      <div
        {...themeProjection}
        data-syncloudos-runtime-id={runtime.runtimeId}
        data-syncloudos-runtime-owner={runtime.runtimeId}
        data-syncloudos-runtime-root="true"
        data-appearance={appearance}
        data-mode={resolvedMode}
        onFocusCapture={handleFocusCapture}
        onKeyDownCapture={handleKeyDownCapture}
      >
        {children}
      </div>
    </RuntimeInputProtocolProvider>
  );
}
