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

export interface UndoOwner {
  readonly kind: "document" | "window" | "application" | "modal";
  readonly id: string;
}

export interface UndoRestorationSnapshot {
  readonly responderId?: string;
  readonly selection?: unknown;
  readonly viewport?: { readonly x: number; readonly y: number };
}

export interface UndoRestoration {
  readonly before?: UndoRestorationSnapshot;
  readonly after?: UndoRestorationSnapshot;
  restore(snapshot: UndoRestorationSnapshot): void | Promise<void>;
}

export interface UndoActionBase {
  readonly name: string;
  readonly restoration?: UndoRestoration;
  readonly estimatedBytes?: number;
  cleanup?(): void;
}

declare const checkedUndoActionBrand: unique symbol;

export interface SyncUndoAction extends UndoActionBase {
  readonly asyncPolicy: "forbid";
  readonly [checkedUndoActionBrand]: "sync";
  undo(): void;
  redo(): void;
}

export interface AwaitUndoAction extends UndoActionBase {
  readonly asyncPolicy: "await";
  readonly [checkedUndoActionBrand]: "await";
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
}

export type UndoAction = SyncUndoAction | AwaitUndoAction;

type StrictVoidCallback<F extends () => unknown> = ReturnType<F> extends void ? F : never;

export function defineSyncUndoAction<U extends () => unknown, R extends () => unknown>(
  action: UndoActionBase & {
    readonly asyncPolicy: "forbid";
    readonly undo: U & StrictVoidCallback<U>;
    readonly redo: R & StrictVoidCallback<R>;
  },
): SyncUndoAction {
  return action as unknown as SyncUndoAction;
}

export function defineAwaitUndoAction(
  action: UndoActionBase & {
    readonly asyncPolicy: "await";
    readonly undo: () => void | Promise<void>;
    readonly redo: () => void | Promise<void>;
  },
): AwaitUndoAction {
  return action as unknown as AwaitUndoAction;
}

export interface UndoCommandTarget {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly owner: UndoOwner;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoTitle: string;
  readonly redoTitle: string;
}

export interface AutomaticUndoGroup { readonly kind: "typing" | "drag" | "stepper"; readonly key: string; readonly boundaryId: string }
export interface UndoGroupOptions { readonly restoration?: UndoRestoration }
export interface UndoGroup { readonly id: string; readonly name: string; readonly actionCount: number; readonly estimatedBytes: number }
export interface UndoReservation {
  commit(action: UndoAction, options?: { readonly automaticGroup?: AutomaticUndoGroup }): string;
  cancel(): void;
}
/** A kernel-issued history segment. Revocation removes its entries without
 * exposing manager-wide clear/dispose controls to a mounted owner. */
export interface UndoRegistrationLease {
  readonly isLive: boolean;
  /** A lease-scoped view of the shared owner history. It exposes only an
   * entry when that lease owns the current global undo/redo frontier. */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoTitle: string;
  readonly redoTitle: string;
  readonly isExecuting: boolean;
  register(action: UndoAction, options?: { readonly automaticGroup?: AutomaticUndoGroup }): string;
  reserve(): UndoReservation;
  undo(): Promise<UndoResult>;
  redo(): Promise<UndoResult>;
  subscribe(listener: () => void): () => void;
  revoke(): void;
}
export type UndoResult =
  | { readonly status: "completed"; readonly direction: "undo" | "redo"; readonly actionName: string }
  | { readonly status: "empty" | "busy"; readonly direction: "undo" | "redo" }
  | { readonly status: "cancelled"; readonly direction: "undo" | "redo"; readonly actionName: string; readonly reason: string }
  | { readonly status: "failed"; readonly direction: "undo" | "redo"; readonly actionName: string; readonly code: string; readonly error: Error };
export interface UndoManagerOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly owner: UndoOwner;
  readonly maxEntries: number;
  readonly maxEstimatedBytes?: number;
  readonly randomUUID?: () => string;
  /** Observers are diagnostic only. Their failures must never own an undo transaction. */
  readonly observeListenerError?: (error: unknown) => void;
}
export interface UndoManagerCreateOptions { readonly maxEntries?: number; readonly maxEstimatedBytes?: number }
export interface UndoManagerInspection {
  readonly owner: UndoOwner; readonly canUndo: boolean; readonly canRedo: boolean; readonly undoTitle: string; readonly redoTitle: string;
  readonly isExecuting: boolean; readonly isDirty: boolean; readonly groupDepth: number; readonly cursor: number;
  readonly entries: readonly { readonly id: string; readonly name: string; readonly actionCount: number; readonly estimatedBytes: number; readonly poisoned?: boolean }[];
  readonly lastFailure: { readonly code: string; readonly message: string } | null;
}
export interface UndoManager extends UndoCommandTarget {
  readonly isExecuting: boolean;
  readonly isDirty: boolean;
  assertCanRegister(): void;
  register(action: UndoAction, options?: { readonly automaticGroup?: AutomaticUndoGroup }): string;
  reserve(): UndoReservation;
  createRegistrationLease(): UndoRegistrationLease;
  beginGroup(name: string, options?: UndoGroupOptions): void;
  endGroup(): UndoGroup | null;
  cancelGroup(): void;
  undo(): Promise<UndoResult>;
  redo(): Promise<UndoResult>;
  markClean(): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  inspect(): UndoManagerInspection;
  dispose(): void;
}
export interface UndoManagerRegistry {
  readonly runtimeId: SynCloudOSRuntimeId;
  create(owner: UndoOwner, options?: UndoManagerCreateOptions): UndoManager;
  get(owner: UndoOwner): UndoManager | null;
  remove(owner: UndoOwner): boolean;
  resolveForResponder(chain?: readonly import("../Responders/responderTypes").ResponderResolution[]): UndoManager | null;
  inspect(): readonly UndoManagerInspection[];
  dispose(): void;
}
