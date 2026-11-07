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
import type { SynCloudOSPolicySubject } from "../../src/SynCloudOS/ConfigurationProfiles/policyTypes";
import { createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

function subject(role: SynCloudOSPolicySubject["role"], capabilities: string[]): SynCloudOSPolicySubject {
  return {
    user: { id: `forged.${role}`, displayName: role, role, isAuthenticated: true, isAnonymous: false },
    role,
    capabilities,
    isAuthenticated: true,
  };
}

const systemSubject = subject("system", ["*"]);
const employeeSubject = subject("employee", ["app.open.protected"]);
const protectedApp = createTestManifest({
  bundleIdentifier: "com.example.grant-protected-app",
  policy: { requiresLogin: true, requiredRoles: ["employee"], requiredCapabilities: ["app.open.protected"] },
});

describe("ConfigurationProfiles host-bound subject authority", () => {
  it("never grants authority from caller-supplied origin, source or subject metadata", () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const forged = [
      { origin: "test", source: "configuration-profiles-subject-grants.test" },
      { origin: "hostContribution", source: "host:forged" },
      { origin: "runtime", source: "PluginRegistry.register" },
      { origin: "developerConsole", source: "DeveloperConsole" },
    ];
    for (const metadata of forged) {
      expect(ConfigurationProfiles.authorise({ action: "runtime.mutate", subject: systemSubject, ...metadata }).allowed).toBe(false);
      expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, subject: employeeSubject, ...metadata }).allowed).toBe(false);
    }
  });

  it("evaluates a request as the granted subject only with a grant this ConfigurationProfiles issued", () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const grant = ConfigurationProfiles.issueSubject(employeeSubject, { purpose: "test" });
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, subjectGrant: grant }).allowed).toBe(true);
    // A structurally identical object is not the grant.
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, subjectGrant: { ...grant } }).allowed).toBe(false);
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, subjectGrant: { purpose: "test" } }).allowed).toBe(false);
  });

  it("ignores a grant issued by another runtime's ConfigurationProfiles", () => {
    const issuing = createRuntimeHarness(createTestRuntime()).ConfigurationProfiles;
    const other = createRuntimeHarness(createTestRuntime()).ConfigurationProfiles;
    const grant = issuing.issueSubject(systemSubject, { purpose: "test" });
    expect(issuing.authorise({ action: "runtime.mutate", subjectGrant: grant }).allowed).toBe(true);
    expect(other.authorise({ action: "runtime.mutate", subjectGrant: grant }).allowed).toBe(false);
  });

  it("stops honouring a revoked grant and freezes the granted subject at issue", () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const mutable = subject("employee", ["app.open.protected"]);
    const grant = ConfigurationProfiles.issueSubject(mutable, { purpose: "test" });
    mutable.role = "public";
    mutable.capabilities.length = 0;
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, subjectGrant: grant }).allowed).toBe(true);
    expect(ConfigurationProfiles.revokeSubject(grant)).toBe(true);
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, subjectGrant: grant }).allowed).toBe(false);
    expect(ConfigurationProfiles.revokeSubject(grant)).toBe(false);
  });

  it("requires a complete subject and a purpose to issue a grant", () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    expect(() => ConfigurationProfiles.issueSubject({ role: "system" } as SynCloudOSPolicySubject, { purpose: "test" })).toThrow(TypeError);
    expect(() => ConfigurationProfiles.issueSubject(systemSubject, { purpose: " " })).toThrow(TypeError);
  });

  it("does not let a caller-described subject ride on the plugin registry's own authority", async () => {
    const { ConfigurationProfiles, PluginRegistry } = createRuntimeHarness(createTestRuntime());
    const publicSubject = { ...subject("public", []), isAuthenticated: false };
    await expect(PluginRegistry.register(
      { id: "forged.plugin", name: "Forged", version: "1.0.0" },
      { subject: systemSubject, origin: "runtime", source: "PluginRegistry.register" },
    )).rejects.toThrow(/denied/);
    // Anonymous registration never acquires implicit host authority.
    await expect(PluginRegistry.register({ id: "host.plugin", name: "Host", version: "1.0.0" })).rejects.toThrow(/denied/);
    // A host that holds a grant can register as a specific subject.
    const grant = ConfigurationProfiles.issueSubject(systemSubject, { purpose: "test" });
    await expect(PluginRegistry.register(
      { id: "granted.plugin", name: "Granted", version: "1.0.0" },
      { subject: publicSubject, subjectGrant: grant },
    )).resolves.toMatchObject({ status: "enabled" });
  });
});
