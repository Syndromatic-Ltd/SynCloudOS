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

import { expect, it } from "vitest";
import { createTestRuntime } from "./helpers";
it("checks each named right, rejects unknown rights and retains each decision", () => {
 const runtime = createTestRuntime();
 const result = runtime.authorization.copyRights(["runtime.mutate", "diagnostics.view", "plugin.register"]);
 expect(result.allowed).toBe(false);
 expect(result.decisions).toHaveLength(3);
 expect(result.grantedRights).toEqual([]);
 expect(runtime.authorization.copyRights(["runtime.mtuate" as never]).allowed).toBe(false);
});
it("accepts explicit host grants and checks all requested rights", () => {
 const runtime = createTestRuntime();
 const grant = runtime.configurationProfiles.issueSubject({ user: { id: "host", displayName: "Host", role: "system", isAuthenticated: true, isAnonymous: false }, role: "system", capabilities: ["*"], isAuthenticated: true }, { purpose: "host" });
 expect(runtime.authorization.copyRights(["runtime.mutate", "plugin.register"], {subjectGrant: grant})).toMatchObject({allowed:true, grantedRights:["runtime.mutate", "plugin.register"]});
 runtime.configurationProfiles.revokeSubject(grant);
 expect(runtime.authorization.copyRights(["runtime.mutate"], {subjectGrant: grant}).allowed).toBe(false);
});


it("rejects known configuration actions that are not named rights", () => {
 const runtime=createTestRuntime();
 expect(runtime.authorization.copyRights(["runtime.inspect" as never]).allowed).toBe(false);
});
