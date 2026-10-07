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
 * A policy role. Which roles exist is host policy, declared by the runtime's
 * policy profile; the named members are the default Syndromatic profile's
 * roles plus the framework's reserved `system` role.
 */
export type SynCloudOSRole = "public" | "betaTester" | "employee" | "admin" | "founder" | "system" | (string & {});

export interface SynCloudOSPermissionSubject {
  role: SynCloudOSRole;
  capabilities: string[];
}

