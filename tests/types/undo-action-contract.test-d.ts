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

import { defineAwaitUndoAction, defineSyncUndoAction, type UndoAction } from "../../src/SynCloudOS/Undo";

const sync = defineSyncUndoAction({ name: "Sync", asyncPolicy: "forbid", undo: () => {}, redo: () => {} });
const awaited = defineAwaitUndoAction({ name: "Awaited", asyncPolicy: "await", undo: async () => {}, redo: () => {} });
const actions: UndoAction[] = [sync, awaited];
void actions;

// @ts-expect-error async callbacks are forbidden for synchronous undo actions.
defineSyncUndoAction({ name: "Async", asyncPolicy: "forbid", undo: async () => {}, redo: () => {} });
// @ts-expect-error value-returning callbacks are forbidden for synchronous undo actions.
defineSyncUndoAction({ name: "Value", asyncPolicy: "forbid", undo: () => 1, redo: () => {} });
// @ts-expect-error raw unbranded actions are not UndoAction values.
const raw: UndoAction = { name: "Raw", asyncPolicy: "forbid", undo: () => {}, redo: () => {} };
void raw;
