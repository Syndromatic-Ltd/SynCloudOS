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

import type { DocumentEditResourceRetention } from "./documentEditTypes";

/** Private host binding. Models remain application-defined; no asset grammar or store escapes. */
export interface DocumentResourceModelPreparation { release(): void | Promise<void> }
export interface DocumentResourceChange {
  readonly historyRetention?: DocumentEditResourceRetention;
  /** Switch current ownership reversibly, before history eviction/clear. */
  commit(): void;
  /** Restore previous current ownership and drop unused staged holds. */
  rollback(): void;
  /** Finalize successful publication; history retention has independent ownership. */
  release(): void;
}
export interface DocumentResourceLifecycle {
  prepareModel(next: Readonly<unknown>, signal?: AbortSignal): Promise<DocumentResourceModelPreparation>;
  stageChange(before: Readonly<unknown> | null, after: Readonly<unknown>, options: { readonly recordHistory: boolean }): DocumentResourceChange;
  dispose(): void | Promise<void>;
}
