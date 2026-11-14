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

import { nseEndSheet, nsePresentModalAlert, nsePresentWindowAlert, type Sheet, type NSEWindow, type WindowAlertRequest } from "./NSEWindowController";

/** How an alert presents itself, after NSAlert.Style. */
export type NSEAlertStyle = "warning" | "informational" | "critical";

/**
 * The response a modal session ends with, after NSApplication.ModalResponse. An alert ends with
 * `alertFirstButtonReturn` for its first button, `alertSecondButtonReturn` for its second, and so on
 * (`alertFirstButtonReturn + n` for the button at index `n`).
 */
export type NSEModalResponse = number;

/** The modal responses AppKit names (NSApplication.ModalResponse). */
export const NSEModalResponse = Object.freeze({
  OK: 1,
  cancel: 0,
  stop: -1000,
  abort: -1001,
  continue: -1002,
  alertFirstButtonReturn: 1000,
  alertSecondButtonReturn: 1001,
  alertThirdButtonReturn: 1002,
});

/** One of an alert's buttons (the NSButton `addButton(withTitle:)` returns). */
export class NSEAlertButton {
  #title: string;
  /** The key that chooses the button. The first button takes Return; a button titled "Cancel" takes Escape. */
  keyEquivalent: string;
  /** Shows the button as one that destroys data, as NSButton.hasDestructiveAction does. */
  hasDestructiveAction = false;

  /** @internal Buttons are made by `NSEAlert.addButton`. */
  constructor(title: string, keyEquivalent: string) {
    this.#title = title;
    this.keyEquivalent = keyEquivalent;
  }

  get title(): string { return this.#title; }
  set title(value: string) { this.#title = requireTitle(value, "An alert button"); }
}

function requireTitle(value: unknown, owner: string): string {
  if (typeof value !== "string") throw new TypeError(`${owner} title must be a string.`);
  const title = value.trim();
  if (!title) throw new TypeError(`${owner} needs a title.`);
  return title;
}

/**
 * A modal alert, after NSAlert. Configure it, then present it as a sheet on a window; the promise resolves
 * with the response of the button the person chose.
 *
 * ```ts
 * const alert = new NSEAlert();
 * alert.messageText = `Delete “${post.title}”?`;
 * alert.informativeText = "You cannot undo this action.";
 * alert.addButton("Delete").hasDestructiveAction = true;
 * alert.addButton("Cancel");
 * if (await alert.beginSheetModal(this.window) === NSEModalResponse.alertFirstButtonReturn) this.delete(post);
 * ```
 *
 * With no buttons added, the alert shows one OK button. Escape, or closing the window, chooses the button titled
 * "Cancel" (or whose key equivalent is Escape), else the last button.
 */
export class NSEAlert implements Sheet {
  #messageText = "";
  #informativeText = "";
  #alertStyle: NSEAlertStyle = "warning";
  readonly #buttons: NSEAlertButton[] = [];
  #presentation: { readonly window: NSEWindow | null; readonly end: AbortController; returnCode?: number } | null = null;

  /** The alert's title. */
  get messageText(): string { return this.#messageText; }
  set messageText(value: string) {
    if (typeof value !== "string") throw new TypeError("An alert's messageText must be a string.");
    this.#messageText = value;
  }

  /** The text under the title. */
  get informativeText(): string { return this.#informativeText; }
  set informativeText(value: string) {
    if (typeof value !== "string") throw new TypeError("An alert's informativeText must be a string.");
    this.#informativeText = value;
  }

  /** The alert's style. `"critical"` is for an action that could lose data. */
  get alertStyle(): NSEAlertStyle { return this.#alertStyle; }
  set alertStyle(value: NSEAlertStyle) {
    if (value !== "warning" && value !== "informational" && value !== "critical")
      throw new TypeError('An alert\'s style must be "warning", "informational" or "critical".');
    this.#alertStyle = value;
  }

  /** The alert's buttons, in the order they were added; the first is the default. */
  get buttons(): readonly NSEAlertButton[] { return Object.freeze([...this.#buttons]); }

  /** Adds a button (NSAlert.addButton(withTitle:)) and returns it. Buttons appear in the order they are added. */
  addButton(title: string): NSEAlertButton {
    const resolved = requireTitle(title, "An alert button");
    const keyEquivalent = this.#buttons.length === 0 ? "\r" : resolved === "Cancel" ? "\u001b" : "";
    const button = new NSEAlertButton(resolved, keyEquivalent);
    this.#buttons.push(button);
    return button;
  }

  /**
   * Presents the alert as a sheet on `window` (NSAlert.beginSheetModal(for:)) and resolves with the chosen
   * button's response. Closing the window ends the sheet as Escape would.
   */
  beginSheetModal(window: NSEWindow): Promise<NSEModalResponse> {
    return this.#run(window, (request, signal) => nsePresentWindowAlert(window, request, signal));
  }

  /**
   * Presents the alert application-modally (NSAlert.runModal()): a centred alert for the active
   * application rather than a sheet attached to one window. Resolves with the chosen button's response.
   */
  runModal(): Promise<NSEModalResponse> {
    return this.#run(null, nsePresentModalAlert);
  }

  async #run(window: NSEWindow | null, present: (request: WindowAlertRequest, signal: AbortSignal) => Promise<string>): Promise<NSEModalResponse> {
    const title = this.#messageText.trim();
    if (!title) throw new TypeError("An alert needs messageText before it is presented.");
    if (this.#presentation) throw new TypeError("This alert is already presented.");
    const buttons = this.#buttons.length > 0 ? this.#buttons : [new NSEAlertButton("OK", "\r")];
    const escape = buttons.findIndex(button => button.keyEquivalent === "\u001b");
    const request = Object.freeze({
      title,
      ...(this.#informativeText ? { message: this.#informativeText } : {}),
      style: this.#alertStyle,
      buttons: Object.freeze(buttons.map((button, index) => Object.freeze({
        id: String(index),
        label: button.title,
        ...(button.hasDestructiveAction ? { role: "destructive" as const }
          : index === escape ? { role: "cancel" as const }
          : button.keyEquivalent === "\r" ? { role: "default" as const } : {}),
      }))),
    });
    const presentation: { readonly window: NSEWindow | null; readonly end: AbortController; returnCode?: number } = { window, end: new AbortController() };
    this.#presentation = presentation;
    try {
      const chosen = await present(request, presentation.end.signal);
      if (presentation.returnCode !== undefined) return presentation.returnCode;
      const index = Number(chosen);
      return NSEModalResponse.alertFirstButtonReturn + (Number.isInteger(index) && index >= 0 ? index : buttons.length - 1);
    } finally {
      this.#presentation = null;
    }
  }

  /** @internal `NSEWindow.endSheet` ends the alert through this. */
  [nseEndSheet](window: NSEWindow, returnCode?: number): void {
    const presentation = this.#presentation;
    if (!presentation || presentation.window !== window || presentation.end.signal.aborted) return;
    presentation.returnCode = returnCode;
    presentation.end.abort();
  }
}
