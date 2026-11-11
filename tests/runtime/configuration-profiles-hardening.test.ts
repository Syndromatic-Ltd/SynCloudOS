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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfigurationProfiles } from "../../src/SynCloudOS/ConfigurationProfiles/ConfigurationProfiles";
import { createRuntimeDiagnostics } from "../../src/SynCloudOS/Diagnostics/runtimeDiagnostics";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { SynCloudOSAppManifest } from "../../src/SynCloudOS/AppRegistry/appRegistryTypes";
import type { SynCloudOSAccessMode, SynCloudOSPolicy, SynCloudOSPolicyDecision, SynCloudOSPolicyRequest } from "../../src/SynCloudOS/ConfigurationProfiles/policyTypes";

afterEach(() => vi.unstubAllEnvs());
function fixture(mode: SynCloudOSAccessMode | null = "mixed", capabilities: readonly string[] = []) {
  const diagnostics = createRuntimeDiagnostics();
  const runtime = {
    bundles: { getBundle: () => null },
    events: { publish() {} },
    store: { runtimeId: "hardening-review" },
    login: { getSnapshot: () => ({ isAuthorised: false, status: "locked", synId: null, accessClass: null, displayName: null }) },
    diagnostics,
  } as unknown as SynCloudOSRuntime;
  const engine = createConfigurationProfiles(runtime, {
    ...(mode === null ? {} : { accessMode: mode }),
    profile: { id: "hardening", roles: { public: ["app.open.public", ...capabilities] }, anonymousRole: "public", resolveRole: () => "public" },
  });
  return { engine, diagnostics };
}
function application(type: "internal" | "system" = "internal", requiredCapabilities: string[] = []): SynCloudOSAppManifest {
  return { bundleIdentifier: "com.example.hardening", type, policy: { public: true, requiredCapabilities } } as SynCloudOSAppManifest;
}

describe("configuration profile hardening", () => {
  it("R3 gives restrictions deep frozen data without freezing or mutating the original request or app", () => {
    const { engine } = fixture();
    const app = application("internal", ["missing.capability"]);
    const context = { details: { nested: ["unchanged"] } };
    const request: SynCloudOSPolicyRequest = { action: "app.launch", app, requiredCapabilities: ["app.open.public"], context };
    let projection: SynCloudOSPolicyRequest | undefined;
    engine.registerPolicy("tries-to-mutate", (observed, decision) => {
      projection = observed;
      try { observed.app!.policy!.requiredCapabilities!.splice(0); } catch { /* The isolated projection refuses mutation. */ }
      try { (observed.context!.details as typeof context.details).nested[0] = "changed"; } catch { /* The original context remains host-owned. */ }
      return decision;
    });
    expect(engine.authorise(request).allowed).toBe(false);
    expect(engine.authorise(request).allowed).toBe(false);
    expect(app.policy!.requiredCapabilities).toEqual(["missing.capability"]);
    expect(context.details.nested).toEqual(["unchanged"]);
    expect(projection).not.toBe(request);
    expect(projection!.app).not.toBe(app);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection!.app!.policy!.requiredCapabilities)).toBe(true);
    expect(Object.isFrozen((projection!.context!.details as typeof context.details).nested)).toBe(true);
    expect(Object.isFrozen(app.policy)).toBe(false);
    expect(Object.isFrozen(request.requiredCapabilities)).toBe(false);
  });
  it("R3 preserves an explicit opaque host grant in the restriction projection", () => {
    const { engine } = fixture();
    const grant = engine.issueSubject({ user: { id: "host", displayName: "Host", role: "system", isAuthenticated: true, isAnonymous: false }, role: "system", capabilities: ["*"], isAuthenticated: true }, { purpose: "hardening" });
    let projectedGrant: unknown;
    engine.registerPolicy("checks-grant", (request, decision) => { projectedGrant = request.subjectGrant; return decision; });
    expect(engine.authorise({ action: "runtime.mutate", subjectGrant: grant }).allowed).toBe(true);
    expect(projectedGrant).toBe(grant);
  });
  it.each([
    ["throwing getter", () => Object.defineProperty({}, "allowed", { get() { throw new Error("secret getter"); } })],
    ["throwing proxy", () => new Proxy({}, { get() { throw new Error("secret proxy"); } })],
    ["throwing reason", () => Object.defineProperty({ allowed: true }, "reason", { get() { throw new Error("secret reason"); } })],
  ] as const)("R3 fails closed and audits a %s returned by a restriction", (_name, returned) => {
    const { engine, diagnostics } = fixture();
    engine.registerPolicy("bad-result", (() => returned()) as SynCloudOSPolicy);
    const decision = engine.authorise({ action: "runtime.inspect", source: "safe-source" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Registered restriction failed closed.");
    expect(diagnostics.policyDecisions.entries().at(-1)).toMatchObject({ id: decision.id, action: "runtime.inspect", source: "safe-source", allowed: false });
    expect(JSON.stringify(diagnostics.policyDecisions.entries())).not.toContain("secret");
  });
  it("R3 ignores restriction attempts to rewrite provenance and records the denial trace", () => {
    const { engine } = fixture();
    engine.registerPolicy("rewrite", (_request, decision) => ({ ...decision, id: "forged", action: "forged", subjectRole: "system", appId: "forged", allowed: false, reason: "Restricted." }));
    const decision = engine.authorise({ action: "runtime.inspect", app: application(), source: "original" });
    expect(decision).toMatchObject({ action: "runtime.inspect", subjectRole: "public", appId: "com.example.hardening", source: "original", allowed: false });
    expect(decision.id).not.toBe("forged");
    expect(decision.trace.at(-1)).toMatchObject({ step: "policy.registered.rewrite", result: "deny" });
  });
  it.each(["fullyLocked", "enterprisePrivate", "developer", "webspringVisibleAppProtected"] as const)("R2 applies %s login requirements before the system-app branch", mode => {
    const { engine } = fixture(mode, ["diagnostics.view"]);
    for (const action of ["app.launch", "route.open"]) expect(engine.authorise({ action, app: application("system") }).allowed).toBe(false);
  });
  it("R2 preserves explicit public diagnostics in mixed mode", () => {
    expect(fixture("mixed", ["diagnostics.view"]).engine.authorise({ action: "app.launch", app: application("system") }).allowed).toBe(true);
  });
  it("R2 rejects an invalid boot mode before granting any action", () => {
    expect(() => fixture("fullyLokced" as SynCloudOSAccessMode)).toThrow(TypeError);
  });
  it("R2 rejects an invalid environment access mode", () => {
    vi.stubEnv("VITE_SYNCLOUDOS_ACCESS_MODE", "fullyLokced");
    expect(() => fixture(null)).toThrow(TypeError);
  });
  it("R2 rejects an invalid mode update while retaining the last valid restriction", () => {
    const { engine } = fixture("fullyLocked");
    expect(() => engine.setAccessMode("fullyLokced" as SynCloudOSAccessMode)).toThrow(TypeError);
    expect(engine.getAccessMode()).toBe("fullyLocked");
    expect(engine.authorise({ action: "app.launch", app: application() }).allowed).toBe(false);
  });
  it("R8 redacts URL credentials, query and fragment data inside context values", () => {
    const { engine } = fixture();
    engine.authorise({ action: "external.open", context: { resourceURL: "https://user:password@example.com/path?token=secret#secret", returnPath: "/workspace?code=secret#secret", description: "Fetch https://user:password@example.com/file?token=secret now.", appId: "safe-app" } });
    const audit = JSON.stringify(engine.getAuditLog());
    expect(audit).not.toMatch(/password|secret|user:/);
    expect(audit).toContain("https://example.com/path");
    expect(audit).toContain("safe-app");
  });
  it.each(["api_key", "api-key", "privateKey", "private_key", "passphrase", "authorisation", "authorization", "session-key", "client_secret", "credential"])("R8 redacts credential field %s", key => {
    const { engine } = fixture();
    engine.authorise({ action: "runtime.inspect", context: { [key]: "must-not-be-retained" } });
    expect(engine.getAuditLog()[0].contextSummary!.values[key]).toBe("[redacted]");
    expect(JSON.stringify(engine.getAuditLog())).not.toContain("must-not-be-retained");
  });
});