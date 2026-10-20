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
import { createPolicyKit } from "../../src/SynCloudOS/PolicyKit/PolicyKit";
import { testPolicyProfile } from "./testPolicyProfile";
import type { SynCloudOSPolicyProfile } from "../../src/SynCloudOS/PolicyKit/policyTypes";
import type { SynCloudOSIdentityUser } from "../../src/SynCloudOS/Identity/identityTypes";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createTestManifest, createTestRuntime, unlockRuntime } from "./helpers";

/** A second, independently branded host: a gallery with visitors, members and curators. */
const atelierProfile: SynCloudOSPolicyProfile = {
  id: "atelier",
  roles: {
    visitor: ["webspring.display", "route.open.public", "app.open.public"],
    member: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected"],
    curator: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected", "runtime.configure"],
  },
  anonymousRole: "visitor",
  resolveRole: (session, claimedRole) => {
    if (!session.isAuthorised) return "visitor";
    return claimedRole === "curator" ? "curator" : "member";
  },
};

type Session = { isAuthorised: boolean; accessClass?: "team" | "external" | null; synId?: string | null };

function policyKitFor(profile: SynCloudOSPolicyProfile | undefined, session: Session, claimedRole?: string) {
  const runtime = createTestRuntime();
  const snapshot = {
    isAuthorised: session.isAuthorised,
    status: session.isAuthorised ? "unlocked" : "locked",
    synId: session.synId ?? (session.isAuthorised ? "person@example.test" : null),
    accessClass: session.accessClass ?? null,
    displayName: session.isAuthorised ? "Person" : null,
  };
  const identity = {
    getCurrentUser: (): SynCloudOSIdentityUser | null => claimedRole === undefined ? null : {
      id: "person",
      displayName: "Person",
      role: claimedRole,
      isAuthenticated: session.isAuthorised,
      isAnonymous: !session.isAuthorised,
    },
  };
  return createPolicyKit(runtime, {
    profile: profile ?? testPolicyProfile,
    accessMode: "mixed",
    loginServices: { getSnapshot: () => snapshot } as unknown as Pick<SynCloudOSRuntime["login"], "getSnapshot">,
    identity: identity as unknown as Pick<SynCloudOSRuntime["identity"], "getCurrentUser">,
  });
}

const membersApp = createTestManifest({
  bundleIdentifier: "com.example.members-room",
  policy: { requiresLogin: true, requiredRoles: ["member"] },
});
const staffApp = createTestManifest({
  bundleIdentifier: "com.example.staff-room",
  policy: { requiresLogin: true, requiredRoles: ["employee"] },
});

describe("PolicyKit host policy profiles", () => {
  it("reports each host's own role taxonomy, with the framework's system role in both", () => {
    const testHost = policyKitFor(undefined, { isAuthorised: false });
    const atelier = policyKitFor(atelierProfile, { isAuthorised: false });
    expect(testHost.getRoleCapabilityReport().map((item) => item.role)).toEqual(
      ["public", "betaTester", "employee", "admin", "founder", "system"],
    );
    expect(atelier.getRoleCapabilityReport().map((item) => item.role)).toEqual(["visitor", "member", "curator", "system"]);
    expect(atelier.getRoleCapabilities("system")).toEqual(["*"]);
    expect(atelier.getRoleCapabilities("employee")).toEqual([]);
  });

  it("derives subjects through the host's profile", () => {
    expect(policyKitFor(atelierProfile, { isAuthorised: false }).getCurrentSubject().role).toBe("visitor");
    expect(policyKitFor(atelierProfile, { isAuthorised: true }).getCurrentSubject().role).toBe("member");
    expect(policyKitFor(atelierProfile, { isAuthorised: true }, "curator").getCurrentSubject().role).toBe("curator");
    // Another host's role name is not a role here; the session still resolves.
    expect(policyKitFor(atelierProfile, { isAuthorised: true }, "founder").getCurrentSubject().role).toBe("member");
    // Test host's team → employee derivation belongs to its profile only.
    expect(policyKitFor(undefined, { isAuthorised: true, accessClass: "team" }).getCurrentSubject().role).toBe("employee");
    const atelierTeam = policyKitFor(atelierProfile, { isAuthorised: true, accessClass: "team" }).getCurrentSubject();
    expect(atelierTeam.role).toBe("member");
    expect(atelierTeam.capabilities).not.toContain("diagnostics.view");
  });

  it("authorises the same manifests differently on each host", () => {
    expect(policyKitFor(atelierProfile, { isAuthorised: false }).evaluate({ action: "app.launch", app: membersApp }).allowed).toBe(false);
    expect(policyKitFor(atelierProfile, { isAuthorised: true }).evaluate({ action: "app.launch", app: membersApp }).allowed).toBe(true);
    expect(policyKitFor(atelierProfile, { isAuthorised: true, accessClass: "team" }).evaluate({ action: "app.launch", app: staffApp }).allowed).toBe(false);
    expect(policyKitFor(undefined, { isAuthorised: true, accessClass: "team" }).evaluate({ action: "app.launch", app: membersApp }).allowed).toBe(false);
    expect(policyKitFor(undefined, { isAuthorised: true, accessClass: "team" }).evaluate({ action: "app.launch", app: staffApp }).allowed).toBe(true);
    expect(policyKitFor(atelierProfile, { isAuthorised: true }, "curator").evaluate({ action: "runtime.mutate" }).allowed).toBe(true);
    expect(policyKitFor(atelierProfile, { isAuthorised: true }).evaluate({ action: "runtime.mutate" }).allowed).toBe(false);
  });

  it("accepts capability registrations only for the host's roles", () => {
    const atelier = policyKitFor(atelierProfile, { isAuthorised: true });
    expect(() => atelier.registerRoleCapabilities({ roles: ["employee"], capabilities: ["gallery.hang"] })).toThrow(/Unknown policy role/);
    const registration = atelier.registerRoleCapabilities({ roles: ["member"], capabilities: ["gallery.visit"] });
    expect(atelier.getCurrentSubject().capabilities).toContain("gallery.visit");
    registration.dispose();
    expect(atelier.getCurrentSubject().capabilities).not.toContain("gallery.visit");
  });

  it("rejects profiles that would redefine the framework's system role or omit their anonymous role", () => {
    expect(() => policyKitFor({ ...atelierProfile, roles: { ...atelierProfile.roles, system: ["app.open.public"] } }, { isAuthorised: false }))
      .toThrow(/system/);
    expect(() => policyKitFor({ ...atelierProfile, anonymousRole: "guest" }, { isAuthorised: false })).toThrow(/anonymous/);
  });

  it("fails closed when a profile resolves a role it did not declare", () => {
    const careless: SynCloudOSPolicyProfile = { ...atelierProfile, resolveRole: () => "system" };
    const subject = policyKitFor(careless, { isAuthorised: true }).getCurrentSubject();
    expect(subject.role).toBe("visitor");
    expect(subject.capabilities).not.toContain("*");
  });

  it("maps a signed-in session's role claims through the host's profile", async () => {
    // The test identity session claims roles "employee".
    const testHost = createTestRuntime();
    unlockRuntime(testHost);
    await testHost.identity.session.refresh();
    expect(testHost.login.getSnapshot().accessClass).toBe("team");
    expect(testHost.policy.getCurrentSubject().role).toBe("employee");

    const atelier = createTestRuntime({ policyProfile: atelierProfile });
    unlockRuntime(atelier);
    await atelier.identity.session.refresh();
    expect(atelier.login.getSnapshot().accessClass).toBe("external");
    expect(atelier.identity.getCurrentUser().role).toBe("member");
    expect(atelier.policy.getCurrentSubject().role).toBe("member");
  });

  it("uses explicit test policy without replacing another host profile", () => {
    expect(testPolicyProfile.id).toBe("framework-test-host");
    const runtime = createTestRuntime({ policyProfile: atelierProfile });
    expect(runtime.policy.getRoleCapabilityReport().map((item) => item.role)).toEqual(["visitor", "member", "curator", "system"]);
    expect(createTestRuntime().policy.getRoleCapabilityReport().map((item) => item.role)).toContain("betaTester");
  });
});
