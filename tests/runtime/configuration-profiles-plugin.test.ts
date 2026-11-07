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
import type { SynCloudOSPolicySubject } from "../../src/SynCloudOS/ConfigurationProfiles/policyTypes";
import { asPolicySubject, createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

function createSubject(
  role: SynCloudOSPolicySubject["role"],
  capabilities: string[],
  isAuthenticated = role !== "public"
): SynCloudOSPolicySubject {
  return {
    user: {
      id: `subject.${role}`,
      displayName: role,
      role,
      isAuthenticated,
      isAnonymous: !isAuthenticated
    },
    role,
    capabilities,
    isAuthenticated
  };
}

describe("ConfigurationProfiles evaluation and PluginRegistry policy contracts", () => {
  it("keeps evaluate and explain non-auditing while authorise audits rich decisions", async () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const publicSubject = createSubject("public", ["app.open.public"], false);
    const protectedApp = createTestManifest({
      bundleIdentifier: "com.example.protected-trace-app",
      policy: {
        requiresLogin: true,
        requiredRoles: ["employee"],
        requiredCapabilities: ["app.open.protected", "runtime.inspect"]
      }
    });
    const request = {
      action: "app.launch",
      app: protectedApp,
      ...asPolicySubject(ConfigurationProfiles, publicSubject),
      origin: "test",
      source: "configuration-profiles-plugin.test",
      context: {
        requestId: "trace-1",
        attempt: 2,
        nested: { redacted: true }
      }
    } as const;

    ConfigurationProfiles.clearAuditLog();

    expect(ConfigurationProfiles.evaluate(request)).toMatchObject({ allowed: false });
    expect(ConfigurationProfiles.explain(request)).toMatchObject({ allowed: false });
    expect(ConfigurationProfiles.getAuditLog()).toHaveLength(0);

    const decision = ConfigurationProfiles.authorise(request);
    expect(ConfigurationProfiles).not.toHaveProperty("authorize");

    expect(ConfigurationProfiles.getAuditLog()).toHaveLength(1);
    expect(decision).toMatchObject({
      allowed: false,
      origin: "test",
      source: "configuration-profiles-plugin.test",
      missingRoles: ["employee"],
      matchedRoles: [],
      matchedCapabilities: [],
      missingCapabilities: ["app.open.protected", "runtime.inspect"],
      originSummary: {
        origin: "test",
        source: "configuration-profiles-plugin.test",
        appId: "com.example.protected-trace-app"
      },
      contextSummary: {
        values: {
          requestId: "trace-1",
          attempt: 2,
          nested: "Object"
        }
      }
    });
    expect(decision.contextSummary?.keys).toEqual(expect.arrayContaining(["requestId", "attempt", "nested"]));
    expect(decision.trace.map((entry) => entry.step)).toEqual(
      expect.arrayContaining(["policy.mode", "policy.subject", "policy.requirements", "policy.decision"])
    );
  });

  it("returns copied audit, role, and capability reports", async () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const publicSubject = createSubject("public", ["app.open.public"], false);

    ConfigurationProfiles.clearAuditLog();
    ConfigurationProfiles.authorise({
      action: "runtime.mutate",
      ...asPolicySubject(ConfigurationProfiles, publicSubject),
      origin: "test",
      source: "configuration-profiles-plugin.test"
    });

    const auditReport = ConfigurationProfiles.getAuditReport();
    expect(auditReport).toMatchObject({
      total: 1,
      allowed: 0,
      denied: 1,
      byAction: { "runtime.mutate": 1 },
      byOrigin: { test: 1 },
      byRole: { public: 1 }
    });

    auditReport.decisions[0]?.missingCapabilities.push("mutated.capability");
    expect(ConfigurationProfiles.getAuditLog()[0]?.missingCapabilities).not.toContain("mutated.capability");

    const roleReport = ConfigurationProfiles.getRoleCapabilityReport();
    const adminReport = roleReport.find((item) => item.role === "admin");
    expect(adminReport?.capabilities).toContain("runtime.mutate");
    adminReport?.capabilities.push("mutated.capability");
    expect(ConfigurationProfiles.getRoleCapabilities("admin")).not.toContain("mutated.capability");

    const matrix = ConfigurationProfiles.getCapabilityMatrix();
    expect(matrix.admin["runtime.mutate"]).toBe(true);
    matrix.admin["runtime.mutate"] = false;
    expect(ConfigurationProfiles.getCapabilityMatrix().admin["runtime.mutate"]).toBe(true);
  });

  it("enforces required access classes independently of capabilities", async () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const protectedApp = createTestManifest({
      bundleIdentifier: "com.example.team-gallery",
      type: "system",
      policy: {
        requiresLogin: true,
        requiredAccessClasses: ["team"]
      }
    });
    const externalSubject = {
      ...createSubject("betaTester", ["app.open.protected", "diagnostics.view"], true),
      loginSession: {
        isAuthorised: true,
        status: "unlocked" as const,
        synId: "external@example.com",
        accessClass: "external" as const,
        displayName: "External"
      }
    };
    const teamSubject = {
      ...createSubject("betaTester", ["app.open.protected", "diagnostics.view"], true),
      loginSession: {
        isAuthorised: true,
        status: "unlocked" as const,
        synId: "owner@example.test",
        accessClass: "team" as const,
        displayName: "Kavish"
      }
    };

    expect(ConfigurationProfiles.evaluate({
      action: "route.open",
      app: protectedApp,
      ...asPolicySubject(ConfigurationProfiles, externalSubject),
      origin: "test"
    })).toMatchObject({
      allowed: false,
      missingAccessClasses: ["team"]
    });

    expect(ConfigurationProfiles.evaluate({
      action: "route.open",
      app: protectedApp,
      ...asPolicySubject(ConfigurationProfiles, teamSubject),
      origin: "test"
    })).toMatchObject({
      allowed: true,
      matchedAccessClasses: ["team"]
    });
  });

  it("checks plugin registration policy before storing or invoking plugin hooks", async () => {
    const { PluginRegistry, ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const publicSubject = createSubject("public", ["app.open.public"], false);
    const register = vi.fn();

    ConfigurationProfiles.clearAuditLog();

    await expect(
      PluginRegistry.register(
        { id: "denied-plugin", name: "Denied Plugin", version: "1.0.0", register },
        { ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test", source: "configuration-profiles-plugin.test" }
      )
    ).rejects.toThrow(/denied-plugin/);

    expect(register).not.toHaveBeenCalled();
    expect(PluginRegistry.getPlugin("denied-plugin")).toBeNull();
    expect(ConfigurationProfiles.getAuditLog().at(-1)).toMatchObject({
      action: "plugin.register",
      allowed: false,
      origin: "test",
      missingCapabilities: ["plugin.register"]
    });
  });

  it("preserves existing plugin registration calls that pass a runtime object", async () => {
    const { PluginRegistry, ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const runtime = { name: "Runtime Fixture" };
    const register = vi.fn();

    ConfigurationProfiles.clearAuditLog();

    const record = await PluginRegistry.register(
      { id: "legacy-plugin", name: "Legacy Plugin", version: "1.0.0", register },
      runtime,
      asPolicySubject(ConfigurationProfiles, createSubject("system", ["*"]))
    );

    expect(record).toMatchObject({ status: "enabled" });
    expect(register).toHaveBeenCalledWith(runtime);
    expect(PluginRegistry.getPlugin("legacy-plugin")).toBe(record);
    expect(ConfigurationProfiles.getAuditLog().at(-1)).toMatchObject({
      action: "plugin.register",
      allowed: true,
      origin: "runtime",
      subjectRole: "system",
      matchedCapabilities: ["plugin.register"]
    });
  });
});
