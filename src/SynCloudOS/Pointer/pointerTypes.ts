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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type RuntimeSystemCursor =
  | "default" | "pointer" | "text" | "vertical-text" | "crosshair"
  | "move" | "copy" | "alias" | "grab" | "grabbing"
  | "resize-column" | "resize-row" | "not-allowed" | "hidden";

export type RuntimeCursorDescriptor =
  | Readonly<{ readonly kind: RuntimeSystemCursor }>
  | Readonly<{
      readonly kind: "image";
      readonly resourceId: string;
      readonly hotspot: Readonly<{ readonly x: number; readonly y: number }>;
      readonly fallback: RuntimeSystemCursor;
    }>;

export type RuntimeResolvedCursor =
  | Readonly<{ readonly kind: RuntimeSystemCursor }>
  | Readonly<{
      readonly kind: "image";
      readonly resourceId: string;
      readonly handle: object;
      readonly hotspot: Readonly<{ readonly x: number; readonly y: number }>;
      readonly fallback: RuntimeSystemCursor;
    }>;

export type RuntimeTrackingOption =
  | "entered-and-exited"
  | "moved"
  | "active-always"
  | "assume-inside"
  | "visible-rect";

export type RuntimeTrackingEventType = "entered" | "moved" | "exited";
export type RuntimeTrackingInput = "pointer" | "keyboard";
/** The browser's concrete pointer family, retained separately from modality. */
export type RuntimePointerType = "mouse" | "pen" | "touch";

export interface RuntimeTrackingEvent {
  readonly type: RuntimeTrackingEventType;
  readonly input: RuntimeTrackingInput;
  /** Present only for pointer-routed events whose host reported a known type. */
  readonly pointerType?: RuntimePointerType;
  readonly regionId: string;
  readonly ownerId: string;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly reason?: string;
}

export type RuntimePointerAdapterEvent =
  | Readonly<{
      readonly kind: "update";
      readonly input: RuntimeTrackingInput;
      /** Present only when input is `pointer` and the host supplied a known type. */
      readonly pointerType?: RuntimePointerType;
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
      /** Exact containing region identities, deepest first. */
      readonly regionPath: readonly string[];
    }>
  | Readonly<{
      readonly kind: "cancel";
      readonly input: RuntimeTrackingInput;
      /** Preserves the concrete pointer family for cancellation diagnostics. */
      readonly pointerType?: RuntimePointerType;
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
      readonly regionPath: readonly [];
      readonly reason: "pointercancel" | "lostpointercapture" | "focus-lost" | "root-unbound";
    }>
  | Readonly<{
      readonly kind: "visibility";
      readonly regionId: string;
      readonly visible: boolean;
    }>;

export interface RuntimeCursorImageLease {
  readonly handle: object;
  readonly resourceId: string;
  readonly byteLength: number;
  readonly intrinsicWidth: number;
  readonly intrinsicHeight: number;
  readonly devicePixelRatio: number;
  release(): void;
}

/** Browser details stay behind this injected port. Roots and elements are
 * opaque object identities to the runtime and NSE presentation layer. */
export interface RuntimePointerAdapter {
  bindRoot(root: object, listener: (event: RuntimePointerAdapterEvent) => void): () => void;
  bindRegion(root: object, element: object, regionId: string): () => void;
  /** Returns the same exact identities in canonical ancestor-first order. */
  orderRegionIds(root: object, regionIds: readonly string[]): readonly string[];
  applyCursor(root: object, cursor: RuntimeResolvedCursor | null): void;
  resolveCursorImage(resourceId: string, signal: AbortSignal): Promise<RuntimeCursorImageLease>;
}

export interface RuntimeCursorToken {
  readonly id: string;
  readonly disposed: boolean;
  dispose(): void;
}

export interface RuntimeCursorStack {
  readonly current: RuntimeCursorDescriptor | null;
  currentFor(root: object): RuntimeCursorDescriptor | null;
  push(input: {
    readonly ownerId: string;
    readonly windowControllerId?: string;
    readonly root: object;
    readonly pointerId: number;
    readonly cursor: RuntimeCursorDescriptor;
  }): RuntimeCursorToken;
  disposeOwner(ownerId: string): void;
}

export interface RuntimeTrackingRegionRegistration {
  readonly id: string;
  readonly disposed: boolean;
  dispose(reason?: string): void;
}

export interface TrackingRegionManager {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly cursors: RuntimeCursorStack;
  register(input: {
    readonly ownerId: string;
    readonly windowControllerId?: string;
    readonly root: object;
    readonly element: object;
    readonly options: readonly RuntimeTrackingOption[];
    readonly cursor?: RuntimeCursorDescriptor;
    readonly onEvent?: (event: RuntimeTrackingEvent) => void;
  }): RuntimeTrackingRegionRegistration;
  disposeOwner(ownerId: string, reason?: string): void;
  disposeWindowController(windowControllerId: string, reason?: string): void;
  diagnostics(): Readonly<{
    readonly rootCount: number;
    readonly regionCount: number;
    readonly activePointerCount: number;
    readonly cursorEntryCount: number;
  }>;
  dispose(): void;
}

export interface CreateTrackingRegionManagerOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly randomUUID: () => string;
  readonly adapter?: RuntimePointerAdapter | null;
}
