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
import { createTestRuntime } from "./helpers";

describe("runtime disposal participants", () => {
  it("rejects duplicate registration and phase-invalid registration", async () => {
    const runtime = createTestRuntime({ id: "runtime:participant-registration" });
    const registration = runtime.registerDisposalParticipant({
      id: "one",
      prepare: () => ({ status: "ready", commit: () => undefined }),
    });
    expect(() => runtime.registerDisposalParticipant({ id: "one", prepare: () => ({ status: "ready", commit: () => undefined }) }))
      .toThrow(/Duplicate disposal participant/);
    expect(registration.unregister()).toBe(true);
    expect(registration.unregister()).toBe(false);

    const quiescingRegistration = runtime.registerDisposalParticipant({
      id: "quiescing",
      prepare: () => ({ status: "ready", commit: () => undefined }),
    });
    const disposal = runtime.dispose("registration-phase");
    expect(() => runtime.registerDisposalParticipant({ id: "late", prepare: () => ({ status: "ready", commit: () => undefined }) }))
      .toThrow(/already started/);
    await disposal;
    expect(quiescingRegistration.unregister()).toBe(false);
  });

  it("gives a participant a bounded preparation lane and rolls back in reverse order", async () => {
    const runtime = createTestRuntime({ id: "runtime:participant-lane" });
    const trace: string[] = [];
    runtime.registerDisposalParticipant({
      id: "first",
      prepare: async ({ operations }) => {
        await operations.run({ id: "save-draft", execute: async (signal) => {
          expect(signal.aborted).toBe(false);
          trace.push("lane:first");
          return "saved";
        }});
        return { status: "ready", commit: () => trace.push("commit:first"), rollback: () => trace.push("rollback:first") };
      },
    });
    runtime.registerDisposalParticipant({
      id: "second",
      prepare: () => ({ status: "cancelled", reason: "dirty" }),
    });

    const result = await runtime.dispose("lane-cancel");

    expect(result).toMatchObject({ status: "cancelled", participantId: "second", reason: "dirty" });
    expect(trace).toEqual(["lane:first", "rollback:first"]);
    expect(runtime.signal.aborted).toBe(false);
    expect(runtime.disposalState).toBe("running");
  });

  it("normalises prepare and rollback failures while preserving the live runtime on cancellation", async () => {
    const runtime = createTestRuntime({ id: "runtime:participant-errors" });
    runtime.registerDisposalParticipant({
      id: "ready",
      prepare: () => ({
        status: "ready",
        commit: () => undefined,
        rollback: () => { throw new Error("rollback failed"); },
      }),
    });
    runtime.registerDisposalParticipant({
      id: "throws",
      prepare: () => { throw new Error("prepare failed"); },
    });

    const result = await runtime.dispose("prepare-errors");

    expect(result).toMatchObject({ status: "cancelled", participantId: "throws" });
    expect(result.errors).toEqual([
      expect.objectContaining({ phase: "prepare", participantId: "throws", message: "prepare failed" }),
      expect.objectContaining({ phase: "rollback", participantId: "ready", message: "rollback failed" }),
    ]);
    expect(runtime.signal.aborted).toBe(false);
    expect(runtime.disposalState).toBe("running");
    await runtime.dispose("cleanup");
  });

  it("does not create an unhandled rejection when a preparation-lane operation fails", async () => {
    const runtime = createTestRuntime({ id: "runtime:participant-lane-rejection" });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      runtime.registerDisposalParticipant({
        id: "rejecting-lane",
        prepare: async ({ operations }) => {
          await expect(operations.run({
            id: "rejecting-work",
            execute: async () => { throw new Error("lane failure"); },
          })).rejects.toThrow("lane failure");
          return { status: "cancelled", reason: "expected-lane-failure" };
        },
      });

      await expect(runtime.dispose("lane-rejection")).resolves.toMatchObject({
        status: "cancelled",
        reason: "expected-lane-failure",
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      await runtime.dispose("cleanup");
    }
  });
});
