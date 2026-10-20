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

import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { NSEPresence, useNSEPresentation, type NSEPresentationSpec } from "../NSE/Animation";
import { ApplicationStageHost } from "./ApplicationStageHost";
import type {
  SynCloudOSAppInfo,
  SynCloudOSAppLifecycleState,
  SynCloudOSMultiSwitchState,
} from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../SynCloudOSReact";
import { NSE } from "../NSE/NSE";
import type { ApplicationStagePresentation } from "./stage";
import type { WindowContentRendererRegistry } from "./WindowLayer";
import {
  WEBSPRING_MULTI_SWITCH_ROLES,
  WEBSPRING_RETURN_ROLES,
  type WebspringMultiSwitchRole,
} from "../SynCloudOS/SynCloudOS";

import { choreographyTimings } from "../FX/AnimationFX/choreographyTimings";

const backdropFade = (from: number, to: number): NSEPresentationSpec =>
  Object.freeze({ duration: 0.22, timing: "ease-out", tracks: Object.freeze([Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([from, to]) })]) });
const multiSwitchBackdropMotion = Object.freeze({ enter: backdropFade(0, 1), exit: backdropFade(1, 0) });

/** Dims the stage behind a MultiSwitch, fading through AnimationFX. */
function MultiSwitchBackdrop() {
  const backdropRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(backdropRef, multiSwitchBackdropMotion);
  return <div ref={backdropRef} className="webspring-multiswitch-backdrop" aria-hidden="true" />;
}

function getMultiSwitchRole(
  multiSwitch: SynCloudOSMultiSwitchState | null | undefined,
  appId: string,
): WebspringMultiSwitchRole | null {
  if (!multiSwitch || multiSwitch.status !== "switching") return null;
  if (normalizeBundleIdentifier(multiSwitch.fromAppId) === normalizeBundleIdentifier(appId)) return WEBSPRING_MULTI_SWITCH_ROLES[1];
  if (normalizeBundleIdentifier(multiSwitch.toAppId) === normalizeBundleIdentifier(appId)) return WEBSPRING_MULTI_SWITCH_ROLES[0];
  return null;
}

export function selectApplicationStageAppIds({
  activeAppId,
  multiSwitch,
  returnTransitionId,
}: {
  readonly activeAppId: string | null;
  readonly multiSwitch?: {
    readonly status: SynCloudOSMultiSwitchState["status"];
    readonly fromAppId?: string | null;
    readonly toAppId?: string | null;
  };
  readonly returnTransitionId: string | null;
}): readonly string[] {
  if (multiSwitch?.status === "switching") {
    return [...new Set([multiSwitch.fromAppId, multiSwitch.toAppId].filter((id): id is string => Boolean(id)))];
  }
  // Removing the live child starts NSEPresence's owned exit. Keeping a
  // returning app mounted would make applicationExit depend on the return that
  // applicationExit itself is required to settle.
  if (returnTransitionId) return [];
  return activeAppId ? [activeAppId] : [];
}

export function ApplicationStageLayer({
  windowContentRegistry,
  apps,
  lifecycle,
  multiSwitch,
  returnTransitionId = null,
  activeAppId = null,
  stagingAppId = null,
  launchTransitionId = null,
  presentationSettlementId = null,
  quickSwitchOpen = false,
  onQuickSwitchRequest,
  onApplicationMenuToggleRegister,
}: {
  readonly windowContentRegistry: WindowContentRendererRegistry;
  apps: Record<string, SynCloudOSAppInfo>;
  lifecycle: Record<string, SynCloudOSAppLifecycleState>;
  multiSwitch?: SynCloudOSMultiSwitchState;
  returnTransitionId?: string | null;
  activeAppId?: string | null;
  stagingAppId?: string | null;
  launchTransitionId?: string | null;
  presentationSettlementId?: string | null;
  quickSwitchOpen?: boolean;
  onQuickSwitchRequest?: () => void;
  readonly onApplicationMenuToggleRegister?: (appId: string, toggle: () => void, ready: boolean) => () => void;
}) {
  const hasMultiSwitch = multiSwitch?.status === "switching";
  const runtime = useKernelSynCloudOS();
  const windowSnapshot = useSyncExternalStore(
    runtime.windows.subscribe,
    runtime.windows.snapshot,
    runtime.windows.snapshot,
  );
  const multiSwitchId = hasMultiSwitch ? multiSwitch?.id ?? null : null;
  const presentations = useMemo<readonly ApplicationStagePresentation[]>(() => {
    const appIds = selectApplicationStageAppIds({ activeAppId, multiSwitch, returnTransitionId });
    return appIds
      .map((appId, index) => {
        const app = apps[normalizeBundleIdentifier(appId)];
        if (!app || app.presentation !== "appView") return null;
        return {
          id: `application-stage:${appId}`,
          appId,
          title: app.window.title,
          isFocused: normalizeBundleIdentifier(appId) === normalizeBundleIdentifier(activeAppId),
          zIndex: index + 1,
        } satisfies ApplicationStagePresentation;
      })
      .filter((entry): entry is ApplicationStagePresentation => entry !== null);
  }, [activeAppId, apps, multiSwitch, returnTransitionId]);
  const completedMultiSwitchRolesRef = useRef<{
    switchId: string | null;
    roles: Set<WebspringMultiSwitchRole>;
    scheduled: boolean;
    timer: unknown | null;
  }>({ switchId: null, roles: new Set(), scheduled: false, timer: null });
  const completedReturnTransitionRef = useRef<string | null>(null);
  const requiredMultiSwitchRoles = useMemo(() => {
    if (!hasMultiSwitch) return new Set<WebspringMultiSwitchRole>();
    return new Set(
      presentations
        .map((presentation) => getMultiSwitchRole(multiSwitch, presentation.appId))
        .filter((role): role is WebspringMultiSwitchRole => Boolean(role))
    );
  }, [hasMultiSwitch, multiSwitch, presentations]);
  const applicationStageBlocked = windowSnapshot.applicationStageBlocked ||
    presentations.some(({ appId }) => windowSnapshot.blockedApplicationIds.includes(appId));

  useEffect(() => {
    completedReturnTransitionRef.current = null;
  }, [returnTransitionId]);
  useEffect(() => {
    const previous = completedMultiSwitchRolesRef.current;
    if (previous.timer !== null) runtime.environment.clearTimeout(previous.timer);
    completedMultiSwitchRolesRef.current = { switchId: multiSwitchId, roles: new Set(), scheduled: false, timer: null };
    return () => {
      const current = completedMultiSwitchRolesRef.current;
      if (current.switchId === multiSwitchId && current.timer !== null) runtime.environment.clearTimeout(current.timer);
    };
  }, [multiSwitchId, runtime]);

  const handleWindowExitComplete = useCallback(() => {
    if (!returnTransitionId || completedReturnTransitionRef.current === returnTransitionId) return;
    if (runtime.webspring.completeReturnRole(returnTransitionId, WEBSPRING_RETURN_ROLES[0])) {
      completedReturnTransitionRef.current = returnTransitionId;
    }
  }, [returnTransitionId, runtime]);

  const handleMultiSwitchAnimationComplete = useCallback((switchId: string, role: WebspringMultiSwitchRole) => {
    if (!multiSwitchId || switchId !== multiSwitchId) return;
    const completed = completedMultiSwitchRolesRef.current;
    if (completed.switchId !== switchId) {
      completed.switchId = switchId;
      completed.roles = new Set();
      completed.scheduled = false;
      completed.timer = null;
    }
    completed.roles.add(role);
    const required = requiredMultiSwitchRoles.size > 0
      ? requiredMultiSwitchRoles
      : new Set(WEBSPRING_MULTI_SWITCH_ROLES);
    if (!Array.from(required).every((requiredRole) => completed.roles.has(requiredRole)) || completed.scheduled) return;

    const elapsed = multiSwitch?.startedAt
      ? runtime.environment.now() - multiSwitch.startedAt
      : choreographyTimings.multiSwitchMotionMs;
    const settleSwitch = () => {
      const current = completedMultiSwitchRolesRef.current;
      if (current.switchId !== switchId) return;
      current.timer = null;
      current.scheduled = runtime.launchServices.completeMultiSwitch(switchId);
    };
    completed.scheduled = true;
    if (elapsed < choreographyTimings.multiSwitchMotionMs) {
      completed.timer = runtime.environment.setTimeout(settleSwitch, choreographyTimings.multiSwitchMotionMs - elapsed);
    } else {
      settleSwitch();
    }
  }, [multiSwitch, multiSwitchId, requiredMultiSwitchRoles, runtime]);

  return (
    <div
      className="webspring-apps-container"
      data-multiswitching={hasMultiSwitch ? "true" : undefined}
      inert={applicationStageBlocked ? true : undefined}
      aria-hidden={applicationStageBlocked ? true : undefined}
      style={applicationStageBlocked ? { pointerEvents: "none" } : undefined}
      // Clicking the application behind the windows makes it the active
      // surface: every window, floating panels included, goes inactive.
      onPointerDownCapture={() => runtime.windows.resignKey()}
    >
      <NSEPresence>{hasMultiSwitch ? <MultiSwitchBackdrop /> : null}</NSEPresence>
      <NSEPresence onExitComplete={handleWindowExitComplete}>
        {presentations.map((presentation) => {
          const app = apps[presentation.appId];
          if (!app) return null;
          return (
            <ApplicationStageHost
              windowContentRegistry={windowContentRegistry}
              key={presentation.id}
              stage={presentation}
              app={app}
              lifecycle={lifecycle[normalizeBundleIdentifier(app.bundleIdentifier)] ?? "registered"}
              multiSwitchId={multiSwitchId}
              multiSwitchRole={getMultiSwitchRole(multiSwitch, app.bundleIdentifier)}
              staged={normalizeBundleIdentifier(stagingAppId) === normalizeBundleIdentifier(app.bundleIdentifier)}
              launchTransitionId={launchTransitionId}
              presentationSettlementId={presentationSettlementId}
              quickSwitchOpen={quickSwitchOpen}
              onQuickSwitchRequest={onQuickSwitchRequest}
              onApplicationMenuToggleRegister={onApplicationMenuToggleRegister}
              onMultiSwitchAnimationComplete={handleMultiSwitchAnimationComplete}
            />
          );
        })}
      </NSEPresence>
    </div>
  );
}
