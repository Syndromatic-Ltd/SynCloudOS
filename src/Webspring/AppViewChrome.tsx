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

import { useNSEVisualEnvironment } from "../NSE/Appearance";


import { useCallback, useEffect, useRef, type CSSProperties, type FocusEventHandler, type ReactNode, type Ref } from "react";
import { useNSEPresenceExiting, useNSEPresentation } from "../NSE/Animation";
import { nseTopBarHeightCssValue } from "../NSE/Windows/Chrome/nseTopBarStyles";
import { isWithinNSEFocusOrigin } from "../NSE/Focus/focusOrigin";
import type { SynCloudOSAppFrameManifest } from "../SynCloudOS/SynCloudOS";
import type { ApplicationStagePartMotion } from "./ApplicationStage.transitions";

/** A stage element's AnimationFX presentation, and who hears it finish. */
export interface AppViewPresentation {
  readonly motion: ApplicationStagePartMotion;
  readonly onPresented?: (state: string) => void;
}

function useStagePresentation(element: { current: HTMLElement | null }, presentation: AppViewPresentation | undefined) {
  useNSEPresentation(element, {
    state: presentation?.motion.state,
    enter: presentation?.motion.enter ?? null,
    exit: presentation?.motion.exit ?? null,
    onPresented: presentation?.onPresented,
  });
}

function isStandardFrame(frame: SynCloudOSAppFrameManifest) {
  // System chrome whenever the app is not drawing its own bar.
  return frame.topBar !== "custom";
}

type RootProps = {
  zIndex: number;
  multiSwitchRole?: "incoming" | "outgoing" | null;
  staged?: boolean;
  /** The focused application stage: once presented it becomes the key window. */
  keyWindow?: boolean;
  rootRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  presentation?: AppViewPresentation;
  className?: string;
  style?: CSSProperties;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  "data-syncloudos-runtime-owner"?: string;
  "data-syncloudos-responder-id"?: string;
  "data-syncloudos-focus-scope"?: string;
};

function Root({
  zIndex,
  multiSwitchRole,
  staged = false,
  keyWindow = false,
  rootRef,
  children,
  presentation,
  className,
  style,
  ...hostProps
}: RootProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const setFrame = useCallback((element: HTMLDivElement | null) => {
    frameRef.current = element;
    if (typeof rootRef === "function") rootRef(element);
    else if (rootRef) rootRef.current = element;
  }, [rootRef]);
  useStagePresentation(frameRef, presentation);
  const exiting = useNSEPresenceExiting();
  const inactive = staged || multiSwitchRole === "outgoing" || exiting;
  useEffect(() => {
    // Hand keyboard ownership from this runtime's launcher or previous stage
    // to the presented key stage, without taking focus from its own editor,
    // its portalled controls, or another runtime.
    if (inactive || !keyWindow) return;
    const frame = frameRef.current, document = frame?.ownerDocument, active = document?.activeElement;
    if (!frame) return;
    if (active && active !== document.body) {
      if (isWithinNSEFocusOrigin(frame, active)) return;
      const owner = frame.dataset.syncloudosRuntimeOwner;
      if (!owner || active.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner !== owner) return;
    }
    const target = frame.querySelector<HTMLElement>("[data-nse-initial-focus]")
      ?? frame.querySelector<HTMLElement>("[data-nse-view-controller]")
      ?? frame;
    target.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [inactive, keyWindow]);
  return (
    <div
      {...hostProps}
      ref={setFrame}
      tabIndex={-1}
      className={`webspring-app-view-frame ${multiSwitchRole ? `is-multiswitch-${multiSwitchRole}` : ""} ${className ?? ""}`}
      data-multiswitch-role={multiSwitchRole ?? undefined}
      // A staged frame is mounted and painted but not yet presented: it must not take pointer
      // input or join the accessibility tree until the launch zoom hands the screen over to it.
      data-launch-staged={staged ? "true" : undefined}
      aria-hidden={inactive ? true : undefined}
      inert={inactive ? true : undefined}
      style={{ ...style, ...presentation?.motion.style, zIndex, ...(inactive ? { pointerEvents: "none" as const } : {}) }}
    >
      {children}
    </div>
  );
}

function Surface({
  frame,
  multiSwitchRole,
  children,
  presentation
}: {
  frame: SynCloudOSAppFrameManifest;
  multiSwitchRole?: "incoming" | "outgoing" | null;
  children: ReactNode;
  presentation?: AppViewPresentation;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { theme } = useNSEVisualEnvironment();
  // A role change starts its presentation during layout, so the outgoing
  // plane shows its first 3D pose in the same frame its role changes.
  useStagePresentation(surfaceRef, presentation);
  const surfaceClass = isStandardFrame(frame)
    ? "webspring-app-view-surface-generic"
    : "webspring-app-view-surface-custom";
  // The content sits below a standard bar, the way a content view sits below a title bar, and the
  // app's own background still fills the whole frame behind it. The reserved band is the bar's
  // own height token (nse-chrome.css), so the two can never disagree; a custom or absent bar
  // leaves the whole frame to the app.
  const topBarHeight = frame.topBar === "standard"
    ? nseTopBarHeightCssValue(theme.presentation.chrome)
    : "0px";

  return (
    <div
      ref={surfaceRef}
      className={`webspring-app-view-surface ${surfaceClass}`}
      data-frame-material={frame.material}
      data-frame-top-bar={frame.topBar}
      data-nse-material={frame.material}
      data-multiswitch-role={multiSwitchRole ?? undefined}
      style={{ ...presentation?.motion.style, "--webspring-app-top-bar-height": topBarHeight } as CSSProperties}
    >
      {children}
    </div>
  );
}

export const AppViewChrome = {
  Root,
  Surface
};
