/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useId, useSyncExternalStore } from "react";
import { SystemSurfaceAppearance, ViewAppearanceBoundary, useNSEAppearance } from "../NSE/Appearance/NSEAppearanceProvider";
import { useObserve } from "../NSE/Objects";
import { AlertSurface } from "../NSE/hostComposition";
import { AlertBackdrop } from "../NSE/hostComposition";
import { NSEButton } from "../NSE/public/controls";
import type { SynCloudOSPresentationTraitsService } from "../SynCloudOS/SynCloudOS";
import { applicationSessionFor } from "../SynCloudOS/AppHosting/applicationSession";
import type { SynCloudOSAlertCenter, SynCloudOSPresentedAlert } from "../SynCloudOS/SystemUI/alertCenter";
import { FocusScope } from "./FocusScope";
import { useKernelSynCloudOS } from "./runtimeContext";
import { useResolvedMode } from "./serviceHooks";
import "./system-alert.css";

/** One presenter per host, sharing the kernel's ordered presentation queue. */
export function SCOSAlertPresenter({ center, appearance: requestedAppearance, presentation }: {
  readonly center: SynCloudOSAlertCenter;
  readonly presentation?: Pick<SynCloudOSPresentationTraitsService, "getSnapshot" | "subscribe">;
  readonly appearance?: "dark" | "light";
}) {
  const runtime = useKernelSynCloudOS();
  const resolvedAppearance = useResolvedMode();
  const { current } = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
  const ownerAppId = current?.ownerAppId;
  const app = useObserve(ownerAppId ? applicationSessionFor({ runtimeId: runtime.runtimeId, appId: ownerAppId })?.app : undefined);
  const appAppearance = app?.appearance ?? null;
  if (!current) return null;

  const alert = <QueuedAlert key={current.id} center={center} current={current} presentation={presentation}
    fallbackMode={requestedAppearance ?? resolvedAppearance} followsAppearance={appAppearance !== null} />;
  return ownerAppId
    ? <ViewAppearanceBoundary appearance={appAppearance} projectBoundary={false}>{alert}</ViewAppearanceBoundary>
    : <SystemSurfaceAppearance>{alert}</SystemSurfaceAppearance>;
}

function QueuedAlert({ center, current, presentation, fallbackMode, followsAppearance }: {
  readonly center: SynCloudOSAlertCenter;
  readonly current: SynCloudOSPresentedAlert;
  readonly presentation: Pick<SynCloudOSPresentationTraitsService, "getSnapshot" | "subscribe"> | undefined;
  readonly fallbackMode: "dark" | "light";
  readonly followsAppearance: boolean;
}) {
  const resolved = useNSEAppearance();
  const appearance = followsAppearance ? resolved.resolvedColourScheme : fallbackMode;
  const titleId = useId();
  const messageId = useId();
  const primary = current.buttons.find(button => button.role === "default" || button.role === "destructive") ?? current.buttons[0];
  return <FocusScope asChild scopeId={`scos-alert:${current.id}`} kind="modal" parentResponderId="runtime" trapFocus>
    <AlertBackdrop presentation={presentation} onSafeDismiss={() => center.dismiss(current.id)}>
      <AlertSurface appearance={appearance} labelledBy={titleId} describedBy={current.message ? messageId : undefined} initialFocusSelector="[data-scos-alert-primary]">
        {/* Without an icon the copy would otherwise sit in the alert's fixed icon column. */}
        <div data-nse-part="content" className={`nse-system-alert-content${current.iconUrl ? "" : " nse-confirm-content-textonly"}`}>
          {current.iconUrl ? <img data-nse-part="image" className="syncloudos-alert-logo" src={current.iconUrl} alt="" /> : null}
          <div data-nse-part="content" className="nse-system-alert-copy">
            <h2 data-nse-part="title" id={titleId}>{current.title}</h2>
            {current.message ? <p data-nse-part="label" id={messageId}>{current.message}</p> : null}
          </div>
        </div>
        <div data-nse-part="actions" className="nse-alert-actions">
          {current.buttons.map(button => <NSEButton
            title={button.label}
            hasDestructiveAction={button.role === "destructive"}
            keyEquivalent={button.role === "default" ? "\r" : undefined}
            appearance={button.role === "destructive" || button.role === "default" || appearance === "dark" ? undefined : "aqua"}
            key={button.id}
            className="nse-system-alert-action-button"
            data-scos-alert-primary={button === primary ? "" : undefined}
            onClick={() => center.dismiss(current.id, button.id)}
          />)}
        </div>
      </AlertSurface>
    </AlertBackdrop>
  </FocusScope>;
}
