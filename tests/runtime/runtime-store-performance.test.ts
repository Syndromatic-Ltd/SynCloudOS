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

import { describe, expect, it, vi } from "vitest";
import { createTestRuntime, createRuntimeHarness } from "./helpers";
import { shallowEqualRuntimeSelection } from "../../src/SynCloudOS/Runtime/RuntimeStore";

describe("RuntimeStore performance primitives", () => {
  it("notifies subscribers once for a batch of runtime mutations", async () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);

    RuntimeStore.batch(() => {
      RuntimeStore.mutate((draft) => {
        draft.booted = true;
      });
      RuntimeStore.mutate((draft) => {
        draft.webspring.isBooted = true;
      });
      expect(RuntimeStore.getSnapshot().booted).toBe(true);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(RuntimeStore.getSnapshot()).toMatchObject({
      booted: true,
      webspring: { isBooted: true }
    });
  });

  it("structurally shares untouched branches while isolating changed branches", async () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());

    const before = RuntimeStore.getSnapshot();

    RuntimeStore.mutate((draft) => {
      draft.webspring.isBooted = true;
    });

    const after = RuntimeStore.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.webspring).not.toBe(before.webspring);
    expect(after.appInfo).toBe(before.appInfo);
    expect(after.services).toBe(before.services);
    expect(before.webspring.isBooted).toBe(false);
    expect(after.webspring.isBooted).toBe(true);
  });

  it("keeps checkpoints isolated from later nested service mutations", async () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());

    RuntimeStore.mutate((draft) => {
      draft.services.testService = {
        id: "testService",
        displayName: "Test Service",
        description: "Nested clone fixture.",
        availability: "available",
        dependencies: ["routing"],
        providedCapabilities: ["test.capability"],
        capabilityMetadata: {
          tier: "test",
          tags: ["fixture"]
        }
      };
    });

    const checkpoint = RuntimeStore.cloneSnapshot();

    RuntimeStore.mutate((draft) => {
      draft.services.testService.dependencies?.push("windowing");
      draft.services.testService.providedCapabilities?.push("test.extra");
      draft.services.testService.capabilityMetadata?.tags?.push("mutated");
    });

    expect(checkpoint.services.testService.dependencies).toEqual(["routing"]);
    expect(checkpoint.services.testService.providedCapabilities).toEqual(["test.capability"]);
    expect(checkpoint.services.testService.capabilityMetadata?.tags).toEqual(["fixture"]);
  });

  it("clones caller-owned nested data when replacing snapshots", async () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const replacement = RuntimeStore.cloneSnapshot();

    replacement.services.testService = {
      id: "testService",
      displayName: "Test Service",
      description: "Replace snapshot fixture.",
      availability: "available",
      dependencies: ["routing"],
      providedCapabilities: ["test.capability"],
      capabilityMetadata: {
        tags: ["fixture"]
      }
    };

    RuntimeStore.replaceSnapshot(replacement);

    replacement.services.testService.dependencies?.push("caller-owned");
    replacement.services.testService.capabilityMetadata?.tags?.push("caller-owned");

    expect(RuntimeStore.getSnapshot().services.testService.dependencies).toEqual(["routing"]);
    expect(RuntimeStore.getSnapshot().services.testService.capabilityMetadata?.tags).toEqual(["fixture"]);
  });

  it("coalesces nested batches into the outer notification", async () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);

    RuntimeStore.batch(() => {
      RuntimeStore.mutate((draft) => {
        draft.booted = true;
      });
      RuntimeStore.batch(() => {
        RuntimeStore.mutate((draft) => {
          draft.webspring.isBooted = true;
        });
      });
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(RuntimeStore.getSnapshot().webspring.isBooted).toBe(true);
  });

  it("keeps transaction rollback semantics inside a runtime batch", async () => {
    const { RuntimeController } = createRuntimeHarness(createTestRuntime());

    RuntimeController.batch(() => {
      RuntimeController.commit((draft) => {
        draft.responsive.width = 1024;
      });
      RuntimeController.transaction("batched.rollback", (context) => {
        context.mutate((draft) => {
          draft.booted = true;
        });
        throw new Error("rollback inside batch");
      });
    });

    expect(RuntimeController.getSnapshot().booted).toBe(false);
    expect(RuntimeController.getSnapshot().responsive.width).toBe(1024);
    expect(RuntimeController.getHistory().at(-1)).toMatchObject({
      label: "batched.rollback",
      status: "rolledBack"
    });
    expect(RuntimeController.getSnapshot().errors.at(-1)?.code).toBe("RUNTIME_TRANSACTION_FAILED");
  });

  it("keeps the published snapshot and notifies no one when a mutation changes nothing", () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);
    const before = RuntimeStore.getSnapshot();

    RuntimeStore.mutate((draft) => {
      if (draft.responsive.width < 0) draft.responsive.width = 0;
    });
    RuntimeStore.mutate((draft) => {
      void draft.webspring.layout.preference.order.length;
    });
    RuntimeStore.batch(() => {
      RuntimeStore.mutate((draft) => { void draft.application.openAppIds; });
    });

    expect(RuntimeStore.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();

    RuntimeStore.mutate((draft) => { draft.responsive.width = before.responsive.width + 1; });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(RuntimeStore.getSnapshot()).not.toBe(before);
  });

  it("records events and transaction history without publishing runtime state", () => {
    const runtime = createTestRuntime();
    const { RuntimeStore, RuntimeController } = createRuntimeHarness(runtime);
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);
    const before = RuntimeStore.getSnapshot();

    runtime.events.publish("diagnostic.test", { value: 1 }, "test");
    RuntimeController.transaction(() => "no state change", "diagnostic.no-op");

    expect(listener).not.toHaveBeenCalled();
    expect(RuntimeStore.getSnapshot()).toBe(before);
    expect(RuntimeController.getEventHistory().map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(["diagnostic.test", "runtime.transaction.begin", "runtime.transaction.commit"]),
    );
    expect(RuntimeController.getTransactionHistory().at(-1)).toMatchObject({ label: "diagnostic.no-op", status: "committed" });
  });

  it("delivers full event payloads to listeners while bounding what history retains", () => {
    const runtime = createTestRuntime();
    const received: unknown[] = [];
    runtime.events.subscribe("diagnostic.large", (event) => received.push(event.payload));
    const payload = { rows: Array.from({ length: 5000 }, (_, index) => ({ index, label: `row ${index}` })) };
    runtime.events.publish("diagnostic.large", payload, "test");
    expect(received).toEqual([payload]);
    const retained = runtime.events.getHistory().at(-1);
    expect(retained?.type).toBe("diagnostic.large");
    expect(retained?.payload).toMatchObject({ truncated: true, keys: ["rows"] });
    expect(runtime.diagnostics.events.statistics().estimatedBytes).toBeLessThanOrEqual(runtime.diagnostics.events.maximumBytes);
  });

  it("still publishes an explicit snapshot replacement", () => {
    const { RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);
    RuntimeStore.replaceSnapshot(RuntimeStore.cloneSnapshot());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("compares shallow selector outputs by own keys", () => {
    expect(shallowEqualRuntimeSelection({ booted: true }, { booted: true })).toBe(true);
    expect(shallowEqualRuntimeSelection({ booted: true }, { booted: false })).toBe(false);
    expect(shallowEqualRuntimeSelection({ booted: true }, { booted: true, extra: true })).toBe(false);
  });
});
