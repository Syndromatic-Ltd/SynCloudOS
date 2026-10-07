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

import budgets from "../fixtures/conformance-performance-budgets.json";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import {
  runStructuralScenario,
} from "./structural-performance-scenario";

describe("WindowManager performance", () => {
  it("orders and queries 500 windows through indexes", async () => {
    const fixture = createWindowTestDependencies();
    const manager = fixture.manager;
    try {
      for (let index = 0; index < 50; index += 1) {
        await fixture.createDocument(`document-${index}`);
      }
      for (let index = 0; index < 500; index += 1) {
        const controller = manager.create(standardWindow(`window-${index}`, {
          documentId: `document-${index % 50}`,
          documentAssociationRole: "secondary",
        }));
        await manager.open(controller.id, { activate: false });
      }
      manager.resetDiagnostics();

      await runStructuralScenario({
        run: () => {
          for (let index = 0; index < 500; index += 1) {
            manager.order(`window-${index}`, "front");
            manager.list({ documentId: `document-${index % 50}` });
          }
          return manager.diagnostics();
        },
        assertStructural: (diagnostics) => {
          const budget = Reflect.get(budgets.portableCases, "windows.manager.order-query-500") as {
            windowCount: number;
            maxFullRegistryScans: number;
            maxQueryCandidateVisits: number;
            maxOrderPublications: number;
          } | undefined;
          expect(budget).toBeDefined();
          expect(diagnostics.controllerCount).toBe(budget!.windowCount);
          expect(diagnostics.fullRegistryScans).toBeLessThanOrEqual(budget!.maxFullRegistryScans);
          expect(diagnostics.queryCandidateVisits).toBeLessThanOrEqual(budget!.maxQueryCandidateVisits);
          expect(Reflect.get(diagnostics, "orderedCandidateVisits")).toBeLessThanOrEqual(budget!.maxQueryCandidateVisits);
          expect(diagnostics.orderPublications).toBeLessThanOrEqual(budget!.maxOrderPublications);
          expect(diagnostics.listenerDelta).toBe(0);
        },
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
