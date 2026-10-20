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

import type { ActiveResponderAnchors } from "../Responders/responderTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type FocusScopeKind = "root" | "webspring" | "application" | "window" | "menu" | "sheet" | "popover" | "modal";
export interface FocusScopeRegistration {
  readonly id: string;
  readonly kind: FocusScopeKind;
  readonly parentScopeId?: string;
  readonly parentResponderId: string;
  readonly modal: boolean;
  readonly trapFocus: boolean;
  readonly restoreResponderId?: string;
}
export type FocusRequestResult = { readonly status: "focused"; readonly responderId: string } | { readonly status: "missing" | "disabled" | "blocked"; readonly responderId: string; readonly reason: string };
export type FocusCloseResult = { readonly status: "closed"; readonly scopeId: string; readonly restoredResponderId: string | null } | { readonly status: "missing"; readonly scopeId: string; readonly restoredResponderId: null };
export interface FocusScopeHandle { readonly id: string; close(options?: { readonly restore?: boolean }): FocusCloseResult; dispose(): FocusCloseResult }
export interface FocusManager {
  readonly runtimeId: SynCloudOSRuntimeId;
  openScope(registration: FocusScopeRegistration): FocusScopeHandle;
  requestFocus(responderId: string, options?: { readonly force?: boolean }): FocusRequestResult;
  closeScope(scopeId: string, options?: { readonly restore?: boolean }): FocusCloseResult;
  isScopeWithin(scopeId: string, ancestorScopeId: string): boolean;
  setActiveAnchors(anchors: ActiveResponderAnchors): void;
  getActiveAnchors(): ActiveResponderAnchors;
  getFocusedResponderId(): string | null;
  getGeneration(): number;
  /** Observes focus, scope and anchor changes after the current mutation completes. */
  subscribe(listener: () => void): () => void;
  inspect(): { readonly generation: number; readonly focusedResponderId: string | null; readonly scopes: readonly FocusScopeRegistration[]; readonly restorations: readonly { readonly scopeId: string; readonly responderId: string | null }[] };
  handleRespondersRemoved(ids: readonly string[]): void;
  dispose(): void;
}
