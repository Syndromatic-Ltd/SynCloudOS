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
import type { SynCloudOSPolicySubject } from "../../src/SynCloudOS/PolicyKit/policyTypes";
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
  id: "grant-protected-app",
  policy: { requiresLogin: true, requiredRoles: ["employee"], requiredCapabilities: ["app.open.protected"] },
});

describe("PolicyKit host-bound subject authority", () => {
  it("never grants authority from caller-supplied origin, source or subject metadata", () => {
    const { PolicyKit } = createRuntimeHarness(createTestRuntime());
    const forged = [
      { origin: "test", source: "policykit-subject-grants.test" },
      { origin: "hostContribution", source: "host:forged" },
      { origin: "runtime", source: "PluginRegistry.register" },
      { origin: "developerConsole", source: "DeveloperConsole" },
    ];
    for (const metadata of forged) {
      expect(PolicyKit.authorise({ action: "runtime.mutate", subject: systemSubject, ...metadata }).allowed).toBe(false);
      expect(PolicyKit.authorise({ action: "app.launch", app: protectedApp, subject: employeeSubject, ...metadata }).allowed).toBe(false);
    }
  });

  it("evaluates a request as the granted subject only with a grant this PolicyKit issued", () => {
    const { PolicyKit } = createRuntimeHarness(createTestRuntime());
    const grant = PolicyKit.issueSubject(employeeSubject, { purpose: "test" });
    expect(PolicyKit.authorise({ action: "app.launch", app: protectedApp, subjectGrant: grant }).allowed).toBe(true);
    // A structurally identical object is not the grant.
    expect(PolicyKit.authorise({ action: "app.launch", app: protectedApp, subjectGrant: { ...grant } }).allowed).toBe(false);
    expect(PolicyKit.authorise({ action: "app.launch", app: protectedApp, subjectGrant: { purpose: "test" } }).allowed).toBe(false);
  });

  it("ignores a grant issued by another runtime's PolicyKit", () => {
    const issuing = createRuntimeHarness(createTestRuntime()).PolicyKit;
    const other = createRuntimeHarness(createTestRuntime()).PolicyKit;
    const grant = issuing.issueSubject(systemSubject, { purpose: "test" });
    expect(issuing.authorise({ action: "runtime.mutate", subjectGrant: grant }).allowed).toBe(true);
    expect(other.authorise({ action: "runtime.mutate", subjectGrant: grant }).allowed).toBe(false);
  });

  it("stops honouring a revoked grant and freezes the granted subject at issue", () => {
    const { PolicyKit } = createRuntimeHarness(createTestRuntime());
    const mutable = subject("employee", ["app.open.protected"]);
    const grant = PolicyKit.issueSubject(mutable, { purpose: "test" });
    mutable.role = "public";
    mutable.capabilities.length = 0;
    expect(PolicyKit.authorise({ action: "app.launch", app: protectedApp, subjectGrant: grant }).allowed).toBe(true);
    expect(PolicyKit.revokeSubject(grant)).toBe(true);
    expect(PolicyKit.authorise({ action: "app.launch", app: protectedApp, subjectGrant: grant }).allowed).toBe(false);
    expect(PolicyKit.revokeSubject(grant)).toBe(false);
  });

  it("requires a complete subject and a purpose to issue a grant", () => {
    const { PolicyKit } = createRuntimeHarness(createTestRuntime());
    expect(() => PolicyKit.issueSubject({ role: "system" } as SynCloudOSPolicySubject, { purpose: "test" })).toThrow(TypeError);
    expect(() => PolicyKit.issueSubject(systemSubject, { purpose: " " })).toThrow(TypeError);
  });

  it("does not let a caller-described subject ride on the plugin registry's own authority", async () => {
    const { PolicyKit, PluginRegistry } = createRuntimeHarness(createTestRuntime());
    const publicSubject = { ...subject("public", []), isAuthenticated: false };
    await expect(PluginRegistry.register(
      { id: "forged.plugin", name: "Forged", version: "1.0.0" },
      { subject: systemSubject, origin: "runtime", source: "PluginRegistry.register" },
    )).rejects.toThrow(/denied/);
    // The registry's own default authority still registers.
    await expect(PluginRegistry.register({ id: "host.plugin", name: "Host", version: "1.0.0" })).resolves.toMatchObject({ status: "enabled" });
    // A host that holds a grant can register as a specific subject.
    const grant = PolicyKit.issueSubject(systemSubject, { purpose: "test" });
    await expect(PluginRegistry.register(
      { id: "granted.plugin", name: "Granted", version: "1.0.0" },
      { subject: publicSubject, subjectGrant: grant },
    )).resolves.toMatchObject({ status: "enabled" });
  });
});
