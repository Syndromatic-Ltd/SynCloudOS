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

export type SynCloudOSLoginSessionStorage = "local" | "session" | null;
export type SynCloudOSBetaAccessClass = "team" | "external";

export type SynCloudOSLoginSessionReason =
  | "missingConfiguration"
  | "missingCredentials"
  | "invalidSynId"
  | "synIdMismatch"
  | "passwordMismatch"
  | "missingSession"
  | "expiredSession"
  | "invalidSession"
  | "authorised";

export interface SynCloudOSLoginSessionSnapshot {
  isAuthorised: boolean;
  status: "locked" | "unlocked" | "configurationError";
  synId: string | null;
  accessClass: SynCloudOSBetaAccessClass | null;
  displayName: string | null;
  sessionId: string | null;
  storage: SynCloudOSLoginSessionStorage;
  authorisedAt: number | null;
  expiresAt: number | null;
  lastCheckedAt: number | null;
  lastFailureReason: SynCloudOSLoginSessionReason | null;
  configuration: {
    passwordConfigured: boolean;
    teamPasswordConfigured: boolean;
    externalPasswordConfigured: boolean;
    synIdRequired: boolean;
  };
}

export interface SynCloudOSBetaAccessInput {
  synId: string;
  password: string;
}

export interface SynCloudOSBetaUnlockInput extends SynCloudOSBetaAccessInput {
  remember: boolean;
}

export interface SynCloudOSBetaAccessResult {
  ok: boolean;
  reason: SynCloudOSLoginSessionReason;
  message: string;
  synId?: string;
  accessClass?: SynCloudOSBetaAccessClass;
  displayName?: string;
}
