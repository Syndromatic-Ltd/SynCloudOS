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

interface TFXRuntimeGlobal {
  readonly window?: unknown;
  readonly document?: unknown;
  readonly WorkerGlobalScope?: unknown;
  readonly process?: {
    readonly versions?: { readonly node?: string };
    readonly type?: string;
    readonly release?: { readonly name?: string };
    readonly [Symbol.toStringTag]?: string;
  };
}

/** Internal backend selection. Browser process shims must never select the Node package entry. */
export function isNativeTFXFontBackendEnvironment(runtime: TFXRuntimeGlobal = globalThis): boolean {
  return Object.prototype.toString.call(runtime.process) === "[object process]" &&
    runtime.process?.type !== "renderer" &&
    runtime.process?.release?.name === "node" &&
    Boolean(runtime.process.versions?.node);
}
