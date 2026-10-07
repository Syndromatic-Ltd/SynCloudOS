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

import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { NSEOpenPanel, type NSEFilePanelService } from "./NSEOpenPanel";
import type { NSEFilePanelWindowBridge } from "./NSEFilePanelView";
import type { OpenPanelRequest } from "../../SynCloudOS/SynCloudOS";
import { classes } from "../Controls/Core/nseControlsShared";

export interface NSEFilePickerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: ReactNode;
  meta?: ReactNode;
  /**
   * Opt-in action-sheet binding. Existing visual specimens remain plain buttons until
   * their owner supplies the service, window bridge, and responder scope.
   */
  openPanel?: NSEFilePickerPanelBinding;
}

export interface NSEFilePickerPanelBinding {
  readonly id: string;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
  readonly parentWindowControllerId: string;
  readonly compact?: boolean;
  readonly service: NSEFilePanelService;
  readonly windowBridge: NSEFilePanelWindowBridge;
  readonly request: OpenPanelRequest;
  onResult?: (result: Awaited<ReturnType<NSEFilePanelService["open"]>>) => void;
}

const NSEFilePickerButtonVisual = forwardRef<HTMLButtonElement, Omit<NSEFilePickerButtonProps, "openPanel">>(function NSEFilePickerButtonVisual({
  label,
  meta,
  className = "",
  children,
  type = "button",
  ...props
}, ref) {
  return (
    <button ref={ref} className={classes("nse-control-file-picker-button", className)} type={type} {...props}>
      <span className="nse-control-file-picker-copy">
        <span className="nse-control-file-picker-label">{children ?? label}</span>
        {meta ? <span className="nse-control-file-picker-meta">{meta}</span> : null}
      </span>
    </button>
  );
});

export function NSEFilePickerButton({
  label,
  meta,
  className = "",
  children,
  type = "button",
  openPanel,
  ...props
}: NSEFilePickerButtonProps) {
  if (openPanel) {
    return <NSEFilePickerButtonWithPanel
      label={label}
      meta={meta}
      className={className}
      type={type}
      openPanel={openPanel}
      {...props}
    >
      {children}
    </NSEFilePickerButtonWithPanel>;
  }
  return (
    <NSEFilePickerButtonVisual label={label} meta={meta} className={className} type={type} {...props}>{children}</NSEFilePickerButtonVisual>
  );
}

function NSEFilePickerButtonWithPanel({
  openPanel,
  onClick,
  ...props
}: Omit<NSEFilePickerButtonProps, "openPanel"> & { readonly openPanel: NSEFilePickerPanelBinding }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <NSEFilePickerButtonVisual
        {...props}
        ref={anchorRef}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) setOpen(true);
        }}
      />
      <NSEOpenPanel
        id={openPanel.id}
        open={open}
        anchor={anchorRef.current}
        parentResponderId={openPanel.parentResponderId}
        parentScopeId={openPanel.parentScopeId}
        parentWindowControllerId={openPanel.parentWindowControllerId}
        compact={openPanel.compact}
        service={openPanel.service}
        windowBridge={openPanel.windowBridge}
        request={openPanel.request}
        onResult={openPanel.onResult}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
      />
    </>
  );
}
