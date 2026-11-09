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

import { NSEWindowLayoutContext, NSEWindowLayoutModel, useNSEContentLayoutProperties } from "../NSE/Layout/windowChromeObstructions";
import { useNSEDeferredDisposal } from "../NSE/interactionLifecycle";
import type { ScreenSnapshot } from "../SynCloudOS/Windows/ScreenService";

import { useCallback, useLayoutEffect, useMemo, useEffect, useRef, type CSSProperties, type FocusEventHandler, type ReactNode, type Ref } from "react";
import { useNSEPresenceExiting, useNSEPresentation } from "../NSE/Animation";
import { nseTopBarHeightCssValue } from "../NSE/hostComposition";
import { isWithinNSEFocusOrigin } from "../NSE/hostComposition";
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
  safeAreaInsets?: ScreenSnapshot["safeAreaInsets"];
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
  safeAreaInsets,
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
  const layout = useMemo(() => new NSEWindowLayoutModel(), []);
  useNSEDeferredDisposal(layout);
  useLayoutEffect(() => frameRef.current ? layout.connectRoot(frameRef.current) : undefined, [layout]);
  useLayoutEffect(() => { if (safeAreaInsets) layout.setLogicalScreenInsets(safeAreaInsets); }, [layout, safeAreaInsets]);
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
    // The window's content takes focus, not a view controller drawn in its title bar (an accessory).
    const inTitlebar = (element: Element) => element.closest(".nse-window-titlebar-accessory-slot, .nse-window-titlebar-accessories, .nse-document-titlebar");
    const firstOutsideTitlebar = (selector: string) => [...frame.querySelectorAll<HTMLElement>(selector)].find((element) => !inTitlebar(element));
    const target = firstOutsideTitlebar("[data-nse-initial-focus]")
      ?? firstOutsideTitlebar("[data-nse-view-controller]")
      ?? frame;
    target.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [inactive, keyWindow]);
  return (
    <NSEWindowLayoutContext.Provider value={layout}>
    <div
      {...hostProps}
      ref={setFrame}
      tabIndex={-1}
      data-nse-control="app-view-chrome" data-nse-part="background" data-nse-key-window={keyWindow ? undefined : "false"}
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
    </NSEWindowLayoutContext.Provider>
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
  const contentLayoutProperties = useNSEContentLayoutProperties();
  // A role change starts its presentation during layout, so the outgoing
  // plane shows its first 3D pose in the same frame its role changes.
  useStagePresentation(surfaceRef, presentation);
  const surfaceClass = isStandardFrame(frame)
    ? "webspring-app-view-surface-generic"
    : "webspring-app-view-surface-custom";
  // The floating bar and the neutral initial-content inset share the bar's
  // own height token. The viewport/background remain full size beneath the
  // glass; a custom or absent bar contributes no system overlay inset.
  const topBarHeight = frame.topBar === "standard"
    ? nseTopBarHeightCssValue(frame.material === "metal" ? "atmoMetal" : "atmoCumulus")
    : "0px";

  return (
    <div
      ref={surfaceRef}
      data-nse-part="content" className={`webspring-app-view-surface ${surfaceClass}`}
      data-frame-material={frame.material}
      data-frame-top-bar={frame.topBar}
      data-nse-material={frame.material}
      data-multiswitch-role={multiSwitchRole ?? undefined}
      style={{ ...contentLayoutProperties, ...presentation?.motion.style, "--webspring-app-top-bar-height": topBarHeight } as CSSProperties}
    >
      {children}
    </div>
  );
}

export const AppViewChrome = {
  Root,
  Surface
};
