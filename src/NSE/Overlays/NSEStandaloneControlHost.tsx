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

import { useEffect, useRef, type PropsWithChildren } from "react";
import { NSEFocusPortProvider } from "../Focus/NSEFocusPort";
import { NSEOverlayProvider } from "./NSEOverlayProvider";
import type { NSEOverlayRuntimePort } from "./overlayTypes";
import {
  createStandaloneNSEControlRuntime,
  type NSEStandaloneControlRuntime,
} from "./createStandaloneNSEControlRuntime";

export interface NSEStandaloneControlHostProps extends PropsWithChildren {
  readonly document: Document;
  readonly window: Window;
  readonly presentation: NSEOverlayRuntimePort["environment"]["presentation"];
  readonly parentResponderId?: string;
}

/**
 * Gives standalone controls the same overlay, scheduler and focus
 * authority used by a mounted SynCloudOS runtime. Each host owns one manager
 * and one runtime for its lifetime; sibling hosts never share registrations.
 */
export function NSEStandaloneControlHost({
  document,
  window,
  presentation,
  parentResponderId,
  children,
}: NSEStandaloneControlHostProps) {
  const runtimeRef = useRef<NSEStandaloneControlRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createStandaloneNSEControlRuntime({
      document,
      window,
      presentation,
      parentResponderId,
    });
  }
  const standalone = runtimeRef.current;
  const lifecycleGenerationRef = useRef(0);

  useEffect(() => {
    const lifecycleGeneration = lifecycleGenerationRef.current + 1;
    lifecycleGenerationRef.current = lifecycleGeneration;
    standalone.start();
    return () => {
      queueMicrotask(() => {
        if (lifecycleGenerationRef.current === lifecycleGeneration) standalone.dispose();
      });
    };
  }, [standalone]);

  return (
    <NSEFocusPortProvider port={standalone.focusPort}>
      <NSEOverlayProvider
        manager={standalone.manager}
        runtimePort={standalone.runtime}
        defaultParentResponderId={standalone.parentResponderId}
      >
        {children}
      </NSEOverlayProvider>
    </NSEFocusPortProvider>
  );
}
