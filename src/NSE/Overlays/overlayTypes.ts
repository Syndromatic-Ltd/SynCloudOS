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

export type NSEOverlayId = string;

export type NSEOverlayKind =
  | "menu"
  | "submenu"
  | "context-menu"
  | "listbox"
  | "popover"
  | "tooltip"
  | "action-sheet";

export type NSELogicalPlacement =
  | "block-start"
  | "block-end"
  | "inline-start"
  | "inline-end"
  | "block-start-inline-start"
  | "block-start-inline-end"
  | "block-end-inline-start"
  | "block-end-inline-end";

export type NSEOverlayDismissReason =
  | "escape"
  | "outside-pointer"
  | "focus-left"
  | "anchor-removed"
  | "selection"
  | "parent-dismissed"
  | "programmatic";

export interface NSEOverlayRegistration {
  readonly id: NSEOverlayId;
  readonly kind: NSEOverlayKind;
  readonly parentId: NSEOverlayId | null;
  readonly anchor: HTMLElement | null;
  readonly surface: HTMLElement;
  readonly dismissOn: ReadonlySet<NSEOverlayDismissReason>;
  readonly restoreFocus: boolean;
  onDismiss(reason: NSEOverlayDismissReason): void;
}

export interface NSEOverlaySnapshot {
  readonly orderedIds: readonly NSEOverlayId[];
  readonly topmostId: NSEOverlayId | null;
  readonly parentById: ReadonlyMap<NSEOverlayId, NSEOverlayId | null>;
}

export interface NSEOverlayManager {
  readonly getSnapshot: () => NSEOverlaySnapshot;
  getRegistration(id: NSEOverlayId): NSEOverlayRegistration | null;
  subscribe(listener: () => void): () => void;
  register(registration: NSEOverlayRegistration): () => void;
  update(registration: NSEOverlayRegistration): void;
  dismiss(id: NSEOverlayId, reason: NSEOverlayDismissReason): boolean;
  dismissBranch(id: NSEOverlayId, reason: NSEOverlayDismissReason): readonly NSEOverlayId[];
  dispose(): void;
}

export interface NSEOverlayFocusScopeOptions {
  readonly scopeId: string;
  readonly kind: "menu" | "popover" | "sheet";
  readonly parentScopeId?: string;
  readonly parentResponderId: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  readonly asChild?: boolean;
}

export interface NSEOverlayRuntimePort {
  readonly runtimeId: string;
  readonly signal: AbortSignal;
  readonly environment: {
    readonly browser: {
      getDocument(): Document | null;
      getWindow(): Window | null;
    };
    readonly workArea: {
      getSnapshot(): {
        readonly width: number;
        readonly height: number;
        readonly safeArea: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
      };
      subscribe(listener: () => void): () => void;
    };
    readonly visualViewport: {
      getSnapshot(): { readonly width: number; readonly height: number; readonly offsetLeft: number; readonly offsetTop: number } | null;
      subscribe(listener: () => void): () => void;
    };
    /** Runtime-owned content traits: overlays never infer device mode from ambient globals. */
    readonly presentation: {
      getSnapshot(): import("../../SynCloudOS/SynCloudOS").SynCloudOSPresentationTraits;
      subscribe(listener: () => void): () => void;
    };
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
  };
  restoreFocus(responderId: string, anchor: HTMLElement | null): void;
  /** Host-private finite-work observation. NSE supplies the real receipt; the
   * host decides whether its testing/settlement surface observes it. */
  observeFiniteWork?(
    receipt: Promise<void>,
    input: Readonly<{ kind: "focus-restore"; label: string }>,
  ): void;
  reportPlacementFailure(input: { readonly overlayId: NSEOverlayId; readonly overlayKind: NSEOverlayKind }): void;
  wrapFocusScope(options: NSEOverlayFocusScopeOptions, children: ReactNode): ReactNode;
}
import type { ReactNode } from "react";
