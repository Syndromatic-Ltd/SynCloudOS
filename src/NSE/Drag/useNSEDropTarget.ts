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

import { useEffect, useRef, type DragEventHandler } from "react";
import type { PasteboardRepresentation } from "../../SynCloudOS/SynCloudOS";
import { snapshotNSEDataTransfer } from "./browserDragBridge";

/** Native DataTransfer is deliberately contained in this interoperability adapter. */
export function useNSEDropTarget(options: {
  readonly claim?: (
    values: readonly PasteboardRepresentation[],
    signal: AbortSignal,
  ) => void | Readonly<{ cancel(reason: string): void }>;
  readonly accept: (types: readonly string[], signal: AbortSignal) => boolean | Promise<boolean>;
  readonly drop: (values: readonly PasteboardRepresentation[], signal: AbortSignal) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}) {
  const request = useRef<{
    readonly generation: number;
    readonly controller: AbortController;
    readonly claim?: Readonly<{ cancel(reason: string): void }>;
  } | null>(null);
  useEffect(() => () => {
    request.current?.controller.abort(new DOMException("The native drop target was unmounted.", "AbortError"));
    request.current?.claim?.cancel("The native drop target was unmounted.");
    request.current = null;
  }, []);
  const onDragOver: DragEventHandler<HTMLElement> = (event) => { event.preventDefault(); };
  const onDrop: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault();
    const previous = request.current;
    previous?.controller.abort(new DOMException("A newer native drop replaced this request.", "AbortError"));
    previous?.claim?.cancel("A newer native drop replaced this request.");
    const generation = (previous?.generation ?? 0) + 1;
    const controller = new AbortController();
    let values: readonly PasteboardRepresentation[];
    try { values = snapshotNSEDataTransfer(event.dataTransfer); }
    catch (error) {
      controller.abort(error);
      options.onError?.(error);
      return;
    }
    let claim: ReturnType<NonNullable<typeof options.claim>>;
    try { claim = options.claim?.(values, controller.signal); }
    catch (error) {
      controller.abort(error);
      options.onError?.(error);
      return;
    }
    const current = { generation, controller, ...(claim ? { claim } : {}) };
    request.current = current;
    const types = Object.freeze(values.map(({ type }) => type));
    void Promise.resolve(options.accept(types, current.controller.signal)).then(async (accepted) => {
      if (!accepted || current.controller.signal.aborted || request.current !== current) {
        current.claim?.cancel("The native drop was rejected.");
        if (request.current === current) request.current = null;
        return;
      }
      await options.drop(values, current.controller.signal);
      if (current.controller.signal.aborted || request.current !== current) return;
      request.current = null;
    }).catch((error) => {
      current.claim?.cancel("The native drop failed.");
      if (!current.controller.signal.aborted) options.onError?.(error);
      if (request.current === current) request.current = null;
    });
  };
  return { onDragOver, onDrop } as const;
}
