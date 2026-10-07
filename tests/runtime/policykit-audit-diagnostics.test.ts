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
import { createTestRuntime } from "./helpers";

describe("PolicyKit audit as bounded runtime diagnostics", () => {
  it("records authorised decisions in the runtime's non-reactive diagnostic log", () => {
    const runtime = createTestRuntime();
    let publications = 0;
    const unsubscribe = runtime.store.subscribe(() => { publications += 1; });
    runtime.policy.clearAuditLog();
    runtime.policy.authorise({ action: "runtime.mutate", source: "audit-test" });
    runtime.policy.evaluate({ action: "runtime.mutate", source: "not-audited" });
    unsubscribe();

    expect(publications).toBe(0);
    expect(runtime.diagnostics.policyDecisions.entries().map((decision) => decision.source)).toEqual(["audit-test"]);
    expect(runtime.policy.getAuditLog().map((decision) => decision.source)).toEqual(["audit-test"]);
  });

  it("bounds the audit by entries and estimated bytes, projecting oversized traces", () => {
    const runtime = createTestRuntime();
    for (let index = 0; index < 120; index += 1) {
      runtime.policy.registerPolicy(`noisy-${index}`, (_request, decision) => ({
        ...decision,
        reason: `Policy ${index} reviewed ${"a detailed rationale ".repeat(8)}`,
      }));
    }
    for (let index = 0; index < 250; index += 1) runtime.policy.authorise({ action: "runtime.inspect", source: `bulk-${index}` });

    const statistics = runtime.diagnostics.policyDecisions.statistics();
    expect(statistics.entries).toBeLessThanOrEqual(200);
    expect(statistics.estimatedBytes).toBeLessThanOrEqual(runtime.diagnostics.policyDecisions.maximumBytes);
    expect(statistics.projected).toBeGreaterThan(0);
    const latest = runtime.policy.getAuditLog(1)[0]!;
    expect(latest.source).toBe("bulk-249");
    expect(latest.trace.length).toBeLessThan(120);
    expect(latest.trace.at(-1)?.step).toBe("policy.trace.truncated");
  });

  it("hands callers mutable copies and clears through the log", () => {
    const runtime = createTestRuntime();
    runtime.policy.clearAuditLog();
    runtime.policy.authorise({ action: "runtime.mutate" });
    runtime.policy.getAuditLog()[0]!.missingCapabilities.push("mutated");
    expect(runtime.policy.getAuditLog()[0]!.missingCapabilities).not.toContain("mutated");
    runtime.policy.clearAuditLog();
    expect(runtime.diagnostics.policyDecisions.size).toBe(0);
  });
});
