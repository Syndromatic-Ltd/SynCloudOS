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
import { BrowserContactsAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter";
import { getMountedAppEnvironmentClients } from "../../../src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime } from "../helpers";

it("uses real lifecycle policy and captured entitlements for retained device clients", async () => {
  const select = vi.fn(async () => [{ name: ["Ada"] }]);
  const contacts = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } });
  const appId = "com.example.phase5-authority";
  const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), contacts },
    initialBundles: [createTestBundle({ bundleIdentifier: appId, policy: { public: true } }, { entitlements: ["contacts.select"] })] });
  runtime.configurationProfiles.setAccessMode("public");
  const mounted = mountTestSynWareRuntime(runtime, appId);
  const store = getMountedAppEnvironmentClients(mounted.runtime).contacts.createContactStore();
  try {
    const picked = await store.requestAccess({ properties: ["name"] });
    expect(picked[0].displayNames).toEqual(["Ada"]);
    expect(select).toHaveBeenCalledOnce();
    runtime.configurationProfiles.registerPolicy("phase5-deny", (request, decision) => request.app?.bundleIdentifier === appId
      ? { ...decision, allowed: false, decision: "deny", reason: "Test host restriction" } : decision);
    // Canonical privacy revocation may abort the retained lease before its explicit access guard.
    await expect(store.requestAccess()).rejects.toMatchObject({ name: expect.stringMatching(/^(?:AbortError|SecurityError)$/) });
    expect(select).toHaveBeenCalledOnce();
  } finally { store.dispose(); mounted.dispose(); await runtime.dispose("phase5-test"); }
});

it("denies missing captured entitlements before calling a native picker", async () => {
  const select = vi.fn(async () => [{ name: ["Ada"] }]);
  const contacts = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } });
  const appId = "com.example.phase5-no-entitlement";
  const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), contacts },
    initialBundles: [createTestBundle({ bundleIdentifier: appId, policy: { public: true } }, { entitlements: [] })] });
  runtime.configurationProfiles.setAccessMode("public");
  const mounted = mountTestSynWareRuntime(runtime, appId);
  const store = getMountedAppEnvironmentClients(mounted.runtime).contacts.createContactStore();
  try {
    await expect(store.requestAccess()).rejects.toMatchObject({ name: "SecurityError" });
    expect(select).not.toHaveBeenCalled();
  } finally { store.dispose(); mounted.dispose(); await runtime.dispose("phase5-test"); }
});
