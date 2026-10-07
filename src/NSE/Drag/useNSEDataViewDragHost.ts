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

import { useEffect, type DragEvent } from "react";
import type { DragEndpoint } from "../../SynCloudOS/SynCloudOS";
import type {
  NSEDataViewDragBinding,
  NSEDataViewDropLocation,
  NSEDataViewDropProposal,
} from "../DataViews/Drag";
import { writeNSEDragRepresentations } from "./useNSEDragSource";

type TransferKey = string | number;

function eventLocation<TId extends TransferKey>(
  event: DragEvent<HTMLElement>,
  targetId: TId,
  index: number,
): NSEDataViewDropLocation<TId> {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
  const operation = ratio < 0.25 ? "above" : ratio > 0.75 ? "below" : "on";
  return Object.freeze({
    targetId,
    insertionIndex: operation === "below" ? index + 1 : index,
    operation,
  });
}

/** Binds virtual data-view rows to the canonical runtime session. Native event
 * state is consumed synchronously here and never enters the runtime manager. */
export function useNSEDataViewDragHost<TId extends TransferKey>(options: {
  readonly binding?: NSEDataViewDragBinding<TId>;
  readonly endpoint?: DragEndpoint;
  readonly validate?: (proposal: NSEDataViewDropProposal<TId>) => boolean | Promise<boolean>;
  readonly accept?: (proposal: NSEDataViewDropProposal<TId>) => void | Promise<void>;
  readonly onStatus?: (status: string) => void;
  readonly onError?: (error: unknown) => void;
  readonly enabled?: boolean;
}) {
  const binding = options.binding;
  const endpoint = options.endpoint;
  const enabled = options.enabled ?? true;
  useEffect(() => () => binding?.cancel("data-view host unmounted"), [binding, endpoint?.appId, endpoint?.windowId, endpoint?.responderId]);
  useEffect(() => {
    if (!enabled) binding?.cancel("data-view mutation capability unavailable");
  }, [binding, enabled]);

  const start = (event: DragEvent<HTMLElement>, ids: readonly TId[]) => {
    if (!binding || !endpoint || !enabled) { event.preventDefault(); return; }
    try {
      const representations = binding.begin(ids, endpoint);
      try { writeNSEDragRepresentations(event, representations); }
      catch (error) {
        binding.cancel("native data-view payload write failed");
        event.preventDefault();
        options.onError?.(error);
        options.onStatus?.("Drag could not start.");
      }
    } catch (error) {
      event.preventDefault();
      options.onError?.(error);
      options.onStatus?.("Drag could not start.");
    }
  };
  const over = (event: DragEvent<HTMLElement>, targetId: TId, index: number) => {
    if (!binding || !endpoint || !enabled) return;
    event.preventDefault();
    const location = eventLocation(event, targetId, index);
    void binding.update(location, endpoint).then((allowed) => {
      if (allowed) options.onStatus?.(`Drop ${location.operation} target ready.`);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      binding.cancel("native data-view target validation failed");
      options.onError?.(error);
      options.onStatus?.("Drop target rejected.");
    });
  };
  const drop = (event: DragEvent<HTMLElement>, targetId: TId, index: number) => {
    if (!binding || !endpoint || !enabled) { event.preventDefault(); return; }
    event.preventDefault();
    const location = eventLocation(event, targetId, index);
    void binding.drop(location, endpoint, { validate: options.validate, accept: options.accept }).then((accepted) => {
      options.onStatus?.(accepted ? "Drop completed." : "Drop rejected; selection restored.");
    }).catch((error) => {
      binding.cancel("native data-view drop failed");
      options.onError?.(error);
      options.onStatus?.("Drop failed; selection restored.");
    });
  };
  const end = () => binding?.end("native data-view drag ended");

  return { start, over, drop, end } as const;
}
