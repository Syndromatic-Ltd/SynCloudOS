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

export interface NSEColourTransferPayload {
  readonly type: "application/x-syncloudos-colour";
  readonly value: string;
}

export type NSEColourTransferResult =
  | Readonly<{ kind: "accepted"; payload: NSEColourTransferPayload }>
  | Readonly<{ kind: "written" }>
  | Readonly<{ kind: "empty" | "denied" | "unavailable" }>
  | Readonly<{ kind: "error"; error: unknown }>;

export interface NSEColourTransferAdapter {
  read(signal?: AbortSignal): Promise<NSEColourTransferResult>;
  write(payload: NSEColourTransferPayload, signal?: AbortSignal): Promise<NSEColourTransferResult>;
  beginDrag?(payload: NSEColourTransferPayload, options: Readonly<{ sourceId: string }>): void | (() => void);
  authoriseDrop?(types: readonly string[], signal: AbortSignal): boolean | Promise<boolean>;
}
