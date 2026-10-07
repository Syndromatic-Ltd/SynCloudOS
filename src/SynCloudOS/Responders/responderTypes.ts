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
import type { UndoOwner } from "../Undo/undoTypes";

export type ResponderKind = "control" | "view" | "controller" | "document" | "window" | "application" | "workspace" | "webspring" | "runtime";

export interface ResponderRegistration {
  readonly id: string;
  readonly runtimeId?: SynCloudOSRuntimeId;
  readonly kind: ResponderKind;
  readonly parentId?: string;
  readonly scopeId: string;
  readonly enabled?: () => boolean;
  readonly undoOwner?: UndoOwner;
  readonly diagnosticsLabel?: string;
}

export interface ResponderResolution {
  readonly id: string;
  readonly kind: ResponderKind;
  readonly parentId: string | null;
  readonly scopeId: string;
  readonly undoOwner?: UndoOwner;
  readonly diagnosticsLabel?: string;
}

export interface ResponderRegistrationHandle {
  readonly id: string;
  dispose(options?: { readonly cascade?: boolean }): boolean;
}

export interface ActiveResponderAnchors {
  readonly documentResponderId?: string | null;
  readonly windowResponderId?: string | null;
  readonly applicationResponderId?: string | null;
  readonly workspaceResponderId?: string | null;
  readonly webspringResponderId?: string | null;
  readonly runtimeResponderId?: string | null;
}

export interface ResponderGraphInspection {
  readonly generation: number;
  readonly registrations: readonly ResponderResolution[];
  readonly lastResolution: readonly string[];
  readonly diagnostics: readonly { readonly code: string; readonly responderId: string; readonly detail: string }[];
}

export interface ResponderRegistrationToken {
  readonly id: string;
  readonly generation: number;
}

export interface ResponderGraph {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly generation: number;
  register(registration: ResponderRegistration): ResponderRegistrationHandle;
  remove(id: string, options?: { readonly cascade?: boolean }): boolean;
  has(id: string): boolean;
  get(id: string): ResponderResolution | null;
  isEnabled(id: string): boolean;
  resolveChain(startId?: string): readonly ResponderResolution[];
  getGeneration(): number;
  getRegistrationToken(id: string): ResponderRegistrationToken | null;
  subscribe(listener: () => void): () => void;
  inspect(): ResponderGraphInspection;
  dispose(): void;
}
