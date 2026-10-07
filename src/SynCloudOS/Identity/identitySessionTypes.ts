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

export type IdentitySessionState = "active" | "locked" | "expired";

export interface IdentitySessionSnapshot {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly id: string;
  readonly subjectId: string;
  readonly state: IdentitySessionState;
  readonly claims: Readonly<Record<string, string | boolean | number>>;
  readonly expiresAt?: number;
}

export type IdentitySessionAdapterSnapshot = Omit<IdentitySessionSnapshot, "runtimeId">;

export interface IdentitySessionAdapter {
  readonly id: string;
  read(signal?: AbortSignal): Promise<IdentitySessionAdapterSnapshot | null>;
  subscribe(listener: (snapshot: IdentitySessionAdapterSnapshot | null) => void): () => void;
  end(request: { readonly reason: string; readonly signal?: AbortSignal }): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface IdentitySessionService {
  readonly runtimeId: SynCloudOSRuntimeId;
  getSnapshot(): IdentitySessionSnapshot | null;
  getRevision(): number;
  subscribe(listener: (snapshot: IdentitySessionSnapshot | null) => void): () => void;
  refresh(options?: { readonly signal?: AbortSignal }): Promise<IdentitySessionSnapshot | null>;
  end(request: { readonly reason: string; readonly signal?: AbortSignal }): Promise<void>;
  dispose(): void | Promise<void>;
}
