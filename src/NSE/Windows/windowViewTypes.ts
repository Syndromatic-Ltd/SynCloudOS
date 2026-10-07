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

import type React from "react";
import type { WindowPresentation, WindowRecord } from "../../SynCloudOS/SynCloudOS";

export type WindowResizeEdge =
  | "block-start"
  | "block-end"
  | "inline-start"
  | "inline-end"
  | "block-start-inline-start"
  | "block-start-inline-end"
  | "block-end-inline-start"
  | "block-end-inline-end";

export interface NSEWindowViewProps {
  readonly record: WindowRecord;
  readonly presentation: WindowPresentation;
  readonly zoomed?: boolean;
  readonly blocked: boolean;
  readonly dirty: boolean;
  readonly dispatchCommand: (
    commandId: string,
    payload: { readonly windowControllerId: string },
  ) => Promise<unknown>;
  readonly moveHandleProps?: React.HTMLAttributes<HTMLElement>;
  readonly resizeHandleProps?: Readonly<Partial<Record<WindowResizeEdge, React.HTMLAttributes<HTMLElement>>>>;
  /** True when the owning app's custom chrome is mounted; suppresses system chrome paint. */
  readonly customChromeActive?: boolean;
  /** Ref callback receiving the view-rendered custom-titlebar slot node. */
  readonly customTitleBarSlotRef?: (node: HTMLDivElement | null) => void;
  readonly children: React.ReactNode;
}

export type NSEWindowHost = React.ComponentType<NSEWindowViewProps>;
