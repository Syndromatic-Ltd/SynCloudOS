/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "../DFXQueue";
import type { DFXQoS } from "../DFXQoS";
import { DFXWorkItem } from "../DFXWorkItem";
import type { DFXWorkItemFlags } from "../DFXWorkItemFlags";
import { objectState } from "./queueState";
import { clientError } from "./time";

/** Validate and capture at registration; submit only when completion is observed. */
export function notification(queue: DFXQueue, optionsOrWork: unknown, work?: () => unknown): () => void {
  objectState(queue);
  if (optionsOrWork instanceof DFXWorkItem) return () => queue.async(optionsOrWork);
  const options = typeof optionsOrWork === "function" ? {} : optionsOrWork as { qos?: DFXQoS; flags?: DFXWorkItemFlags[] };
  const execute = typeof optionsOrWork === "function" ? optionsOrWork as () => unknown : work;
  if (typeof execute !== "function") clientError("work must be a function");
  const item = new DFXWorkItem(options, execute);
  return () => queue.async(item);
}
