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

import { defineStateMachine } from "../Foundation/internal/StateMachine";

export type FolderSplitPhase = "closed" | "open" | "closing";
export type FolderSplitEvent = "part" | "beginClose";

/** The split folder: resting closed, parted, then rejoining. It never reopens; a new folder is a new presentation. */
export const folderSplitPhaseMachine = defineStateMachine<FolderSplitPhase, FolderSplitEvent>({
  initial: "closed",
  states: {
    closed: { part: "open" },
    open: { beginClose: "closing" },
    closing: {},
  },
});
