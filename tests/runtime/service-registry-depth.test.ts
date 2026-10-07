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
import { createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

describe("ServiceRegistry dependency depth and impact reports", () => {
  it("does not report healthy when a required service is missing", async () => {
    const { ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    const health = ServiceRegistry.getHealthReport(["missing.required"]);

    expect(health.ok).toBe(false);
    expect(health.health).toBe("unavailable");
    expect(health.missing).toEqual(["missing.required"]);
    expect(health.requiredReport).toMatchObject({
      ok: false,
      health: "unavailable",
      missing: ["missing.required"]
    });
  });

  it("preserves service capability metadata in report items", async () => {
    const { ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.registerService({
      id: "capability.service",
      displayName: "Capability Service",
      description: "Capability metadata fixture.",
      availability: "available",
      capabilities: ["capability.legacy"],
      providedCapabilities: ["capability.provided"],
      requiredCapabilities: ["runtime.system"],
      optionalCapabilities: ["diagnostics.view"],
      capabilityMetadata: { tier: "test", tags: ["fixture"] }
    });

    const item = ServiceRegistry.getServiceReport(["capability.service"]).items[0];

    expect(item).toMatchObject({
      serviceId: "capability.service",
      capabilities: ["capability.legacy"],
      providedCapabilities: ["capability.legacy", "capability.provided"],
      requiredCapabilities: ["runtime.system"],
      optionalCapabilities: ["diagnostics.view"],
      capabilityMetadata: { tier: "test", tags: ["fixture"] }
    });
  });

  it("reports direct and reverse graphs with dependency cycle paths", async () => {
    const { ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.registerMany([
      {
        id: "cycle.a",
        displayName: "Cycle A",
        description: "Cycle fixture A.",
        availability: "available",
        dependencies: ["cycle.b"]
      },
      {
        id: "cycle.b",
        displayName: "Cycle B",
        description: "Cycle fixture B.",
        availability: "available",
        dependencies: ["cycle.a"]
      }
    ]);

    const report = ServiceRegistry.getDependencyReport(["cycle.a"]);
    const service = ServiceRegistry.getServiceReport(["cycle.a"]).items[0];

    expect(report.ok).toBe(false);
    expect(report.directGraph["cycle.a"]).toEqual(["cycle.b"]);
    expect(report.reverseGraph["cycle.a"]).toEqual(["cycle.b"]);
    expect(report.transitiveDependencies["cycle.a"]).toEqual(["cycle.b"]);
    expect(report.transitiveDependents["cycle.a"]).toEqual(["cycle.b"]);
    expect(report.cyclePaths).toContainEqual(["cycle.a", "cycle.b", "cycle.a"]);
    expect(service).toMatchObject({
      serviceId: "cycle.a",
      available: false,
      health: "degraded",
      blockingServiceIds: ["cycle.b", "cycle.a"]
    });
  });

  it("carries transitive dependency blockers through required service reports", async () => {
    const { ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.registerMany([
      {
        id: "leaf.service",
        displayName: "Leaf Service",
        description: "Leaf dependency fixture.",
        availability: "available"
      },
      {
        id: "middle.service",
        displayName: "Middle Service",
        description: "Middle dependency fixture.",
        availability: "available",
        dependencies: ["leaf.service"]
      },
      {
        id: "root.service",
        displayName: "Root Service",
        description: "Root dependency fixture.",
        availability: "available",
        dependencies: ["middle.service"]
      }
    ]);

    ServiceRegistry.stopService("leaf.service");

    const report = ServiceRegistry.getServiceReport(["root.service"]);
    const dependencyReport = ServiceRegistry.getDependencyReport(["root.service"]);

    expect(report.ok).toBe(false);
    expect(report.health).toBe("degraded");
    expect(report.missing).toEqual(["root.service", "middle.service", "leaf.service"]);
    expect(report.items[0].blockingServiceIds).toEqual(["middle.service", "leaf.service"]);
    expect(dependencyReport.transitiveDependencies["root.service"]).toEqual(["middle.service", "leaf.service"]);
  });

  it("reports service impact across transitive services, apps, disabled apps, and blockers", async () => {
    const { AppRegistry, RuntimeController, ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.registerMany([
      {
        id: "impact.leaf",
        displayName: "Impact Leaf",
        description: "Impact leaf fixture.",
        availability: "available"
      },
      {
        id: "impact.middle",
        displayName: "Impact Middle",
        description: "Impact middle fixture.",
        availability: "available",
        dependencies: ["impact.leaf"]
      },
      {
        id: "impact.root",
        displayName: "Impact Root",
        description: "Impact root fixture.",
        availability: "available",
        dependencies: ["impact.middle"]
      }
    ]);
    AppRegistry.register(createTestManifest({ id: "impact-root-app", requiredServices: ["impact.root"] }));
    AppRegistry.register(createTestManifest({ id: "impact-leaf-app", requiredServices: ["impact.leaf"] }));

    ServiceRegistry.stopService("impact.leaf");

    const impact = ServiceRegistry.getImpactReport("impact.leaf");
    const snapshot = RuntimeController.getSnapshot();

    expect(impact.affectedServices).toEqual(["impact.middle", "impact.root"]);
    expect(impact.affectedApps.map((app) => app.appId)).toEqual(["impact-root-app", "impact-leaf-app"]);
    expect(impact.disabledApps.map((app) => app.appId)).toEqual(["impact-root-app", "impact-leaf-app"]);
    expect(impact.blockers).toContain("impact.leaf");
    expect(snapshot.appInfo["impact-root-app"].isDisabled).toBe(true);
    expect(snapshot.lifecycle["impact-root-app"]).toBe("disabled");
  });

  it("restores disabled app service state when an unavailable service comes back", async () => {
    const { AppRegistry, RuntimeController, ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.registerService({
      id: "restore.service",
      displayName: "Restore Service",
      description: "Restoration fixture.",
      availability: "available"
    });
    AppRegistry.register(createTestManifest({ id: "restore-app", requiredServices: ["restore.service"] }));

    ServiceRegistry.stopService("restore.service");

    expect(RuntimeController.getSnapshot().appInfo["restore-app"]).toMatchObject({
      hasAccessToRequiredServices: false,
      isDisabled: true,
      serviceStatus: { "restore.service": false }
    });
    expect(RuntimeController.getSnapshot().managers["restore-app"]).toMatchObject({
      disabled: true,
      lastError: "Required services unavailable: restore.service."
    });

    ServiceRegistry.startService("restore.service");

    expect(RuntimeController.getSnapshot().appInfo["restore-app"]).toMatchObject({
      hasAccessToRequiredServices: true,
      isDisabled: false,
      serviceStatus: { "restore.service": true }
    });
    expect(RuntimeController.getSnapshot().lifecycle["restore-app"]).toBe("registered");
    expect(RuntimeController.getSnapshot().managers["restore-app"]).toMatchObject({
      disabled: false,
      lastError: null
    });
  });

  it("keeps apps launchable when optional services change availability", async () => {
    const { AppRegistry, RuntimeController, ServiceRegistry } = createRuntimeHarness(createTestRuntime());

    ServiceRegistry.registerService({
      id: "optional.fixture",
      displayName: "Optional Fixture",
      description: "Optional service fixture.",
      availability: "available"
    });
    AppRegistry.register(createTestManifest({
      id: "optional-refresh-app",
      optionalServices: ["optional.fixture"]
    }));

    ServiceRegistry.stopService("optional.fixture");

    expect(RuntimeController.getSnapshot().appInfo["optional-refresh-app"]).toMatchObject({
      hasAccessToRequiredServices: true,
      isDisabled: false,
      optionalServiceStatus: { "optional.fixture": false },
      unavailableOptionalServices: ["optional.fixture"]
    });
    expect(RuntimeController.getSnapshot().lifecycle["optional-refresh-app"]).toBe("registered");
  });
});
