/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { NSEWindow } from "../Application/NSEWindowController";
import type { NSEWindowSurfaceBridge } from "../Overlays/NSEWindowSurfaceBridge";
import type { FilePanelService } from "../../SynCloudOS/nseRuntimeContracts";
import type { OpenPanelFileSystem } from "../../SynCloudOS/nseRuntimeContracts";
import type { IFXImageResource } from "../../FX/ImageFX/IFXImageResource";
import type { IFXImageGeometryPort } from "../../FX/ImageFX/IFXImageViewport";

/** @internal The panel needs image decoding and geometry, independent of an application SDK. */
export interface NSEOpenPanelImagePort {
  load(request: Readonly<Record<string, unknown>>): IFXImageResource;
  readonly geometry?: IFXImageGeometryPort;
}

export interface NSEOpenPanelHost {
  readonly service: Pick<FilePanelService, "open" | "save" | "release" | "dispose">;
  readonly fileSystem?: OpenPanelFileSystem;
  readonly bridge: NSEWindowSurfaceBridge;
  readonly signal: AbortSignal;
  readonly responderId: string;
  readonly images?: NSEOpenPanelImagePort;
  isKey(): boolean;
  isSecureContext(): boolean;
  hasTransientUserActivation(): boolean;
  compact(): boolean;
  frame(): Readonly<{ x: number; y: number; width: number; height: number }>;
  focusedElement(): HTMLElement | null;
  restoreFocus?(element: HTMLElement): void;
  observeGeometry?(element: HTMLElement, listener: () => void): () => void;
}
const windows = new WeakMap<NSEWindow, NSEOpenPanelHost>();
const applications = new Set<NSEOpenPanelHost>();
export function registerNSEOpenPanelHost(host: NSEOpenPanelHost, window?: NSEWindow): () => void {
  if (window) windows.set(window, host); else applications.add(host);
  return () => { if (window) { if (windows.get(window) === host) windows.delete(window); } else applications.delete(host); };
}
export function resolveNSEOpenPanelHost(window: NSEWindow | null): NSEOpenPanelHost {
  const host = window ? windows.get(window) : [...applications].reverse().find(candidate => !candidate.signal.aborted && candidate.isKey());
  if (!host || host.signal.aborted) throw new TypeError("NSEOpenPanel needs a mounted application and its window.");
  return host;
}
