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
import { createTestRuntime } from "./helpers";

describe("PolicyKit change notification", () => {
  it("notifies subscribers of role-capability, policy and access-mode changes without a store publication", () => {
    const runtime = createTestRuntime();
    const listener = vi.fn();
    const storeListener = vi.fn();
    const unsubscribe = runtime.policy.subscribe(listener);
    runtime.store.subscribe(storeListener);

    const registration = runtime.policy.registerRoleCapabilities({ roles: ["public"], capabilities: ["notification.test"] });
    expect(listener).toHaveBeenCalledTimes(1);
    registration.dispose();
    expect(listener).toHaveBeenCalledTimes(2);
    registration.dispose();
    expect(listener).toHaveBeenCalledTimes(2);

    runtime.policy.registerPolicy("notification.policy", (_request, decision) => decision);
    runtime.policy.removePolicy("notification.policy");
    expect(listener).toHaveBeenCalledTimes(4);
    expect(storeListener).not.toHaveBeenCalled();

    unsubscribe();
    runtime.policy.registerRoleCapabilities({ roles: ["public"], capabilities: ["notification.after"] });
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
