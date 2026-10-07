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

import { expect, it, vi } from "vitest";
import { createMountedMotionClient } from "../../../src/SynCloudOS/AppSDK/mountedMotionClient";
import { MotionService } from "../../../src/SynCloudOS/MotionFX/MotionService";

it("wraps immutable service managers and releases their bounded leases", () => {
  const service = new MotionService();
  const client = createMountedMotionClient(service, new AbortController().signal, () => ["motion.read"]);
  for (let i = 0; i < 12; i++) {
    const manager = client.createManager();
    expect(Object.isFrozen(manager)).toBe(true);
    expect(manager.capabilities.gyroscope.state).toBe("unavailable");
    manager.dispose();
  }
  service.dispose();
});

it("requires declared motion access and never requests permission during acquisition", () => {
  const createManager = vi.fn(() => ({ dispose: vi.fn() }));
  const controller = new AbortController();
  const client = createMountedMotionClient(
    { createManager } as never,
    controller.signal,
    () => [],
  );
  expect(() => client.createManager()).toThrow(/motion.read/);
  expect(createManager).not.toHaveBeenCalled();
});

it("forwards mount revocation and gives only explicitly declared authorization", () => {
  const createManager = vi.fn(() => ({ dispose: vi.fn() }));
  const controller = new AbortController();
  const client = createMountedMotionClient(
    { createManager } as never,
    controller.signal,
    () => ["motion.read"],
  );
  client.createManager();
  expect(createManager.mock.calls[0][0].canRequestAuthorization).toBe(false);
  const signal = createManager.mock.calls[0][0].signal;
  controller.abort();
  expect(signal.aborted).toBe(true);
  expect(() => client.createManager()).toThrow();
});

it("bounds resource leases, reclaims disposed slots and rejects pre-aborted acquisition", () => {
  const createManager = vi.fn(() => ({ dispose: vi.fn() }));
  const client = createMountedMotionClient(
    { createManager } as never,
    new AbortController().signal,
    () => ["motion.read", "motion.requestAuthorization"],
  );
  const managers = Array.from({ length: 8 }, () => client.createManager());
  expect(() => client.createManager()).toThrow(/limit/);
  managers[0].dispose();
  expect(() => client.createManager()).not.toThrow();
  expect(createManager.mock.calls[0][0].canRequestAuthorization).toBe(true);
  expect(() => client.createManager(AbortSignal.abort())).toThrow();
});
