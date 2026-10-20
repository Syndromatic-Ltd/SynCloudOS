/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useId, useSyncExternalStore } from "react";
import { NSEAlert } from "../NSE/hostComposition";
import { NSEAlertBackdrop } from "../NSE/SystemUI";
import { NSEPushButton } from "../NSE/public/controls";
import type { SynCloudOSAlertCenter } from "../SynCloudOS/SystemUI/alertCenter";
import { FocusScope } from "./FocusScope";
import { useResolvedMode } from "./serviceHooks";
import "./system-alert.css";

/** One presenter per host, sharing the kernel's ordered presentation queue. */
export function SCOSAlertPresenter({ center, appearance: requestedAppearance }: {
  readonly center: SynCloudOSAlertCenter;
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
    <NSEAlertBackdrop onSafeDismiss={() => center.dismiss(current.id)}>
      <NSEAlert appearance={appearance} labelledBy={titleId} describedBy={current.message ? messageId : undefined} initialFocusSelector="[data-scos-alert-primary]">
        <div className="nse-system-alert-content">
          {current.iconUrl ? <img className="syncloudos-alert-logo" src={current.iconUrl} alt="" /> : null}
          <div className="nse-system-alert-copy">
            <h2 id={titleId}>{current.title}</h2>
            {current.message ? <p id={messageId}>{current.message}</p> : null}
          </div>
        </div>
        <div className="nse-alert-actions">
          {current.buttons.map(button => <NSEPushButton key={button.id} className="nse-system-alert-action-button"
            data-scos-alert-primary={button === primary ? "" : undefined}
            tone={button.role === "destructive" ? "negative" : button.role === "default" ? "affirmative" : appearance === "dark" ? "medium" : "light"}
            onClick={() => center.dismiss(current.id, button.id)}>{button.label}</NSEPushButton>)}
        </div>
      </NSEAlert>
    </NSEAlertBackdrop>
  </FocusScope>;
}
