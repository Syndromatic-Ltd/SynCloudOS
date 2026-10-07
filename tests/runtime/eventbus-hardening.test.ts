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
import { createTestRuntime, createRuntimeHarness } from "./helpers";

describe("EventBus listener hardening", () => {
  it("captures typed listener failures and continues notifying later listeners", async () => {
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const calls: string[] = [];

    SynCloudOS.EventBus.subscribe("test.event", () => {
      throw new Error("typed listener broke");
    });
    SynCloudOS.EventBus.subscribe("test.event", () => {
      calls.push("second");
    });

    SynCloudOS.EventBus.publish("test.event", { answer: 42 }, "Test event");

    expect(calls).toEqual(["second"]);
    expect(RuntimeController.getEventHistory().some((event) => event.type === "runtime.event.listener.failed")).toBe(true);
    expect(RuntimeController.getSnapshot().errors.at(-1)).toMatchObject({
      code: "RUNTIME_EVENT_LISTENER_FAILED",
      context: {
        eventType: "test.event",
        listenerKind: "typed",
        payloadSummary: "{\"answer\":42}"
      }
    });
  });

  it("captures wildcard listener failures", async () => {
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());

    SynCloudOS.EventBus.subscribe("*", () => {
      throw new Error("wildcard listener broke");
    });
    SynCloudOS.EventBus.publish("test.wildcard", { ok: true }, "Wildcard");

    expect(RuntimeController.getSnapshot().errors.at(-1)).toMatchObject({
      code: "RUNTIME_EVENT_LISTENER_FAILED",
      context: {
        eventType: "test.wildcard",
        listenerKind: "wildcard"
      }
    });
  });

  it("records error.capture listener failures without recursive ErrorManager reports", async () => {
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());

    SynCloudOS.EventBus.subscribe("error.capture", () => {
      throw new Error("error listener broke");
    });
    SynCloudOS.ErrorManager.capture({
      code: "UNKNOWN_RUNTIME_ERROR",
      title: "Original error",
      message: "Original error message"
    });

    const snapshot = RuntimeController.getSnapshot();
    expect(RuntimeController.getEventHistory().some((event) => event.type === "runtime.event.listener.failed")).toBe(true);
    expect(snapshot.errors.filter((error) => error.code === "RUNTIME_EVENT_LISTENER_FAILED")).toHaveLength(0);
    expect(snapshot.errors.at(-1)?.title).toBe("Original error");
  });
});
