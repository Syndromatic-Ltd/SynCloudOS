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

import { useContext, useId, useLayoutEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { NSEWindowAlertRequest } from "../../NSE/Application/NSEWindowController";
import { NSEAlertBackdrop, NSEAlertSurface, NSEFocusScope } from "../../NSE/hostComposition";
import { NSEButton } from "../../NSE/public/controls";
import { useNSEAppearance } from "../../NSE/Appearance/NSEAppearanceProvider";
import { NSEWindowSheetFrame, NSEWindowSheetHostContext } from "./windowChrome";
import { useNSEAnimationEnvironment } from "../../NSE/Animation";

interface PendingAlert {
  readonly id: number;
  readonly request: NSEWindowAlertRequest;
  readonly settle: (buttonId: string) => void;
}

/**
 * @internal The alerts a window presents as sheets (NSAlert.beginSheetModal(for:)), one at a time in the
 * order they were asked for. Each resolves with the chosen button's id; a safe dismissal, or aborting its
 * signal, resolves with the cancel button (else the last).
 */
export interface NSEWindowAlertQueue {
  present(request: NSEWindowAlertRequest, signal: AbortSignal): Promise<string>;
  choose(id: number, buttonId?: string): void;
  getSnapshot(): PendingAlert | null;
  subscribe(listener: () => void): () => void;
}

function dismissalButton(request: NSEWindowAlertRequest): string {
  for (let index = request.buttons.length - 1; index >= 0; index -= 1) {
    if (request.buttons[index]!.role === "cancel") return request.buttons[index]!.id;
  }
  return request.buttons[request.buttons.length - 1]?.id ?? "ok";
}

export function createNSEWindowAlertQueue(): NSEWindowAlertQueue {
  const pending: PendingAlert[] = [];
  const listeners = new Set<() => void>();
  let sequence = 0;
  const publish = () => { for (const listener of [...listeners]) listener(); };
  const queue: NSEWindowAlertQueue = {
    present: (request, signal) => new Promise<string>((resolve) => {
      const id = ++sequence;
      const onAbort = () => { queue.choose(id); };
      pending.push({
        id,
        request,
        settle: (buttonId) => { signal.removeEventListener("abort", onAbort); resolve(buttonId); },
      });
      signal.addEventListener("abort", onAbort, { once: true });
      publish();
      if (signal.aborted) onAbort();
    }),
    choose: (id, buttonId) => {
      const index = pending.findIndex((alert) => alert.id === id);
      if (index < 0) return;
      const [alert] = pending.splice(index, 1);
      const known = buttonId !== undefined && alert!.request.buttons.some((button) => button.id === buttonId);
      alert!.settle(known ? buttonId! : dismissalButton(alert!.request));
      publish();
    },
    getSnapshot: () => pending[0] ?? null,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return queue;
}

/** @internal Draws the window's current alert as a sheet attached to the window. */
export function NSEWindowAlertSheet({ queue }: { readonly queue: NSEWindowAlertQueue }) {
  const current = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const host = useContext(NSEWindowSheetHostContext);
  const { reducedMotion } = useNSEAnimationEnvironment();
  if (!current || !host?.layer) return null;
  return createPortal(<NSEWindowSheetFrame key={current.id} reducedMotion={reducedMotion}><WindowAlert alert={current} queue={queue} /></NSEWindowSheetFrame>, host.layer);
}

function WindowAlert({ alert, queue }: { readonly alert: PendingAlert; readonly queue: NSEWindowAlertQueue }) {
  const host = useContext(NSEWindowSheetHostContext);
  useLayoutEffect(() => host?.attach(), [host]);
  // The window's resolved colour scheme, as the system alert presenter uses the system's.
  const appearance = useNSEAppearance().resolvedColourScheme;
  const titleId = useId();
  const messageId = useId();
  const { request } = alert;
  const primary = request.buttons.find((button) => button.role === "default" || button.role === "destructive") ?? request.buttons[0];
  return <NSEFocusScope options={{ scopeId: `nse-alert-sheet:${alert.id}`, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <NSEAlertBackdrop className="nse-window-sheet-backdrop" motion="sheet" onSafeDismiss={() => queue.choose(alert.id)}>
      <NSEAlertSurface appearance={appearance} className="nse-sheet nse-alert-sheet" motion="sheet"
        labelledBy={titleId} describedBy={request.message ? messageId : undefined} initialFocusSelector="[data-nse-alert-primary]">
        <div className="nse-system-alert-content nse-confirm-content-textonly">
          <div className="nse-system-alert-copy">
            <h2 id={titleId}>{request.title}</h2>
            {request.message ? <p id={messageId}>{request.message}</p> : null}
          </div>
        </div>
        <div className="nse-alert-actions">
          {request.buttons.map((button) => <NSEButton
            key={button.id}
            title={button.label}
            hasDestructiveAction={button.role === "destructive"}
            keyEquivalent={button.role === "default" ? "\r" : undefined}
            appearance={button.role === "destructive" || button.role === "default" || appearance === "dark" ? undefined : "aqua"}
            className="nse-system-alert-action-button"
            data-nse-alert-primary={button === primary ? "" : undefined}
            onClick={() => queue.choose(alert.id, button.id)}
          />)}
        </div>
      </NSEAlertSurface>
    </NSEAlertBackdrop>
  </NSEFocusScope>;
}
