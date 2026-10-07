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

import type { SynCloudOSPolicyProfile } from "../../src/SynCloudOS/PolicyKit/policyTypes";

/** Explicit host policy for framework tests. These role names are fixture inputs, not framework defaults. */

const transferCapabilities = [
  "transfer.same-application",
  "transfer.cross-application",
  "web-content.load",
  "web-content.navigate",
  "web-content.message",
  "web-content.external",
];

const documentStoreCapabilities = [
  "documentStore.drafts.read",
  "documentStore.draft.write",
  "documentStore.revision.create",
  "documentStore.publish",
  "documentStore.unpublish",
  "documentStore.media.write",
];

const staffCapabilities = [
  "webspring.display",
  "route.open.public",
  "app.open.public",
  "app.open.protected",
  "diagnostics.view",
  "runtime.inspect",
];

const founderSynId = "owner@example.test";

const profile: SynCloudOSPolicyProfile = {
  id: "framework-test-host",
  roles: Object.freeze({
    public: ["webspring.display", "route.open.public", "app.open.public", "runtime.inspect.public"],
    betaTester: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected", "runtime.inspect.public",
      "transfer.same-application", "web-content.load", "web-content.navigate", "web-content.message", "web-content.external"],
    employee: [...staffCapabilities, ...documentStoreCapabilities, ...transferCapabilities],
    admin: [...staffCapabilities, "runtime.configure", ...documentStoreCapabilities, ...transferCapabilities],
    founder: [...staffCapabilities, "runtime.configure", "runtime.system", ...documentStoreCapabilities, ...transferCapabilities],
  }),
  anonymousRole: "public",
  resolveRole(session, claimedRole) {
    if (!session.isAuthorised) return "public";
    if (claimedRole === "admin" || claimedRole === "founder") return claimedRole;
    if (session.synId === founderSynId && session.accessClass !== "external") return "founder";
    return session.accessClass === "team" ? "employee" : "betaTester";
  },
  accessClassCapabilities(accessClass) {
    return accessClass === "team" ? ["app.open.protected", "diagnostics.view", "runtime.inspect"] : [];
  },
  sessionAccessClass(claimedRoles) {
    return claimedRoles.some((role) => role === "employee" || role === "admin" || role === "founder") ? "team" : "external";
  },
};

export const testPolicyProfile: SynCloudOSPolicyProfile = Object.freeze(profile);
