/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { nseWindowFrameStyle } from "../Application/NSEWindowFrameView";
import { useNSEWindowChromeElement } from "../Layout/windowObstructions";
import { WindowTitlebarHostContext, type WindowTitlebarDocument, type WindowTitlebarSlots } from "./windowTitlebarContext";
import "./Chrome/nse-chrome.css";
import "./WindowTitlebarView.css";
import { WindowTitlebarMaterialContext } from "./TitlebarGlyphButton";

export interface WindowTitlebarViewProps {
  readonly document: WindowTitlebarDocument;
  readonly isKeyWindow: boolean;
  readonly titleId?: string;
  readonly material?: "standard" | "cumulus" | "metal";
  readonly variant?: "standard" | "panel" | "hud";
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
export function WindowTitlebarView({ document, isKeyWindow, titleId, material = "standard", variant = "standard",
  controls, sidebar, leading, trailing, toolbar, bottomAccessories, menuBar, titleAction, nativeControlExclusion,
  onSlotsChange, moveHandleProps, className = "", style }: WindowTitlebarViewProps) {
  const header = useRef<HTMLElement>(null);
  // A window's own title bar is part of that window, as NSWindow's is; only a free-standing bar is a window control itself.
  const ownedByWindow = useContext(WindowTitlebarHostContext) !== null;
  useNSEWindowChromeElement(header, "top", document.titlebarAppearsTransparent === true || document.fullSizeContentView === true);
  const [standardControls, setStandardControls] = useState<HTMLDivElement | null>(null);
  const [leadingAccessories, setLeading] = useState<HTMLDivElement | null>(null);
  const [trailingAccessories, setTrailing] = useState<HTMLDivElement | null>(null);
  const [toolbarElement, setToolbar] = useState<HTMLDivElement | null>(null);
  const [bottomElement, setBottom] = useState<HTMLDivElement | null>(null);
  const [menuElement, setMenu] = useState<HTMLDivElement | null>(null);
  const [applicationMenuElement, setApplicationMenu] = useState<HTMLDivElement | null>(null);
  const slots = useMemo(() => ({ standardControls, leadingAccessories, trailingAccessories, toolbar: toolbarElement, bottomAccessories: bottomElement, menuBar: menuElement, applicationMenu: applicationMenuElement }),
    [standardControls, leadingAccessories, trailingAccessories, toolbarElement, bottomElement, menuElement, applicationMenuElement]);
  useLayoutEffect(() => { onSlotsChange?.(slots); }, [onSlotsChange, slots]);
  useLayoutEffect(() => () => { onSlotsChange?.({ standardControls: null, leadingAccessories: null, trailingAccessories: null, toolbar: null, bottomAccessories: null, menuBar: null }); }, [onSlotsChange]);
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
  const hasToolbar = document.hasToolbar === true || toolbar != null;
  const toolbarHasRowItems = document.toolbarHasRowItems ?? true;
  // As in OS X's unified title and toolbar, labelled items grow the bar by a toolbar row instead of squeezing into the title row.
  const labelledToolbar = hasToolbar && document.toolbarDisplayMode !== undefined && document.toolbarDisplayMode !== "iconOnly";
  const separateToolbar = toolbarHasRowItems && (resolvedStyle === "expanded" || resolvedStyle === "preference" || (resolvedStyle === "unified" && labelledToolbar));
  const presentation = material === "cumulus" ? document.titlebarPresentation ?? "attached" : "attached";
  useLayoutEffect(() => {
    const node = header.current;
    const container = node?.parentElement;
    const view = node?.ownerDocument.defaultView;
    if (presentation !== "floating" || !node || !container || !view) return;
    const measure = () => {
      const bar = node.getBoundingClientRect();
      const parent = container.getBoundingClientRect();
      const computed = view.getComputedStyle(container);
      const inset = parseFloat(computed.borderInlineStartWidth) + parseFloat(computed.paddingInlineStart);
      const offset = computed.direction === "rtl" ? parent.right - bar.right : bar.left - parent.left;
      node.style.setProperty("--nse-floating-titlebar-inline-offset", `${offset - inset}px`);
    };
    measure();
    const observer = view.ResizeObserver ? new view.ResizeObserver(measure) : null;
    observer?.observe(container);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      node.style.removeProperty("--nse-floating-titlebar-inline-offset");
    };
  }, [presentation]);
  const { className: moveClassName, style: moveStyle, onPointerDown, onDoubleClick, ...handleProps } = moveHandleProps ?? {};
  // Metal is one piece: a labelled unified toolbar takes a second row inside the bar, under the same gradient and grain.
  const stackedToolbarFor = (metal: boolean) => toolbarHasRowItems && metal && hasToolbar && resolvedStyle === "unified" && labelledToolbar;
  // The application menu belongs to the title row, as the window's own controls do; a toolbar with a row of its own leaves it there.
  const toolbarOwnRow = hasToolbar && (separateToolbar || stackedToolbarFor(material === "metal"));
  const applicationMenuSlot = toolbarOwnRow
    ? <div ref={setApplicationMenu} data-window-application-menu-slot="" data-window-no-drag="" className="nse-window-titlebar-view__application-menu" /> : null;
  const toolbarSlot = <div ref={setToolbar} data-window-toolbar-slot="" data-window-no-drag=""
    className="nse-window-titlebar-view__toolbar">{toolbar}</div>;
  const sidebarWidth = sidebar?.width ?? document.sidebarWidth;
  const metalRail = material === "metal" && sidebarWidth !== undefined;
  const headerStyle = { "--nse-window-titlebar-sidebar-width": sidebarWidth === undefined ? undefined : `${sidebarWidth}px`, ...nseWindowFrameStyle(document.frameViewClass), ...moveStyle, ...style, "--nse-titlebar-native-left": `${exclusion.left}px`, "--nse-titlebar-native-right": `${exclusion.right}px` } as CSSProperties;
  const titlebarHooks = {
    "data-nse-role": "titlebar",
    "data-nse-presentation": presentation,
    "data-nse-transparent": document.titlebarAppearsTransparent ? "true" : undefined,
    "data-nse-type": document.frameViewClass ? "custom" : undefined,
  } as const;
  if (material !== "standard") {
    const metal = material === "metal";
    const title = <>{titleAction ?? document.title}{document.subtitle ? <span data-nse-part="subtitle" className="nse-window-titlebar-subtitle">{document.subtitle}</span> : null}</>;
    const controlsSlot = controls ? <div ref={setStandardControls} className="nse-window-titlebar-view__controls" data-window-no-drag="" data-syncloudos-focus-chrome="">{controls}</div> : null;
    const leadingSlot = <div ref={setLeading} data-layout-attribute="leading" className="nse-window-titlebar-view__accessory" data-window-no-drag="">{leading}</div>;
    const trailingSlot = <div ref={setTrailing} data-layout-attribute="trailing" className="nse-window-titlebar-view__accessory" data-window-no-drag="">{trailing}</div>;
    const inlineToolbar = hasToolbar && !separateToolbar && !stackedToolbarFor(metal) ? toolbarSlot : null;
    const stackedToolbar = stackedToolbarFor(metal);
    const titleHidden = document.titleVisibility === "hidden";
    const bar = metal
      ? <header data-nse-control="window" data-nse-part="header" data-nse-chrome="metal" data-window-titlebar-bar=""
          className="nse-app-topbar nse-app-topbar-metal" data-variant="atmoMetal"
          data-has-rail={metalRail ? "true" : "false"} data-toolbar-row={stackedToolbar ? "true" : undefined}
          style={metalRail ? { "--nse-topbar-rail": `${sidebarWidth}px` } as CSSProperties : undefined}>
          {stackedToolbar ? <span data-nse-part="decoration" className="nse-app-topbar-metal-grain" aria-hidden="true" /> : null}
          {metalRail ? <div data-nse-part="sidebar" className="nse-app-topbar-metal-rail">
            <span data-nse-part="decoration" className="nse-app-topbar-metal-grain" aria-hidden="true" />
            <div data-nse-part="content" className="nse-app-topbar-metal-rail-content" data-window-no-drag="">{sidebar?.content}</div>
          </div> : null}
          <div data-nse-part="body" className="nse-app-topbar-metal-main" data-window-titlebar-row="">
            <span data-nse-part="decoration" className="nse-app-topbar-metal-grain" aria-hidden="true" />
            <div data-nse-part="leading" className="nse-app-topbar-metal-cluster nse-app-topbar-metal-leading">{controlsSlot}{leadingSlot}</div>
            <h1 id={titleId} data-nse-part="title" data-window-title="" data-document-edited={document.documentEdited ? "true" : undefined} className="nse-app-topbar-metal-title" hidden={titleHidden}>{title}</h1>
            <div data-nse-part="trailing" className="nse-app-topbar-metal-cluster nse-app-topbar-metal-trailing">{inlineToolbar}{trailingSlot}{applicationMenuSlot}</div>
          </div>
          {stackedToolbar ? <div data-nse-part="toolbar-row" className="nse-app-topbar-metal-toolbar-row" data-window-titlebar-toolbar-row="">{toolbarSlot}</div> : null}
        </header>
      : <header data-nse-control="window" data-nse-part="header" data-nse-chrome="standard" data-nse-material="cumulus" data-window-titlebar-bar=""
          className="nse-app-topbar" data-variant="atmoCumulus">
          {presentation === "floating" ? <div data-nse-part="floating-titlebar" className="nse-window-titlebar-view__floating-surface" aria-hidden="true" />
            : <div data-nse-part="background" className="nse-app-topbar-base" aria-hidden="true"><span data-nse-part="bezel" className="nse-app-topbar-base-glass" /></div>}
          <div data-nse-part="content" className="nse-app-topbar-content" data-window-titlebar-row="">
            <div data-nse-part="leading" className="nse-app-topbar-slot nse-app-topbar-slot-left">{controlsSlot}{leadingSlot}</div>
            <h1 id={titleId} data-nse-part="title" data-window-title="" data-document-edited={document.documentEdited ? "true" : undefined} className="nse-app-topbar-title" hidden={titleHidden}>{title}</h1>
            <div data-nse-part="trailing" className="nse-app-topbar-slot nse-app-topbar-slot-right">{inlineToolbar}{trailingSlot}{applicationMenuSlot}</div>
          </div>
        </header>;
    return <div {...handleProps} {...titlebarHooks} ref={header as unknown as RefObject<HTMLDivElement>} data-nse-part="surface"
      className={["nse-window-titlebar-view", moveClassName, className].filter(Boolean).join(" ")}
      style={headerStyle} data-nse-toolbar-style={toolbarStyle}
      data-toolbar-style={toolbarStyle} data-titlebar-layout={resolvedStyle} data-titlebar-material={material}
      data-titlebar-presentation={presentation} data-window-frame-view={document.frameViewClass ? "" : undefined}
      data-titlebar-transparent={document.titlebarAppearsTransparent ? "true" : undefined} data-has-toolbar={hasToolbar ? "true" : "false"}
      data-window-titlebar="" data-window-active={isKeyWindow ? "true" : "false"} data-nse-key-window={isKeyWindow ? undefined : "false"}
      onPointerDown={event => { if (!interactiveTarget(event.target, event.currentTarget)) onPointerDown?.(event); }}
      onDoubleClick={event => { if (!interactiveTarget(event.target, event.currentTarget)) onDoubleClick?.(event); }}>
      <div ref={setMenu} data-nse-part="menu" data-window-menu-slot="" className="nse-window-titlebar-view__menu" data-window-no-drag="">{menuBar}</div>
      <WindowTitlebarMaterialContext.Provider value={material}>{bar}</WindowTitlebarMaterialContext.Provider>
      {hasToolbar && separateToolbar && !stackedToolbar ? <div className="nse-window-titlebar-view__toolbar-row" data-window-titlebar-toolbar-row="">
        <WindowTitlebarMaterialContext.Provider value={material}>{toolbarSlot}</WindowTitlebarMaterialContext.Provider></div> : null}
      <div ref={setBottom} data-nse-part="titlebar-accessories" className="nse-window-titlebar-view__bottom" data-window-no-drag="">{bottomAccessories}</div>
    </div>;
  }
  return <header {...handleProps} {...titlebarHooks} ref={header}
    className={["nse-window-titlebar-view", `nse-window__titlebar nse-window__titlebar--${variant}`, variant === "hud" ? "nse-window__hud-titlebar" : "", moveClassName, className].filter(Boolean).join(" ")}
    style={headerStyle} data-nse-control={ownedByWindow ? undefined : "window"} data-nse-part="header" data-nse-style={variant}
    data-nse-chrome="standard" data-nse-toolbar-style={toolbarStyle}
    data-toolbar-style={toolbarStyle} data-titlebar-layout={resolvedStyle} data-titlebar-material={material}
    data-titlebar-presentation={presentation} data-window-frame-view={document.frameViewClass ? "" : undefined}
    data-titlebar-transparent={document.titlebarAppearsTransparent ? "true" : undefined} data-has-toolbar={hasToolbar ? "true" : "false"}
    data-window-titlebar="" data-window-hud-titlebar={variant === "hud" ? "" : undefined} data-window-panel-titlebar={variant === "panel" ? "" : undefined}
    data-window-active={isKeyWindow ? "true" : "false"} data-nse-key-window={isKeyWindow ? undefined : "false"}
    onPointerDown={event => { if (!interactiveTarget(event.target, event.currentTarget)) onPointerDown?.(event); }}
    onDoubleClick={event => { if (!interactiveTarget(event.target, event.currentTarget)) onDoubleClick?.(event); }}>
    <div ref={setMenu} data-nse-part="menu" data-window-menu-slot="" className="nse-window-titlebar-view__menu" data-window-no-drag="">{menuBar}</div>
    <div data-nse-part="content" className="nse-window-titlebar-view__row" data-window-titlebar-row="">
      {sidebarWidth !== undefined && hasToolbar ? <span aria-hidden="true" data-window-sidebar-tracking-separator="" data-nse-part="separator" /> : null}
      {controls ? <div ref={setStandardControls} className="nse-window-titlebar-view__controls" data-window-no-drag="" data-syncloudos-focus-chrome="">{controls}</div> : null}
      {sidebar ? <div className="nse-window-titlebar-view__sidebar" data-window-no-drag="" style={{ width: sidebar.width }}>{sidebar.content}</div> : null}
      <div ref={setLeading} data-nse-part="leading" data-layout-attribute="leading" className="nse-window-titlebar-view__accessory" data-window-no-drag="">{leading}</div>
      <h2 id={titleId} data-nse-part="title" data-document-edited={document.documentEdited ? "true" : undefined} data-window-title="" className={variant === "hud" ? "nse-window-titlebar-view__title nse-window__hud-title" : "nse-window-titlebar-view__title"} hidden={document.titleVisibility === "hidden"}>
        {titleAction ?? document.title}
        {document.subtitle ? <span data-nse-part="subtitle" className="nse-window-titlebar-subtitle">{document.subtitle}</span> : null}
      </h2>
      {hasToolbar && !separateToolbar ? toolbarSlot : null}
      <div ref={setTrailing} data-nse-part="trailing" data-layout-attribute="trailing" className="nse-window-titlebar-view__accessory" data-window-no-drag="">{trailing}</div>
      {applicationMenuSlot}
    </div>
    {hasToolbar && separateToolbar ? <div className="nse-window-titlebar-view__toolbar-row" data-window-titlebar-toolbar-row="">{toolbarSlot}</div> : null}
    <div ref={setBottom} data-nse-part="titlebar-accessories" className="nse-window-titlebar-view__bottom" data-window-no-drag="">{bottomAccessories}</div>
  </header>;
}
