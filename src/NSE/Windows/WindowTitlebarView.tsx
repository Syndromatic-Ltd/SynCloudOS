/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { nseWindowFrameStyle } from "../Application/NSEWindowFrameView";
import { useNSEWindowChromeElement } from "../Layout/windowObstructions";
import type { WindowTitlebarDocument, WindowTitlebarSlots } from "./windowTitlebarContext";
import "./Chrome/nse-chrome.css";
import "./WindowTitlebarView.css";

export interface WindowTitlebarViewProps {
  readonly document: WindowTitlebarDocument;
  readonly isKeyWindow: boolean;
  readonly titleId?: string;
  readonly material?: "standard" | "cumulus" | "metal";
  readonly variant?: "standard" | "panel" | "hud";
  readonly mode?: "light" | "dark";
  readonly controls?: ReactNode;
  readonly sidebar?: { readonly width: number; readonly content: ReactNode };
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly bottomAccessories?: ReactNode;
  readonly menuBar?: ReactNode;
  readonly titleAction?: ReactNode;
  /** The native buttons' occupied rectangle in viewport CSS coordinates. */
  readonly nativeControlExclusion?: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height"> | null;
  readonly onSlotsChange?: (slots: WindowTitlebarSlots) => void;
  readonly moveHandleProps?: HTMLAttributes<HTMLElement>;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const interactiveSelector = '[data-window-no-drag],button,a,input,textarea,select,summary,[role="button"],[role="menuitem"],[role="tab"],[role="slider"],[role="combobox"],[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])';
function interactiveTarget(target: EventTarget | null, header: HTMLElement): boolean {
  const node = target as Node | null;
  const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  const interactive = element?.closest(interactiveSelector);
  return Boolean(interactive && interactive !== header && header.contains(interactive));
}

/** @internal Shared composition; the window's existing toolbar renderer owns overflow and commands. */
export function WindowTitlebarView({ document, isKeyWindow, titleId, material = "standard", variant = "standard", mode = "light",
  controls, sidebar, leading, trailing, toolbar, bottomAccessories, menuBar, titleAction, nativeControlExclusion,
  onSlotsChange, moveHandleProps, className = "", style }: WindowTitlebarViewProps) {
  const header = useRef<HTMLElement>(null);
  useNSEWindowChromeElement(header, "top", document.titlebarAppearsTransparent === true || document.fullSizeContentView === true);
  const [leadingAccessories, setLeading] = useState<HTMLDivElement | null>(null);
  const [trailingAccessories, setTrailing] = useState<HTMLDivElement | null>(null);
  const [toolbarElement, setToolbar] = useState<HTMLDivElement | null>(null);
  const [bottomElement, setBottom] = useState<HTMLDivElement | null>(null);
  const [menuElement, setMenu] = useState<HTMLDivElement | null>(null);
  const slots = useMemo(() => ({ leadingAccessories, trailingAccessories, toolbar: toolbarElement, bottomAccessories: bottomElement, menuBar: menuElement }),
    [leadingAccessories, trailingAccessories, toolbarElement, bottomElement, menuElement]);
  useLayoutEffect(() => { onSlotsChange?.(slots); }, [onSlotsChange, slots]);
  useLayoutEffect(() => () => { onSlotsChange?.({ leadingAccessories: null, trailingAccessories: null, toolbar: null, bottomAccessories: null, menuBar: null }); }, [onSlotsChange]);
  const [exclusion, setExclusion] = useState({ left: 0, right: 0 });
  const nativeX = nativeControlExclusion?.x, nativeY = nativeControlExclusion?.y;
  const nativeWidth = nativeControlExclusion?.width, nativeHeight = nativeControlExclusion?.height;
  useLayoutEffect(() => {
    const node = header.current;
    if (!node) return;
    const view = node.ownerDocument.defaultView;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      let left = 0, right = 0;
      if (nativeX !== undefined && nativeY !== undefined && nativeWidth !== undefined && nativeHeight !== undefined
        && [nativeX, nativeY, nativeWidth, nativeHeight].every(Number.isFinite) && nativeWidth > 0 && nativeHeight > 0
        && nativeY < bounds.bottom && nativeY + nativeHeight > bounds.top && nativeX < bounds.right && nativeX + nativeWidth > bounds.left) {
        if (nativeX + nativeWidth / 2 <= bounds.left + bounds.width / 2) left = Math.min(bounds.width, Math.max(0, nativeX + nativeWidth - bounds.left));
        else right = Math.min(bounds.width, Math.max(0, bounds.right - nativeX));
      }
      setExclusion(previous => previous.left === left && previous.right === right ? previous : { left, right });
    };
    measure();
    const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
    observer?.observe(node);
    view?.addEventListener("resize", measure);
    node.ownerDocument.addEventListener("scroll", measure, true);
    return () => { observer?.disconnect(); view?.removeEventListener("resize", measure); node.ownerDocument.removeEventListener("scroll", measure, true); };
  }, [nativeX, nativeY, nativeWidth, nativeHeight]);
  const toolbarStyle = document.toolbarStyle ?? "automatic";
  const resolvedStyle = toolbarStyle === "automatic" ? "unified" : toolbarStyle;
  const separateToolbar = resolvedStyle === "expanded" || resolvedStyle === "preference";
  const hasToolbar = document.hasToolbar === true || toolbar != null;
  const presentation = material === "cumulus" ? document.titlebarPresentation ?? "attached" : "attached";
  const { className: moveClassName, style: moveStyle, onPointerDown, onDoubleClick, ...handleProps } = moveHandleProps ?? {};
  const toolbarSlot = <div ref={setToolbar} data-window-toolbar-slot="" data-window-no-drag=""
    className="nse-window-titlebar-view__toolbar">{toolbar}</div>;
  const sidebarWidth = sidebar?.width ?? document.sidebarWidth;
  const metalRail = material === "metal" && sidebarWidth !== undefined;
  const headerStyle = { "--nse-window-titlebar-sidebar-width": sidebarWidth === undefined ? undefined : `${sidebarWidth}px`, ...nseWindowFrameStyle(document.frameViewClass), ...moveStyle, ...style, "--nse-titlebar-native-left": `${exclusion.left}px`, "--nse-titlebar-native-right": `${exclusion.right}px` } as CSSProperties;
  return <header {...handleProps} ref={header}
    className={["nse-window-titlebar-view", material === "standard" ? `nse-window__titlebar nse-window__titlebar--${variant}` : `nse-app-topbar${material === "metal" ? " nse-app-topbar-metal" : ""}`, variant === "hud" ? "nse-window__hud-titlebar" : "", moveClassName, className].filter(Boolean).join(" ")}
    style={headerStyle} data-nse-control="window" data-nse-part="header" data-nse-style={variant}
    data-nse-chrome={material === "metal" ? "metal" : "standard"} data-nse-toolbar-style={toolbarStyle}
    data-toolbar-style={toolbarStyle} data-titlebar-layout={resolvedStyle} data-titlebar-material={material}
    data-titlebar-presentation={presentation} data-has-rail={material === "metal" ? String(metalRail) : undefined} data-window-frame-view={document.frameViewClass ? "" : undefined}
    data-titlebar-transparent={document.titlebarAppearsTransparent ? "true" : undefined} data-has-toolbar={hasToolbar ? "true" : "false"}
    data-window-titlebar="" data-window-hud-titlebar={variant === "hud" ? "" : undefined} data-window-panel-titlebar={variant === "panel" ? "" : undefined}
    data-window-active={isKeyWindow ? "true" : "false"} data-nse-key-window={isKeyWindow ? undefined : "false"}
    data-mode={mode} data-nse-colour-scheme-resolved={mode} data-variant={material === "metal" ? "atmoMetal" : material === "cumulus" ? "atmoCumulus" : undefined}
    onPointerDown={event => { if (!interactiveTarget(event.target, event.currentTarget)) onPointerDown?.(event); }}
    onDoubleClick={event => { if (!interactiveTarget(event.target, event.currentTarget)) onDoubleClick?.(event); }}>
    {presentation === "floating" ? <div data-nse-part="floating-titlebar" className="nse-window-titlebar-view__floating-surface" aria-hidden="true" />
      : material === "cumulus" ? <div className="nse-app-topbar-base" aria-hidden="true"><span className="nse-app-topbar-base-glass" /></div> : null}
    <div ref={setMenu} data-nse-part="menu" data-window-menu-slot="" className="nse-window-titlebar-view__menu" data-window-no-drag="">{menuBar}</div>
    <div data-nse-part="content" className={`nse-window-titlebar-view__row${material === "metal" && !metalRail ? " nse-app-topbar-metal-main" : ""}`} data-window-titlebar-row="">
      {metalRail ? <span data-nse-part="sidebar" className="nse-window-titlebar-view__metal-rail nse-app-topbar-metal-rail" aria-hidden="true"><span className="nse-app-topbar-metal-grain" /></span> : null}
      {metalRail ? <span className="nse-window-titlebar-view__metal-body nse-app-topbar-metal-main" aria-hidden="true" /> : null}
      {material === "metal" ? <span className="nse-app-topbar-metal-grain" aria-hidden="true" /> : null}
      {controls ? <div className="nse-window-titlebar-view__controls" data-window-no-drag="" data-syncloudos-focus-chrome="">{controls}</div> : null}
      {sidebar ? <div className="nse-window-titlebar-view__sidebar" data-window-no-drag="" style={{ width: sidebar.width }}>{sidebar.content}</div> : null}
      <div ref={setLeading} data-nse-part="leading" data-layout-attribute="leading" className="nse-window-titlebar-view__accessory" data-window-no-drag="">{leading}</div>
      <h2 id={titleId} data-nse-part="title" data-document-edited={document.documentEdited ? "true" : undefined} data-window-title="" className={variant === "hud" ? "nse-window-titlebar-view__title nse-window__hud-title" : "nse-window-titlebar-view__title"} hidden={document.titleVisibility === "hidden"}>
        {titleAction ?? document.title}
        {document.subtitle ? <span data-nse-part="subtitle" className="nse-window-titlebar-subtitle">{document.subtitle}</span> : null}
      </h2>
      {hasToolbar && !separateToolbar ? toolbarSlot : null}
      <div ref={setTrailing} data-nse-part="trailing" data-layout-attribute="trailing" className="nse-window-titlebar-view__accessory" data-window-no-drag="">{trailing}</div>
    </div>
    {hasToolbar && separateToolbar ? <div className="nse-window-titlebar-view__toolbar-row" data-window-titlebar-toolbar-row="">{toolbarSlot}</div> : null}
    <div ref={setBottom} data-nse-part="titlebar-accessories" className="nse-window-titlebar-view__bottom" data-window-no-drag="">{bottomAccessories}</div>
  </header>;
}
