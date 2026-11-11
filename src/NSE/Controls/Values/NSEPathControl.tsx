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

import { forwardRef, useImperativeHandle, useMemo, useRef, type HTMLAttributes } from "react";
import { NSEImageView } from "../Images/NSEImage";
import { NSEWorkspace } from "../../Application/NSEWorkspace";
import { NSEButton } from "../Buttons/NSEButton";
import type { NSEControlActionProps } from "../Core/controlTypes";

/** NSPathControlItem: a titled, optionally illustrated component of a path. */
export class NSEPathControlItem {
  readonly title: string;
  readonly image: string | null;
  readonly url: string | URL | null;
  constructor({ title, image = null, url = null }: { title: string; image?: string | null; url?: string | URL | null }) {
    this.title = title; this.image = image; this.url = url;
  }
}

/** NSPathControl's sender state, available synchronously during an action. */
export interface NSEPathControlHandle {
  readonly url: string | URL | null;
  readonly pathItems: readonly NSEPathControlItem[];
  readonly clickedPathItem: NSEPathControlItem | null;
}
export interface NSEPathControlProps extends Omit<HTMLAttributes<HTMLElement>, "onClick">, NSEControlActionProps<NSEPathControlItem> {
  readonly url?: string | URL | null;
  readonly pathItems?: readonly NSEPathControlItem[];
  readonly pathStyle?: "standard";
  readonly isEnabled?: boolean;
  onAction?(sender: NSEPathControlHandle): void;
}

function itemsForURL(value: string | URL | null): readonly NSEPathControlItem[] {
  if (!value) return [];
  const url = new URL(String(value));
  const parts = url.pathname.split("/").filter(Boolean);
  const root = new NSEPathControlItem({ title: url.host || "/", url: `${url.protocol}//${url.host}/`, image: NSEWorkspace.shared.icon("public.folder", 24) });
  return [root, ...parts.map((part, index) => new NSEPathControlItem({ title: decodeURIComponent(part),
    url: `${url.protocol}//${url.host}/${parts.slice(0, index + 1).join("/")}`,
    image: NSEWorkspace.shared.icon("public.folder", 24),
  }))];
}

/** NSPathControl's standard path: semantic components; Atmo supplies the joined path bezel. */
export const NSEPathControl = forwardRef<NSEPathControlHandle, NSEPathControlProps>(function NSEPathControl(
  { url, pathItems, pathStyle = "standard", isEnabled = true, onAction, action, actionPayload, className, ...props }, ref,
) {
  const items = useMemo(() => pathItems ?? itemsForURL(url ?? null), [pathItems, url]);
  const clicked = useRef<NSEPathControlItem | null>(null);
  const sender = useMemo<NSEPathControlHandle>(() => ({ url: url ?? items.at(-1)?.url ?? null, pathItems: items, get clickedPathItem() { return clicked.current; } }), [items, url]);
  useImperativeHandle(ref, () => sender, [sender]);
  return <nav {...props} aria-label={props["aria-label"] ?? "Path"} className={["nse-path-control", className].filter(Boolean).join(" ")} data-nse-control="path-control" data-nse-part="background" data-nse-style={pathStyle} data-nse-enabled={isEnabled ? undefined : "false"} data-path-style={pathStyle}>
    {items.map((item, index) => <NSEButton key={`${String(item.url)}:${index}`} title={<>{item.image ? <NSEImageView src={item.image} controls={false} wheelZoom={false} pannable={false} alt="" /> : null}<span data-nse-part="label">{item.title}</span></>}
      className="nse-path-item" data-nse-part="path-item" aria-label={item.title} aria-current={index === items.length - 1 ? "location" : undefined} data-nse-role={index === items.length - 1 ? "current" : undefined} isEnabled={isEnabled}
      action={action} actionPayload={actionPayload ?? item} onClick={() => { clicked.current = item; onAction?.(sender); }} />)}
  </nav>;
});
