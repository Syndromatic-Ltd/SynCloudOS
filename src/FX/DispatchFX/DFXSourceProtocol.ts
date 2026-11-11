/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXObject } from "./DFXObject";
import type { DFXQoS } from "./DFXQoS";
import type { DFXSourceMemoryPressureEvent } from "./DFXSourceMemoryPressureEvent";
import type { DFXWorkItem } from "./DFXWorkItem";
import type { DFXWorkItemFlags } from "./DFXWorkItemFlags";
import type { DFXWork } from "./internal/work";

/** DispatchSourceProtocol. Concrete source protocols refine their data and mask types. */
export interface DFXSourceProtocol extends DFXObject {
  readonly handle: number;
  readonly mask: number | readonly DFXSourceMemoryPressureEvent[];
  readonly data: number | readonly DFXSourceMemoryPressureEvent[];
  readonly isCancelled: boolean;
  cancel(): void;
  setEventHandler(handler: DFXWorkItem): void;
  setEventHandler<R>(handler: DFXWork<R> | null): void;
  setEventHandler<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, handler: DFXWork<R> | null): void;
  setCancelHandler(handler: DFXWorkItem): void;
  setCancelHandler<R>(handler: DFXWork<R> | null): void;
  setCancelHandler<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, handler: DFXWork<R> | null): void;
  setRegistrationHandler(handler: DFXWorkItem): void;
  setRegistrationHandler<R>(handler: DFXWork<R> | null): void;
  setRegistrationHandler<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, handler: DFXWork<R> | null): void;
}
