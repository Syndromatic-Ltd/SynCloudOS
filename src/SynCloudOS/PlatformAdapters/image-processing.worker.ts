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

import type { IFXImageWorkerRequest, IFXImageWorkerResponse } from "./BrowserImageProcessingWorker";
import { executeImageProcessingWorkerRequest } from "./imageProcessingWorkerRuntime";

const scope = globalThis as unknown as {
  postMessage(message: IFXImageWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<IFXImageWorkerRequest>) => void) | null;
};

const operations = new Map<number, AbortController>();

function errorPayload(error: unknown): Readonly<{ name: string; message: string }> {
  if (error instanceof Error)
    return Object.freeze({ name: error.name || "Error", message: error.message });
  return Object.freeze({ name: "Error", message: String(error) });
}

scope.onmessage = (event) => {
  const request = event.data;
  if (request.operation === "cancel") {
    operations.get(request.id)?.abort(new DOMException("Image processing worker operation cancelled.", "AbortError"));
    return;
  }

  const controller = new AbortController();
  operations.set(request.id, controller);
  void executeImageProcessingWorkerRequest(request, controller.signal).then(
    ({ response, transfer }) => scope.postMessage(response, [...transfer]),
    (error) => scope.postMessage(Object.freeze({ id: request.id, ok: false, error: errorPayload(error) })),
  ).finally(() => operations.delete(request.id));
};
