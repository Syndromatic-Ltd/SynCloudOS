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

/**
 * The small command surface shared by NSE drag controls. It deliberately
 * accepts the app facade as well as the kernel command system: each exposes
 * these two operations, while the owner decides how responder authority is
 * resolved.
 */
export interface NSEDragCommandPort {
  register(declaration: object): { dispose(): boolean };
  dispatch(commandId: string, payload?: unknown, options?: unknown): Promise<{ readonly status: string }>;
}

export const nseDragCommandIds = Object.freeze({
  begin: "nse.drag.begin",
  drop: "nse.drag.drop",
  cancel: "nse.drag.cancel",
});

export const nseDragNoPayload = Object.freeze({
  description: "No payload.",
  parse(value: unknown) {
    return value === undefined
      ? Object.freeze({ ok: true as const, value: undefined })
      : Object.freeze({ ok: false as const, issues: Object.freeze(["This drag command does not accept a payload."]) });
  },
});

export function dragCommandSucceeded(result: { readonly status: string }): boolean {
  return result.status === "executed";
}
