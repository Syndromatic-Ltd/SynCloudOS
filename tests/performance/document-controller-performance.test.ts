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

import { makeDocumentControllerFixture } from "../fixtures/documentTestDependencies";
import {
  runStructuralScenario,
} from "./structural-performance-scenario";

describe("DocumentController performance", () => {
  it("restores 100 memory documents without quadratic lookup", async () => {
    await runStructuralScenario({
      run: async () => {
        const fixture = await makeDocumentControllerFixture({ documentCount: 100 });
        try {
          const report = await fixture.controller.restoreSession(fixture.snapshot);
          return {
            report,
            readCount: fixture.adapter.readCount,
            openDocumentIds: fixture.controller.openDocuments.map(({ id }) => id),
          };
        } finally {
          await fixture.cleanup();
        }
      },
      assertStructural: ({ report, readCount, openDocumentIds }) => {
        expect(report.failures).toEqual([]);
        expect(report.restoredDocumentIds).toHaveLength(100);
        expect(new Set(report.restoredDocumentIds).size).toBe(100);
        expect(openDocumentIds).toEqual(report.restoredDocumentIds);
        expect(readCount).toBe(100);
      },
    });
  });
});
