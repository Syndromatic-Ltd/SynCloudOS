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

import { useEffect, useRef } from "react";
import { ApplicationStageView } from "./ApplicationStageView";
import {
  AppPresentationErrorFallback,
  SynCloudOSWatchdog,
  type SynCloudOSAppInfo,
  type SynCloudOSAppLifecycleState,
} from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../SynCloudOSReact";
import type { ApplicationStagePresentation } from "./stage";
import type { WindowContentRendererRegistry } from "./WindowLayer";

async function decodeStagedArtwork(frame: Element) {
  const images = Array.from(frame.querySelectorAll("img")).filter(
    (image) => image.currentSrc || image.src
  );
  await Promise.all(images.map((image) => image.decode?.().catch(() => undefined)));
}

export function ApplicationStageHost({
  windowContentRegistry,
  stage,
  app,
  lifecycle,
  multiSwitchId = null,
  multiSwitchRole = null,
  staged = false,
  launchTransitionId = null,
  presentationSettlementId = null,
  quickSwitchOpen = false,
  onQuickSwitchRequest,
  onApplicationMenuToggleRegister,
  onMultiSwitchAnimationComplete
}: {
  windowContentRegistry: WindowContentRendererRegistry;
  stage: ApplicationStagePresentation;
  app: SynCloudOSAppInfo;
  lifecycle: SynCloudOSAppLifecycleState;
  multiSwitchId?: string | null;
  multiSwitchRole?: "incoming" | "outgoing" | null;
  staged?: boolean;
  launchTransitionId?: string | null;
  presentationSettlementId?: string | null;
  quickSwitchOpen?: boolean;
  onQuickSwitchRequest?: () => void;
  onApplicationMenuToggleRegister?: (appId: string, toggle: () => void, ready: boolean) => () => void;
  onMultiSwitchAnimationComplete?: (switchId: string, role: "incoming" | "outgoing") => void;
}) {
  const runtime = useKernelSynCloudOS();
  const presentationRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!staged || !launchTransitionId) return;
    let cancelled = false;
    let outerFrame: unknown = null;
    let innerFrame: unknown = null;
    const report = () => {
      if (!cancelled) runtime.webspring.completeLaunchStage(launchTransitionId, app.bundleIdentifier);
    };
    outerFrame = runtime.environment.requestAnimationFrame(() => {
      innerFrame = runtime.environment.requestAnimationFrame(() => {
        if (cancelled) return;
        const frame = presentationRootRef.current;
        if (!frame) report();
        else void decodeStagedArtwork(frame).then(report);
      });
    });
    return () => {
      cancelled = true;
      if (outerFrame !== null) runtime.environment.cancelAnimationFrame(outerFrame);
      if (innerFrame !== null) runtime.environment.cancelAnimationFrame(innerFrame);
    };
  }, [app.bundleIdentifier, launchTransitionId, runtime, staged]);

  return (
    <SynCloudOSWatchdog
      runtime={runtime}
      watchdogName={`${app.packageName} presentation`}
      scope="app"
      app={app}
      presentation={{ id: stage.id, kind: "appView", zIndex: stage.zIndex }}
      resetKey={`${stage.id}:${app.bundleIdentifier}`}
      fallback={() => <AppPresentationErrorFallback app={app} presentation={{ id: stage.id, kind: "appView", zIndex: stage.zIndex }} />}
    >
        <ApplicationStageView
          windowContentRegistry={windowContentRegistry}
          stage={stage}
          app={app}
          lifecycle={lifecycle}
          multiSwitchId={multiSwitchId}
          multiSwitchRole={multiSwitchRole}
          staged={staged}
          presentationRootRef={presentationRootRef}
          presentationSettlementId={presentationSettlementId}
          quickSwitchOpen={quickSwitchOpen}
          onQuickSwitchRequest={onQuickSwitchRequest}
          onApplicationMenuToggleRegister={onApplicationMenuToggleRegister}
          onMultiSwitchAnimationComplete={onMultiSwitchAnimationComplete}
        />
    </SynCloudOSWatchdog>
  );
}
