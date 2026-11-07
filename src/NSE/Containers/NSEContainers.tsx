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

import {
  createElement,
  useCallback,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode
} from "react";
import "../Navigation/SourceList/nse-sourcelist.css";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceRequest,
  type NSESmoothSurfaceStyle
} from "../SmoothSurface";

type NSEContainerElement = "div" | "section" | "aside" | "main" | "nav" | "article" | "ul" | "ol";

export type NSEDrawerPlacement = "leading" | "trailing" | "top" | "bottom";
export type ContainerPaneVariant = "plain" | "surface" | "sidebar" | "inspector" | "floating";
interface NSEDisclosureOptions {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * How a container's body lays out its children: `stack` (the default) is the
 * SDK's leading-aligned content stack at standard spacing; `flow` is plain
 * block flow for fully custom layout (nse-layout-defaults.css).
 */
export type NSEContainerContentLayout = "stack" | "flow";

export interface ContainerPaneProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: NSEContainerElement;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: ContainerPaneVariant;
  smoothSurface?: NSESmoothSurfaceRequest;
  contentLayout?: NSEContainerContentLayout;
}

export interface NSEDrawerProps extends Omit<HTMLAttributes<HTMLElement>, "title">, NSEDisclosureOptions {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  placement?: NSEDrawerPlacement;
  modal?: boolean;
  keepMounted?: boolean;
  closeLabel?: string;
  smoothSurface?: NSESmoothSurfaceRequest;
  contentLayout?: NSEContainerContentLayout;
}

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function useDisclosureState({ open, defaultOpen = false, onOpenChange }: NSEDisclosureOptions) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = useCallback((nextOpen: boolean | ((open: boolean) => boolean)) => {
    const resolvedOpen = typeof nextOpen === "function" ? nextOpen(isOpen) : nextOpen;
    if (!isControlled) setInternalOpen(resolvedOpen);
    onOpenChange?.(resolvedOpen);
  }, [isControlled, isOpen, onOpenChange]);

  return [isOpen, setOpen] as const;
}

export function ContainerPane({
  as = "section",
  title,
  subtitle,
  actions,
  footer,
  variant = "surface",
  smoothSurface = false,
  contentLayout = "stack",
  className = "",
  style,
  children,
  ...props
}: ContainerPaneProps) {
  const titleId = useId();
  const labelledBy = props["aria-labelledby"] ?? (title ? titleId : undefined);
  const surfaceProps = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    classes("nse-container-pane", className),
    style as NSESmoothSurfaceStyle | undefined
  );

  return createElement(
    as,
    {
      ...props,
      className: surfaceProps.className,
      "data-variant": variant,
      "aria-labelledby": labelledBy,
      style: surfaceProps.style
    },
    <>
      {title || subtitle || actions ? (
        <header className="nse-container-pane-header">
          <span className="nse-container-pane-copy">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {subtitle ? <span className="nse-container-pane-subtitle">{subtitle}</span> : null}
          </span>
          {actions ? <span className="nse-container-pane-actions">{actions}</span> : null}
        </header>
      ) : null}
      <div className="nse-container-pane-body" data-nse-content-layout={contentLayout === "stack" ? "stack" : undefined}>{children}</div>
      {footer ? <footer className="nse-container-pane-footer">{footer}</footer> : null}
    </>
  );
}

export function NSEDrawer({
  title,
  subtitle,
  actions,
  footer,
  placement = "trailing",
  modal = false,
  keepMounted = true,
  closeLabel = "Close drawer",
  smoothSurface = false,
  contentLayout,
  open,
  defaultOpen,
  onOpenChange,
  className = "",
  style,
  children,
  ...props
}: NSEDrawerProps) {
  const [isOpen, setOpen] = useDisclosureState({ open, defaultOpen, onOpenChange });
  if (!keepMounted && !isOpen) return null;

  return (
    <aside
      {...props}
      className={classes("nse-container-drawer", className)}
      data-placement={placement}
      data-open={isOpen ? "true" : "false"}
      data-modal={modal ? "true" : "false"}
      aria-hidden={!isOpen || undefined}
      hidden={!isOpen}
    >
      <ContainerPane
        title={title}
        subtitle={subtitle}
        actions={(
          <>
            {actions}
            <NSEButton appearance="aqua" title={closeLabel} className="nse-container-drawer-close" onClick={() => setOpen(false)} />
          </>
        )}
        footer={footer}
        variant={modal ? "floating" : "surface"}
        smoothSurface={smoothSurface}
        contentLayout={contentLayout}
        style={style}
      >
        {children}
      </ContainerPane>
    </aside>
  );
}
