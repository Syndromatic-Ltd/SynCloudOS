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

import type { HTMLAttributes, ReactNode } from "react";

/** A neutral, CPStackView-compatible main-axis distribution. */
export type NSEStackDistribution =
  | "fill"
  | "fill-equally"
  | "fill-proportionally"
  | "equal-spacing"
  | "equal-centring"
  | "gravity-areas";

export type NSEStackAlignment =
  | "fill"
  | "leading"
  | "centre"
  | "trailing"
  | "first-baseline"
  | "last-baseline";

export type NSEStackOrientation = "horizontal" | "vertical";
export type NSEStackGravity = "leading" | "centre" | "trailing";
export type NSEStackOverflowPolicy = "menu" | "preserve";

export interface NSEStackEdgeInsets {
  readonly inlineStart?: number;
  readonly inlineEnd?: number;
  readonly blockStart?: number;
  readonly blockEnd?: number;
}

/**
 * Declarative geometry only. It contains neither DOM nodes nor appearance
 * choices, allowing the layout resolver to remain deterministic and pure.
 */
export interface NSEStackItemLayout {
  readonly id: string;
  readonly minimumSize?: number;
  readonly preferredSize?: number;
  readonly maximumSize?: number;
  readonly weight?: number;
  readonly visibilityPriority?: number;
  readonly detachedWhenHidden?: boolean;
  readonly gravity?: NSEStackGravity;
  readonly spacingAfter?: number;
  readonly hidden?: boolean;
}

export interface NSEStackLayoutInput {
  readonly orientation: NSEStackOrientation;
  readonly distribution: NSEStackDistribution;
  readonly alignment?: NSEStackAlignment;
  readonly availableSize: number;
  readonly spacing?: number;
  readonly edgeInsets?: NSEStackEdgeInsets;
  readonly direction?: "ltr" | "rtl";
  readonly overflowPolicy?: NSEStackOverflowPolicy;
  readonly items: readonly NSEStackItemLayout[];
}

export interface NSEStackResolvedItem {
  readonly id: string;
  readonly sourceIndex: number;
  readonly position: number;
  readonly size: number;
  readonly hidden: boolean;
  readonly detached: boolean;
  readonly gravity: NSEStackGravity;
}

export interface NSEStackLayoutResult {
  readonly orientation: NSEStackOrientation;
  readonly distribution: NSEStackDistribution;
  readonly alignment: NSEStackAlignment;
  readonly direction: "ltr" | "rtl";
  readonly availableSize: number;
  readonly contentAvailableSize: number;
  readonly requiredSize: number;
  readonly overflowed: boolean;
  /** Main-axis space reserved for the overflow control when hidden entries
   * exist. It is part of the same finite layout budget as visible items. */
  readonly overflowTriggerSize: number;
  readonly overflowTriggerSpacing: number;
  readonly overflowTriggerPosition: number | null;
  readonly visibleIds: readonly string[];
  readonly overflowIds: readonly string[];
  readonly items: readonly NSEStackResolvedItem[];
}

export interface NSEStackObserver {
  observe(target: Element): void;
  disconnect(): void;
}

/**
 * Host/runtime-injected layout observation. NSE does not acquire a browser
 * observer authority itself.
 */
export type NSEStackObserverFactory = (listener: () => void) => NSEStackObserver | null;

export interface NSEStackFrameScheduler {
  requestFrame(callback: () => void): unknown;
  cancelFrame(handle: unknown): void;
}

export interface NSEStackItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "id" | "hidden">, NSEStackItemLayout {
  readonly children?: ReactNode;
  /** Accessible label used when this item moves into the overflow menu. */
  readonly overflowLabel?: string;
  /** Explicit command/action bridge for an overflow presentation. */
  readonly onOverflowActivate?: () => void;
}

export interface NSEStackViewProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly children?: ReactNode;
  readonly orientation?: NSEStackOrientation;
  readonly distribution?: NSEStackDistribution;
  readonly alignment?: NSEStackAlignment;
  readonly spacing?: number;
  readonly edgeInsets?: NSEStackEdgeInsets;
  /** Use this when geometry is already owned by the surrounding layout authority. */
  readonly availableSize?: number;
  readonly overflowPolicy?: NSEStackOverflowPolicy;
  readonly overflowLabel?: string;
  readonly resizeObserverFactory?: NSEStackObserverFactory;
  readonly frameScheduler?: NSEStackFrameScheduler;
  readonly reducedMotion?: boolean;
  onOverflowChange?(overflowIds: readonly string[]): void;
}
