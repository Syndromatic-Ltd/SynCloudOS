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

import type { LUFXSearchableItemJSON } from "./LUFXSearchableItem";

export interface LUFXIndexCheckpoint {
  readonly generation: number;
  readonly revision: number;
}

export type LUFXIndexState = "ready" | "rebuild-required";

export type LUFXIndexBackendMutation =
  | Readonly<{ kind: "upsert"; mutationId: string; item: LUFXSearchableItemJSON }>
  | Readonly<{ kind: "delete"; mutationId: string; itemId: string }>
  | Readonly<{ kind: "delete-domain"; mutationId: string; domain: string }>;

export interface LUFXIndexBackendMutationResult {
  readonly mutationId: string;
  readonly checkpoint: LUFXIndexCheckpoint;
  readonly replayed: boolean;
}

export interface LUFXIndexBackendSnapshot {
  readonly state: LUFXIndexState;
  readonly schemaVersion: number;
  readonly checkpoint: LUFXIndexCheckpoint;
  readonly items: readonly LUFXSearchableItemJSON[];
}

/** Replaceable durable storage port. Runtime hosts bind owner identity before
 * exposing an LUFXIndex; applications never pass an owner/application ID. */
export interface LUFXIndexBackend {
  mutate(mutation: LUFXIndexBackendMutation, signal?: AbortSignal): Promise<LUFXIndexBackendMutationResult>;
  snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot>;
  dispose(): void;
}
