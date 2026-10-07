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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { browserTestingClock } from "../PlatformAdapters/BrowserTestingClock";
import { createSettlementRegistry, registerOperationCoordinatorSettlement, registerPresentationSettlement } from "./SettlementRegistry";
import type { SettlementRegistry, SettlementWorkInput } from "./settlementTypes";

type RuntimeOwner = Pick<SynCloudOSRuntime, "runtimeId" | "signal" | "environment" | "operations" | "presentationSettlements" | "registerDisposalParticipant">
  & Partial<Pick<SynCloudOSRuntime, "store">>;
interface Association {
  readonly registry: SettlementRegistry;
  readonly receipts: WeakSet<Promise<unknown>>;
  readonly detach: Set<() => void>;
}
const associations = new WeakMap<RuntimeOwner, Association>();
function associationFor(runtime: RuntimeOwner): Association {
  const existing = associations.get(runtime);
  if (existing) return existing;
  const registry = createSettlementRegistry({ runtimeId: runtime.runtimeId, now: runtime.environment.now,
    setTimeout: browserTestingClock.setTimeout,
    clearTimeout: browserTestingClock.clearTimeout,
  });
  const association: Association = { registry, receipts: new WeakSet(), detach: new Set() };
  associations.set(runtime, association);
  const dispose = () => {
    for (const detach of association.detach) detach();
    association.detach.clear();
    registry.dispose();
  };
  if (runtime.signal.aborted) { dispose(); return association; }
  try {
    registerOperationCoordinatorSettlement(registry, runtime.operations);
    registerPresentationSettlement(registry, runtime.presentationSettlements);
    if (runtime.store) {
      registry.registerProducer({
        id: "application.multiswitch",
        inspect: () => {
          const multiSwitch = runtime.store!.getSnapshot().application.multiSwitch;
          if (multiSwitch.status !== "switching" || !multiSwitch.id) return [];
          return [Object.freeze({
            id: multiSwitch.id,
            owner: "application",
            kind: "multiswitch",
            label: `${multiSwitch.fromAppId ?? "none"} -> ${multiSwitch.toAppId ?? "none"}`,
            ...(multiSwitch.startedAt === null ? {} : { startedAt: multiSwitch.startedAt }),
          })];
        },
        subscribe: listener => runtime.store!.subscribe(() => listener()),
      });
    }
    runtime.registerDisposalParticipant({ id: "runtime:settlement-observation",
      prepare: () => ({ status: "ready", commit: dispose }),
    });
  } catch (error) { dispose(); throw error; }
  return association;
}

/** One host-private observer per runtime object; no runtime or AppSDK property is added. */
export function getRuntimeSettlement(runtime: RuntimeOwner): SettlementRegistry {
  return associationFor(runtime).registry;
}

function observe(receipt: Promise<unknown>, complete: () => void, fail: (error: unknown) => void): () => void {
  let callbacks: { complete(): void; fail(error: unknown): void } | undefined = { complete, fail };
  void receipt.then(() => callbacks?.complete(), error => callbacks?.fail(error));
  return () => { callbacks = undefined; };
}

/** Observe an actual owner's receipt once by Promise identity. This creates no
 * operation, scheduler or deadline and returns the original receipt unchanged. */
export function trackRuntimeSettlement<T>(runtime: RuntimeOwner, receipt: Promise<T>, input: SettlementWorkInput): Promise<T> {
  const association = associationFor(runtime);
  if (association.receipts.has(receipt) || association.registry.getState().disposed) return receipt;
  // Reserve identity before begin() notifies possibly reentrant observers.
  association.receipts.add(receipt);
  const work = association.registry.begin(input);
  if (association.registry.getState().disposed) return receipt;
  let detach = () => {};
  const finish = (error?: unknown, failed = false) => {
    association.detach.delete(detach);
    detach();
    if (!failed) work.complete();
    else if (error instanceof Error && error.name === "AbortError") work.cancel(error.message);
    else work.fail(error);
  };
  detach = observe(receipt, () => finish(), error => finish(error, true));
  association.detach.add(detach);
  return receipt;
}
