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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/** Presentation-safe alert contracts. The presenter renders these values; no
 * kernel object crosses into application or host UI code. */
export type SynCloudOSAlertButtonRole = "default" | "cancel" | "destructive";

export interface SynCloudOSAlertButton {
  readonly id: string;
  readonly label: string;
  readonly role?: SynCloudOSAlertButtonRole;
}

export interface SynCloudOSAlertRequest {
  readonly title: string;
  readonly message?: string;
  /** Omitted means one `OK` button. The first `destructive` or `default`
   * button is the primary action; a `cancel` button receives safe dismissals. */
  readonly buttons?: readonly SynCloudOSAlertButton[];
}

export interface SynCloudOSAlertPresentationOptions {
  /** The application that asked for the alert; closing it dismisses the alert. */
  readonly ownerAppId?: string;
  readonly signal?: AbortSignal;
  /** Resolved icon URL the presenter shows above the title. */
  readonly iconUrl?: string | null;
}

export interface SynCloudOSPresentedAlert {
  readonly id: string;
  readonly title: string;
  readonly message: string | null;
  readonly buttons: readonly SynCloudOSAlertButton[];
  readonly ownerAppId: string | null;
  readonly iconUrl: string | null;
}

export interface SynCloudOSAlertCenterSnapshot {
  /** The alert on screen; the rest wait in order. */
  readonly current: SynCloudOSPresentedAlert | null;
  readonly queued: number;
}

export interface SynCloudOSAlertCenter {
  /** Shows the alert after the ones already waiting and resolves with the
   * chosen button id. A safe dismissal, a caller abort or the owner closing
   * resolves to the cancel button instead of rejecting. */
  present(request: SynCloudOSAlertRequest, options?: SynCloudOSAlertPresentationOptions): Promise<string>;
  /** Chooses a button for a presentation; safe dismissal when omitted. */
  dismiss(id: string, buttonId?: string): boolean;
  /** Resolves every alert owned by an application, used when it closes. */
  dismissOwnedBy(appId: string): number;
  getSnapshot(): SynCloudOSAlertCenterSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const okButton = Object.freeze({ id: "ok", label: "OK", role: "default" } as const);

interface AlertEntry {
  readonly presentation: SynCloudOSPresentedAlert;
  readonly detach: (() => void) | undefined;
  readonly settle: (buttonId: string) => void;
}

function normalisedButtons(request: SynCloudOSAlertRequest, presentationId: string): readonly SynCloudOSAlertButton[] {
  const supplied = request.buttons ?? [];
  if (supplied.length === 0) return Object.freeze([okButton]);
  const seen = new Set<string>();
  return Object.freeze(supplied.map((button) => {
    const id = String(button.id ?? "").trim();
    const label = String(button.label ?? "").trim();
    if (!id) throw new TypeError(`Alert ${presentationId} declares a button without an id.`);
    if (!label) throw new TypeError(`Alert ${presentationId} declares button ${id} without a label.`);
    if (seen.has(id)) throw new TypeError(`Alert ${presentationId} declares button ${id} twice.`);
    seen.add(id);
    return Object.freeze({ ...button, id, label });
  }));
}

/** The button a safe dismissal resolves to: the cancel button, else the last. */
export function synCloudOSAlertDismissalButton(buttons: readonly SynCloudOSAlertButton[]): string {
  for (let index = buttons.length - 1; index >= 0; index -= 1) {
    if (buttons[index].role === "cancel") return buttons[index].id;
  }
  return (buttons[buttons.length - 1] ?? okButton).id;
}

interface AlertCentreOptions {
  readonly createId?: () => string;
}

export function createSynCloudOSAlertCenter(options: AlertCentreOptions = {}): SynCloudOSAlertCenter {
  let sequence = 0;
  const createId = options.createId ?? (() => `alert-${++sequence}`);
  const entries: AlertEntry[] = [];
  const listeners = new Set<() => void>();
  let snapshot: SynCloudOSAlertCenterSnapshot = Object.freeze({ current: null, queued: 0 });
  let disposed = false;

  const publish = () => {
    const current = entries[0]?.presentation ?? null;
    snapshot = Object.freeze({ current, queued: Math.max(0, entries.length - 1) });
    for (const listener of [...listeners]) listener();
  };

  const settle = (entry: AlertEntry, buttonId: string) => {
    const index = entries.indexOf(entry);
    if (index < 0) return;
    entries.splice(index, 1);
    entry.detach?.();
    entry.settle(buttonId);
    publish();
  };

  const dismiss = (id: string, buttonId?: string) => {
    const entry = entries.find((candidate) => candidate.presentation.id === id);
    if (!entry) return false;
    settle(entry, buttonId ?? synCloudOSAlertDismissalButton(entry.presentation.buttons));
    return true;
  };

  return Object.freeze({
    present(request: SynCloudOSAlertRequest, presentationOptions: SynCloudOSAlertPresentationOptions = {}) {
      if (disposed) return Promise.reject(new DOMException("The alert centre is disposed.", "AbortError"));
      const title = String(request?.title ?? "").trim();
      if (!title) return Promise.reject(new TypeError("An alert needs a title."));
      const id = createId();
      const presentation = Object.freeze({
        id,
        title,
        message: request.message === undefined ? null : String(request.message),
        buttons: normalisedButtons(request, id),
        ownerAppId: presentationOptions.ownerAppId ?? null,
        iconUrl: presentationOptions.iconUrl ?? null,
      } satisfies SynCloudOSPresentedAlert);
      const signal = presentationOptions.signal;
      const onAbort = () => { dismiss(id); };
      return new Promise<string>((resolve) => {
        entries.push({
          presentation,
          detach: signal ? () => signal.removeEventListener("abort", onAbort) : undefined,
          settle: resolve,
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        publish();
        if (signal?.aborted) dismiss(id);
      });
    },
    dismiss,
    dismissOwnedBy(appId: string) {
      let dismissed = 0;
      for (const entry of [...entries]) {
        if (entry.presentation.ownerAppId !== appId) continue;
        settle(entry, synCloudOSAlertDismissalButton(entry.presentation.buttons));
        dismissed += 1;
      }
      return dismissed;
    },
    getSnapshot() { return snapshot; },
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of [...entries]) settle(entry, synCloudOSAlertDismissalButton(entry.presentation.buttons));
      listeners.clear();
      publish();
    },
  });
}
