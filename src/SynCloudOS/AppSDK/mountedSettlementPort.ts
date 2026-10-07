/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  SettlementExclusionHandle,
  SettlementWorkInput,
} from "../Testing/appSdkSettlementPort";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { getRuntimeSettlement, trackRuntimeSettlement } from "../Testing/appSdkSettlementPort";

/** Host-private bridge from mounted runtime owners into TEST-03 settlement.
 * It observes real owner receipts/lifetimes and does not mint operations. */
export interface MountedSettlementPort {
  track<T>(receipt: Promise<T>, input: SettlementWorkInput): Promise<T>;
  exclude(input: SettlementWorkInput): SettlementExclusionHandle;
}

type MountedSettlementRuntime = Pick<
  SynCloudOSRuntime,
  "runtimeId" | "signal" | "environment" | "operations" | "presentationSettlements" | "registerDisposalParticipant"
>;

export function createMountedSettlementPort(runtime: MountedSettlementRuntime): MountedSettlementPort {
  return Object.freeze({
    track<T>(receipt: Promise<T>, input: SettlementWorkInput) {
      return trackRuntimeSettlement(runtime, receipt, input);
    },
    exclude(input: SettlementWorkInput) {
      return getRuntimeSettlement(runtime).exclude(input);
    },
  });
}
