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

export const WEBSPRING_RETURN_ROLES = Object.freeze(["applicationExit", "shellReturn"] as const);
export type WebspringReturnRole = (typeof WEBSPRING_RETURN_ROLES)[number];

export const WEBSPRING_MULTI_SWITCH_ROLES = Object.freeze(["incoming", "outgoing"] as const);
export type WebspringMultiSwitchRole = (typeof WEBSPRING_MULTI_SWITCH_ROLES)[number];

export const WEBSPRING_PRESENTATION_ROLES = Object.freeze({
  applicationEnter: "application-enter",
  shell: "webspring-shell",
  shellReturn: "webspring-shell-return",
} as const);

const webspringApplicationPresentationRoles = Object.freeze([
  WEBSPRING_PRESENTATION_ROLES.shellReturn,
  WEBSPRING_PRESENTATION_ROLES.applicationEnter,
] as const);
const webspringShellPresentationRoles = Object.freeze([
  WEBSPRING_PRESENTATION_ROLES.shell,
] as const);

export function webspringPresentationRoles(input: { readonly hasApplication: boolean }): readonly string[] {
  return input.hasApplication
    ? webspringApplicationPresentationRoles
    : webspringShellPresentationRoles;
}
