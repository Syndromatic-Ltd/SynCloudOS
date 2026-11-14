/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useId, useSyncExternalStore } from "react";
import { AlertSurface } from "../NSE/hostComposition";
import { AlertBackdrop } from "../NSE/hostComposition";
import { NSEButton } from "../NSE/public/controls";
import type { SynCloudOSPresentationTraitsService } from "../SynCloudOS/SynCloudOS";
import type { SynCloudOSAlertCenter } from "../SynCloudOS/SystemUI/alertCenter";
import { FocusScope } from "./FocusScope";
import { useResolvedMode } from "./serviceHooks";
import "./system-alert.css";

/** One presenter per host, sharing the kernel's ordered presentation queue. */
export function SCOSAlertPresenter({ center, appearance: requestedAppearance, presentation }: {
  readonly center: SynCloudOSAlertCenter;
  readonly presentation?: Pick<SynCloudOSPresentationTraitsService, "getSnapshot" | "subscribe">;
  readonly appearance?: "dark" | "light";
}) {
  const resolvedAppearance = useResolvedMode();
  const appearance = requestedAppearance ?? resolvedAppearance;
  const { current } = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
  const titleId = useId();
  const messageId = useId();
  if (!current) return null;
  const primary = current.buttons.find(button => button.role === "default" || button.role === "destructive") ?? current.buttons[0];
  return <FocusScope asChild key={current.id} scopeId={`scos-alert:${current.id}`} kind="modal" parentResponderId="runtime" trapFocus>
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
