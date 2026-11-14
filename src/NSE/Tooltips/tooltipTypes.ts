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

import type { HTMLAttributes, PointerEventHandler, ReactNode } from "react";
import type { NSELogicalPlacement } from "../Overlays";

export type TooltipContent = ReactNode;

export interface TooltipOptions {
  readonly content: TooltipContent;
  readonly placement?: NSELogicalPlacement;
  readonly delayMs?: number;
  /** Do not duplicate a description that is already persistently visible. */
  readonly disabled?: boolean;
  readonly longPressOnCoarsePointer?: boolean;
}

export interface TooltipBinding {
  readonly dismiss?: () => void;
  readonly anchorProps: HTMLAttributes<HTMLElement>;
  readonly tooltip: ReactNode;
}

export interface TooltipProps {
  readonly id: string;
  readonly content: TooltipContent;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly placement?: NSELogicalPlacement;
  onOpenChange?(open: boolean): void;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
}

export interface TooltipScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
