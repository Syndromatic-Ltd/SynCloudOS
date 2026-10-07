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
import type { VFXVideoWorkerRequest, VFXVideoWorkerResponse } from "../HostServices/PlatformAdapterRuntimePorts";

const scope = globalThis as unknown as {
  postMessage(message: VFXVideoWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<VFXVideoWorkerRequest>) => void) | null;
};

const operations = new Map<string, AbortController>();

const key = (request: Readonly<{ ownerId: string; generation: number; id: number }>) => `${request.ownerId}:${request.generation}:${request.id}`;

function errorPayload(error: unknown): Readonly<{ name: string; message: string }> {
  if (error instanceof Error) return Object.freeze({ name: error.name || "Error", message: error.message });
  return Object.freeze({ name: "Error", message: String(error) });
}

scope.onmessage = event => {
  const request = event.data;
  if (!request || typeof request !== "object" || typeof request.ownerId !== "string" || !Number.isSafeInteger(request.generation) || !Number.isSafeInteger(request.id)) return;
  const operationKey = key(request);
  if (request.operation === "cancel") {
    operations.get(operationKey)?.abort(new DOMException("Video processing worker operation cancelled.", "AbortError"));
    return;
  }
  if (operations.size >= 64) {
    scope.postMessage(Object.freeze({ ownerId: request.ownerId, generation: request.generation, id: request.id, ok: false, error: Object.freeze({ name: "QuotaExceededError", message: "Video processing worker operation limit exceeded." }) }));
    return;
  }
  const controller = new AbortController();
  operations.set(operationKey, controller);
  const imageRequest: IFXImageWorkerRequest = Object.freeze({
    id: request.id,
    operation: "render-pixels",
    graph: request.graph,
    destination: request.destination,
    interpolation: request.interpolation,
  });
  void executeImageProcessingWorkerRequest(imageRequest as Exclude<IFXImageWorkerRequest, { operation: "cancel" }>, controller.signal).then(
    ({ response, transfer }) => {
      if (!response.ok || response.kind !== "pixels") throw new TypeError("Video processing worker expected pixel output.");
      const result: VFXVideoWorkerResponse = Object.freeze({
        ownerId: request.ownerId,
        generation: request.generation,
        id: request.id,
        ok: true,
        value: response.value,
      });
      scope.postMessage(result, [...transfer]);
    },
    error => scope.postMessage(Object.freeze({ ownerId: request.ownerId, generation: request.generation, id: request.id, ok: false, error: errorPayload(error) })),
  ).finally(() => operations.delete(operationKey));
};
