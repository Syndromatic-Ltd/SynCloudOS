/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import "./window-titlebar.css";
import { createContext, type ReactNode } from "react";
import type { NSEWindowToolbarStyle } from "../Application/NSEWindowController";
import type { NSEViewController } from "../Application/NSEViewController";

/** @internal A window's presentation in its host's title bar. */
export interface NSEWindowTitlebarDocument {
  readonly title: string;
  readonly subtitle: string;
  readonly documentEdited: boolean;
  readonly toolbarStyle?: NSEWindowToolbarStyle;
}

/** @internal Accessory portals retain the application's context and responder chain. */
export interface NSEWindowTitlebarHost {
  setDocument(document: NSEWindowTitlebarDocument | null): void;
  readonly leadingAccessories: HTMLElement | null;
  readonly trailingAccessories: HTMLElement | null;
}

export const NSEWindowTitlebarDocumentContext = createContext<NSEWindowTitlebarDocument | null>(null);

export const NSEWindowTitlebarHostContext = createContext<NSEWindowTitlebarHost | null>(null);

/** @internal The root split supplies a slot above its main content, outside its scroll view. */
export const NSEWindowTitleSlotContext = createContext<{
  readonly root: NSEViewController<unknown> | null;
  readonly setSlot: (element: HTMLDivElement | null) => void;
} | null>(null);

/** @internal Title-bar drawing shared by expanded windows and preference panels. */
export function NSEWindowTitlebarContent({ toolbarStyle, title, subtitle, leading, trailing, mode, className = "" }: {
  readonly toolbarStyle: NSEWindowToolbarStyle;
  readonly title: ReactNode;
  readonly subtitle?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly mode?: "light" | "dark";
  readonly className?: string;
}) {
  return <header className={`nse-window-titlebar-content ${className}`} data-window-titlebar="" data-toolbar-style={toolbarStyle} data-mode={mode}>
    <span className="nse-window-titlebar-leading" data-layout-attribute="leading">{leading}</span>
    <div className="nse-window-titlebar-copy">
      <h1 className="nse-window-titlebar-heading" data-window-title="">{title}</h1>
      {subtitle ? <span className="nse-window-titlebar-subtitle">{subtitle}</span> : null}
    </div>
    <span className="nse-window-titlebar-trailing" data-layout-attribute="trailing">{trailing}</span>
  </header>;
}
