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

import type { BrowserFilePanelPort, BrowserFilePanelSelection, OpenPanelRequest } from "../SynCloudOS";

function acceptAttribute(request: OpenPanelRequest): string {
  const values = new Set<string>();
  for (const type of request.accepts) {
    for (const mimeType of type.mimeTypes) values.add(mimeType);
    for (const extension of type.extensions) values.add(extension);
  }
  return [...values].join(",");
}

/**
 * The browser's own file chooser, behind the Open panel: a detached `<input type="file">` the
 * environment creates, clicks and removes. The page must still hold the user's activation from
 * the click that asked for it, as every browser requires before showing a chooser.
 */
export function createBrowserFilePickerPort(browserWindow: Window | null | undefined): BrowserFilePanelPort | null {
  const ownerDocument = browserWindow?.document;
  if (!ownerDocument?.body) return null;
  return {
    id: "browser-file-input",
    pickFiles(request, signal) {
      signal.throwIfAborted();
      const input = ownerDocument.createElement("input");
      input.type = "file";
      input.multiple = request.selection === "multiple-files";
      const accept = acceptAttribute(request);
      if (accept) input.accept = accept;
      input.tabIndex = -1;
      input.setAttribute("aria-hidden", "true");
      input.style.cssText = "position:fixed;inset:auto;width:1px;height:1px;opacity:0;pointer-events:none;";
      ownerDocument.body.append(input);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        signal.removeEventListener("abort", abort);
        input.remove();
      };
      let settle: (selection: BrowserFilePanelSelection) => void = () => {};
      let fail: (reason: unknown) => void = () => {};
      const settled = new Promise<BrowserFilePanelSelection>((resolve, reject) => { settle = resolve; fail = reject; });
      let done = false;
      const finish = (files: readonly File[]) => {
        if (done) return;
        done = true;
        settle(files.length ? { kind: "accepted", files, cleanup } : { kind: "cancelled", cleanup });
      };
      function abort() {
        if (done) return;
        done = true;
        cleanup();
        fail(signal.reason ?? new DOMException("The file panel was cancelled.", "AbortError"));
      }
      input.addEventListener("change", () => finish([...(input.files ?? [])]), { once: true });
      // Dismissing the chooser fires `cancel`, where the browser has it.
      input.addEventListener("cancel", () => finish([]), { once: true });
      signal.addEventListener("abort", abort, { once: true });
      try { input.click(); } catch (error) { done = true; cleanup(); return Promise.reject(error); }
      return settled;
    },
  };
}
