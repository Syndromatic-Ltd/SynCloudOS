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

import { describe, expect, it } from "vitest";
import { cloneRuntimeSnapshot } from "../../src/SynCloudOS/Runtime/RuntimeStore";
import { createRuntimeHarness, createTestRuntime } from "./helpers";

type TransactionContext = { mutate(mutator: (draft: any) => void): void };

function harness() {
  const runtime = createTestRuntime();
  const { RuntimeController, RuntimeStore } = createRuntimeHarness(runtime);
  const transaction = <T,>(label: string, callback: (context: TransactionContext) => T) =>
    RuntimeController.transaction(label, callback as never) as T | undefined;
  return { runtime, RuntimeController, RuntimeStore, transaction };
}

describe("runtime transaction write sets", () => {
  it("applies a spread reassignment of a branch, inside and outside a batch", () => {
    const { RuntimeStore, RuntimeController, transaction } = harness();
    transaction("spread", (context) => context.mutate((draft) => {
      draft.webspring = { ...draft.webspring, hoveredAppId: "spread-app", layout: { ...draft.webspring.layout, isEditing: true } };
    }));
    expect(RuntimeStore.getSnapshot().webspring).toMatchObject({ hoveredAppId: "spread-app", layout: { isEditing: true } });
    RuntimeController.batch(() => {
      transaction("spread-batch", (context) => context.mutate((draft) => {
        draft.webspring = { ...draft.webspring, previewAppId: "batched" };
      }));
    });
    expect(RuntimeStore.getSnapshot().webspring).toMatchObject({ hoveredAppId: "spread-app", previewAppId: "batched", layout: { isEditing: true } });
  });

  it("never mutates a committed snapshot object while the mutator rearranges arrays", () => {
    const { RuntimeStore, transaction } = harness();
    RuntimeStore.mutate((draft) => {
      draft.notifications = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] as never;
    });
    const before = RuntimeStore.getSnapshot();
    const frozenCopy = cloneRuntimeSnapshot(before);
    transaction("rearrange", (context) => context.mutate((draft) => {
      draft.notifications.splice(0, 1);
      draft.notifications[0].title = "B edited";
      draft.notifications.push({ id: "d", title: "D" });
    }));
    expect(before).toEqual(frozenCopy);
    expect(RuntimeStore.getSnapshot().notifications).toEqual([
      { id: "b", title: "B edited" }, { id: "c", title: "C" }, { id: "d", title: "D" },
    ]);
  });

  it("keeps aliased snapshot objects aliased for the mutator, as a deep clone would", () => {
    const { RuntimeStore, transaction } = harness();
    const shared = { tags: ["one"] };
    const replacement = cloneRuntimeSnapshot(RuntimeStore.getSnapshot());
    (replacement.services as Record<string, unknown>).first = { id: "first", metadata: shared };
    (replacement.services as Record<string, unknown>).second = { id: "second", metadata: shared };
    RuntimeStore.replaceSnapshot(replacement);
    let aliased = false;
    transaction("alias", (context) => context.mutate((draft) => {
      draft.services.first.metadata.tags.push("two");
      aliased = draft.services.second.metadata === draft.services.first.metadata;
    }));
    expect(aliased).toBe(true);
    const services = RuntimeStore.getSnapshot().services as Record<string, any>;
    expect(services.first.metadata.tags).toEqual(["one", "two"]);
    expect(services.second.metadata.tags).toEqual(["one", "two"]);
  });

  it("keeps objects created by the mutator as live plain objects", () => {
    const { RuntimeStore, transaction } = harness();
    transaction("owned", (context) => context.mutate((draft) => {
      const created = { id: "created", flags: [] as string[] };
      draft.services.created = created;
      draft.services.created.flags.push("via-draft");
      created.flags.push("via-reference");
    }));
    expect((RuntimeStore.getSnapshot().services as Record<string, any>).created.flags).toEqual(["via-draft", "via-reference"]);
  });

  it("rolls back only its own writes and preserves concurrent writes in the same branch", async () => {
    const { RuntimeStore, transaction } = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = transaction("rollback", async (context) => {
      context.mutate((draft) => { draft.webspring.hoveredAppId = "owned-write"; });
      await gate;
      throw new Error("abandon");
    });
    RuntimeStore.mutate((draft) => { draft.webspring.previewAppId = "concurrent-write"; });
    release();
    await pending;
    expect(RuntimeStore.getSnapshot().webspring.hoveredAppId).toBeNull();
    expect(RuntimeStore.getSnapshot().webspring.previewAppId).toBe("concurrent-write");
  });

  it("leaves a value overwritten by later work in place on rollback", async () => {
    const { RuntimeStore, transaction } = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = transaction("overwritten", async (context) => {
      context.mutate((draft) => { draft.webspring.hoveredAppId = "transaction"; });
      await gate;
      throw new Error("abandon");
    });
    RuntimeStore.mutate((draft) => { draft.webspring.hoveredAppId = "later"; });
    release();
    await pending;
    expect(RuntimeStore.getSnapshot().webspring.hoveredAppId).toBe("later");
  });

  it("publishes nothing for a transactional mutator that writes nothing", () => {
    const { RuntimeStore, transaction } = harness();
    const before = RuntimeStore.getSnapshot();
    transaction("read-only", (context) => context.mutate((draft) => { void draft.appInfo; void draft.webspring.layout.preference.order; }));
    expect(RuntimeStore.getSnapshot()).toBe(before);
  });
});
