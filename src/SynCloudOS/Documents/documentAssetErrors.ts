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

export type DocumentAssetErrorCode =
  | "asset-invalid" | "asset-missing" | "asset-corrupt" | "asset-quota"
  | "asset-unauthorized" | "asset-conflict" | "asset-aborted" | "asset-unsupported" | "asset-unavailable";

export class DocumentAssetError extends Error {
  constructor(readonly code: DocumentAssetErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DocumentAssetError";
  }
}

export function assertDocumentAssetNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DocumentAssetError("asset-aborted", "The asset operation was aborted.", { cause: signal.reason });
}

export function documentAssetStorageError(error: unknown): Error {
  if (error instanceof DocumentAssetError) return error;
  const name = error instanceof Error ? error.name : undefined;
  return new DocumentAssetError(name === "QuotaExceededError" ? "asset-quota" : name === "AbortError" ? "asset-aborted" : "asset-unavailable",
    "Asset storage could not complete the operation.", { cause: error });
}

export function awaitDocumentAsset<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(new DocumentAssetError("asset-aborted", "The asset operation was aborted.", { cause: signal.reason })));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}
