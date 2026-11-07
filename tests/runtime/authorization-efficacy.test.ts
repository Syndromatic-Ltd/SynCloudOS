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
import { createTestRuntime, createTestManifest } from "./helpers";

describe("authorisation efficacy regressions", () => {
  it("R1 denies unknown actions without explicit extension requirements", () => {
    expect(createTestRuntime().configurationProfiles.authorise({ action: "runtime.mtuate" }).allowed).toBe(false);
  });
  it("R2 ignores a request's attempt to weaken the boot access mode", () => {
    const runtime = createTestRuntime();
    expect(runtime.configurationProfiles.authorise({ action: "app.launch", app: createTestManifest(), accessMode: "public" }).allowed).toBe(false);
  });
  it.each(["runtime.inspect", "runtime.mutate", "diagnostics.view", "webspring.enter", "external.open"])("R2 checks roles and classes before %s returns", action => {
    const runtime = createTestRuntime();
    const grant = runtime.configurationProfiles.issueSubject({ user: { id: "admin", displayName: "Admin", role: "admin", isAuthenticated: true, isAnonymous: false }, role: "admin", capabilities: ["*"], isAuthenticated: true }, { purpose: "regression" });
    expect(runtime.configurationProfiles.authorise({ action, subjectGrant: grant, requiredRoles: ["employee"], requiredAccessClasses: ["team"] }).allowed).toBe(false);
  });
  it("R2 does not use developer origin as authority", () => {
    expect(createTestRuntime().configurationProfiles.authorise({ action: "webspring.enter", origin: "developerConsole" }).allowed).toBe(false);
  });
  it("R2 checks login on external app routes", () => {
    const runtime = createTestRuntime();
    expect(runtime.configurationProfiles.authorise({ action: "route.open", app: createTestManifest({ type: "external", policy: { requiresLogin: true } }) }).allowed).toBe(false);
  });
  it("R3 does not allow a restriction to elevate a denied action", () => {
    const runtime = createTestRuntime();
    runtime.configurationProfiles.registerPolicy("elevate", (_request, decision) => ({ ...decision, allowed: true }));
    expect(runtime.configurationProfiles.authorise({ action: "runtime.mutate" }).allowed).toBe(false);
  });
  it("R3 denies and audits throwing restrictions", () => {
    const runtime = createTestRuntime();
    runtime.configurationProfiles.registerPolicy("throws", () => { throw new Error("secret-token"); });
    expect(runtime.configurationProfiles.authorise({ action: "runtime.inspect" }).allowed).toBe(false);
    expect(runtime.configurationProfiles.getAuditLog().at(-1)?.allowed).toBe(false);
    expect(JSON.stringify(runtime.configurationProfiles.getAuditLog())).not.toContain("secret-token");
  });
  it("R4 revokes issued authority after disposal", () => {
    const runtime = createTestRuntime();
    const grant = runtime.configurationProfiles.issueSubject({ user: { id: "system", displayName: "System", role: "system", isAuthenticated: true, isAnonymous: false }, role: "system", capabilities: ["*"], isAuthenticated: true }, { purpose: "regression" });
    runtime.configurationProfiles.dispose();
    expect(runtime.configurationProfiles.authorise({ action: "runtime.mutate", subjectGrant: grant }).allowed).toBe(false);
  });
  it("R7 never silently elevates anonymous plugin registration", async () => {
    await expect(createTestRuntime().pluginRegistry.register({ id: "untrusted", name: "Untrusted", version: "1.0.0" })).rejects.toThrow(/denied/);
  });
  it("R8 removes credentials from audit context and URLs", () => {
    const runtime = createTestRuntime();
    runtime.configurationProfiles.authorise({ action: "external.open", href: "https://user:password@example.com/path?token=secret#secret", context: { accessToken: "secret-token", password: "secret-password", appId: "safe" } });
    const audit = JSON.stringify(runtime.configurationProfiles.getAuditLog());
    expect(audit).not.toMatch(/secret|user:password/);
    expect(audit).toContain("safe");
  });
});

