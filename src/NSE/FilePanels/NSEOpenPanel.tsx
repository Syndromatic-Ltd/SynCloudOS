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

import React from "react";
import type { FilePanelReference, FilePanelResult, FilePanelService, OpenPanelRequest } from "../../SynCloudOS/FilePanels/filePanelTypes";
import { matchesOpenPanelContentType, openPanelAcceptTypes, type FilePanelDirectory } from "../../SynCloudOS/FilePanels/OpenPanelFileSystem";
import type { MediaPanelItem, MediaPanelProvider } from "../../SynCloudOS/MediaPanels/mediaPanelTypes";
import { NSEModalResponse } from "../Application/NSEAlert";
import { nseEndSheet, type NSESheet, type NSEWindow } from "../Application/NSEWindowController";
import { resolveNSEOpenPanelHost, type NSEOpenPanelHost } from "./openPanelHost";
import { NSEOpenPanelContent } from "./NSEOpenPanelContent";

export type NSEFilePanelService = Pick<FilePanelService, "open" | "save" | "release" | "dispose">;
/** Browser file references and provider media identities; no synthetic OS paths. */
export type NSEOpenPanelURL = FilePanelReference | MediaPanelItem;

/** @internal An immutable presentation request, separate from the panel's configurable properties. */
export interface OpenPanelSession {
  readonly id: string;
  readonly panel: NSEOpenPanel;
  readonly host: NSEOpenPanelHost;
  readonly signal: AbortSignal;
  readonly compact: boolean;
  readonly anchor: HTMLElement | null;
  readonly canChooseFiles: boolean;
  readonly canChooseDirectories: boolean;
  readonly allowsMultipleSelection: boolean;
  readonly allowedContentTypes: readonly string[];
  readonly directoryURL: FilePanelDirectory | null;
  readonly mediaSources: readonly MediaPanelProvider[];
  readonly prompt: string;
  readonly message: string;
  accept(urls: readonly NSEOpenPanelURL[], releaseMedia?: () => void): Promise<void>;
  cancel(): void;
  systemChooser(): Promise<FilePanelResult<FilePanelReference>>;
}
let sequence = 0;

/** NSOpenPanel: configure an object, then begin a sheet or an application-modal session. */
export class NSEOpenPanel implements NSESheet {
  canChooseFiles = true;
  canChooseDirectories = false;
  allowsMultipleSelection = false;
  allowedContentTypes: readonly string[] = [];
  directoryURL: FilePanelDirectory | null = null;
  prompt = "Open";
  message = "";
  mediaSources: readonly MediaPanelProvider[] = [];
  /** SynCloudOS extension: bypass the drawn panel and invoke the browser's system chooser. */
  usesSystemFileChooser = false;
  #urls: readonly NSEOpenPanelURL[] = Object.freeze([]);
  #result: FilePanelResult<NSEOpenPanelURL> = { kind: "cancelled" };
  #cancel: (() => void) | null = null;
  #releaseMedia: (() => void) | undefined;
  #disposed = false;
  get urls(): readonly NSEOpenPanelURL[] { return this.#urls; }
  get url(): NSEOpenPanelURL | null { return this.#urls[0] ?? null; }
  get result(): FilePanelResult<NSEOpenPanelURL> { return this.#result; }

  begin(completionHandler?: (response: number) => void): Promise<number> { return this.#run(null, completionHandler); }
  runModal(): Promise<number> { return this.#run(null); }
  beginSheetModal(window: NSEWindow, completionHandler?: (response: number) => void): Promise<number> { return this.#run(window, completionHandler); }
  cancel(): void { this.#cancel?.(); }
  /** Releases provider resources retained by this panel's last accepted selection. */
  dispose(): void { this.cancel(); this.#disposed = true; this.#releaseMedia?.(); this.#releaseMedia = undefined; }
  [nseEndSheet](window: NSEWindow, returnCode?: number): void { if (this.#window === window) this.cancel(); void returnCode; }
  #window: NSEWindow | null = null;

  #run(window: NSEWindow | null, completion?: (response: number) => void): Promise<number> {
    if (this.#disposed) return Promise.reject(new TypeError("This Open panel is disposed."));
    if (this.#cancel) return Promise.reject(new TypeError("This Open panel is already presented."));
    if (!this.canChooseFiles && !this.canChooseDirectories) return Promise.reject(new TypeError("An Open panel must allow files or directories."));
    const host = resolveNSEOpenPanelHost(window);
    const capabilities = host.fileSystem?.capabilities();
    const drawn = !this.usesSystemFileChooser && host.isSecureContext() && !!(capabilities?.folders || capabilities?.applicationStorage || this.mediaSources.length);
    this.#releaseMedia?.(); this.#releaseMedia = undefined;
    this.#urls = Object.freeze([]); this.#result = { kind: "cancelled" }; this.#window = window;
    const owner = new AbortController();
    const id = `nse-open-panel:${++sequence}`;
    const anchor = host.focusedElement();
    const contentTypes = Object.freeze([...this.allowedContentTypes]);
    const request: OpenPanelRequest = { id, accepts: openPanelAcceptTypes(contentTypes),
      selection: !this.canChooseFiles ? "single-directory" : this.allowsMultipleSelection ? "multiple-files" : "single-file", access: "read", requires: !this.canChooseFiles ? ["directory"] : [],
      validateContent: async (reference, signal) => {
        if (reference.kind === "directory-handle") return { ok: true };
        const file = await reference.read(signal);
        return matchesOpenPanelContentType(reference.name, file.type, contentTypes) ? { ok: true } : { ok: false, message: "The selected file does not match the allowed content types." };
      } };
    let settled = false;
    let closing = false;
    let shown: Promise<string> | undefined;
    let finish!: (response: number) => void;
    const pending = new Promise<number>(resolve => { finish = resolve; });
    const complete = (result: FilePanelResult<NSEOpenPanelURL>) => {
      if (settled) { if (result.kind === "accepted") for (const item of result.values) if ("release" in item) item.release("request-replaced"); return; }
      settled = true; owner.abort(); host.signal.removeEventListener("abort", cancelled);
      this.#cancel = null; this.#window = null; this.#result = result;
      this.#urls = Object.freeze(result.kind === "accepted" ? [...result.values] : []);
      const response = result.kind === "accepted" ? NSEModalResponse.OK : NSEModalResponse.cancel;
      // The sheet's parent is still inert until its unmount commits. Restore
      // through the mounted scheduler after that commit, rather than focusing
      // an inert control while the modal scope is still being removed.
      if (anchor) queueMicrotask(() => {
        if (host.signal.aborted || !anchor.isConnected) return;
        if (host.restoreFocus) host.restoreFocus(anchor); else anchor.focus();
      });
      finish(response); completion?.(response);
    };
    const close = async (result: FilePanelResult<NSEOpenPanelURL>) => {
      if (settled || closing) return;
      closing = true;
      try {
        if (shown) {
          await shown;
          const dismissed = await host.bridge.dismiss(id);
          if (dismissed.outcome === "refused" || dismissed.outcome === "cancelled") { closing = false; return; }
        }
        complete(result);
      } catch (cause) { complete({ kind: "error", message: "The Open panel could not close.", cause }); }
    };
    const cancelled = () => {
      if (host.signal.aborted) { if (shown) void shown.then(() => host.bridge.dismiss(id)).catch(() => {}); complete({ kind: "interrupted", message: "The Open panel's application ended." }); }
      else void close({ kind: "cancelled" });
    };
    this.#cancel = cancelled;
    host.signal.addEventListener("abort", cancelled, { once: true });
    const systemChooser = (): Promise<FilePanelResult<FilePanelReference>> => {
      if (!host.hasTransientUserActivation()) return Promise.resolve({ kind: "denied", reason: "policy", message: "File selection requires an active user action." });
      if (!this.canChooseFiles && this.allowsMultipleSelection) return Promise.resolve({ kind: "unavailable", missingCapabilities: ["multiple-selection"], message: "This browser's system chooser cannot select multiple directories. Choose a granted folder in the Open panel." });
      return host.service.open(request, owner.signal);
    };
    if (!drawn) {
      // Dispatch in this stack, before awaiting anything that can consume activation.
      void systemChooser().then(complete, cause => complete({ kind: "error", message: "File selection failed.", cause }));
      return pending;
    }
    const compact = host.compact();
    const session: OpenPanelSession = { id, panel: this, host, signal: owner.signal, compact, anchor,
      canChooseFiles: this.canChooseFiles, canChooseDirectories: this.canChooseDirectories,
      allowsMultipleSelection: this.allowsMultipleSelection, allowedContentTypes: Object.freeze([...this.allowedContentTypes]),
      directoryURL: this.directoryURL, mediaSources: Object.freeze([...this.mediaSources]), prompt: this.prompt, message: this.message,
      accept: async (values, releaseMedia) => { if (settled) { releaseMedia?.(); return; } const previous = this.#releaseMedia; this.#releaseMedia = () => { previous?.(); releaseMedia?.(); }; await close({ kind: "accepted", values }); },
      cancel: cancelled, systemChooser,
    };
    const frame = host.frame();
    const width = compact ? frame.width : Math.min(820, frame.width - 32);
    const height = compact ? frame.height : Math.min(560, frame.height - 48);
    shown = host.bridge.present({ id, role: window ? "sheet" : "modal", title: this.prompt || "Open", parentWindowControllerId: window?.id ?? null,
      parentResponderId: host.responderId, anchor, bounds: { x: frame.x + (frame.width - width) / 2, y: frame.y + (window ? 0 : (frame.height - height) / 2), width, height },
      onDidClose: () => { if (!closing) complete({ kind: "cancelled" }); },
    }, <NSEOpenPanelContent session={session} />);
    void shown.catch(cause => complete({ kind: "error", message: "The Open panel could not be presented.", cause }));
    return pending;
  }
}
