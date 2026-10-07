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

import { NSEArrayController } from "../../src/NSE/Controllers";
import budgets from "../fixtures/conformance-performance-budgets.json";
import {
  runStructuralScenario,
} from "../performance/structural-performance-scenario";

it("selects in 50,000 items without rebuilding arranged content", async () => {
  const content = Array.from({ length: 50_000 }, (_, index) => ({
    id: `row-${index}`,
    value: index,
  }));
  const controller = new NSEArrayController({
    id: "performance",
    content,
    getId: (item) => item.id,
    selection: { mode: "multiple", allowsEmpty: true },
  });
  let selectLast = false;
  await runStructuralScenario({
    run: () => {
      const before = controller.getSnapshot();
      let publications = 0;
      const unsubscribe = controller.subscribeChanges(() => publications += 1);
      selectLast = !selectLast;
      const selectedId = selectLast ? "row-49999" : "row-0";
      controller.select([selectedId]);
      unsubscribe();
      return {
        before,
        after: controller.getSnapshot(),
        publications,
        selectedId,
      };
    },
    assertStructural: ({ before, after, publications, selectedId }) => {
      expect(after.arranged).toBe(before.arranged);
      expect(after.content).toBe(before.content);
      expect(after.changeSet).toBe(before.changeSet);
      expect(after.arrangementRevision).toBe(before.arrangementRevision);
      expect(after.selectionRevision).toBe(before.selectionRevision + 1);
      expect(after.selection.selectedIds).toEqual(new Set([selectedId]));
      expect(publications).toBeLessThanOrEqual(
        budgets.portableCases["models.array-controller.selection-50000"]
          .maxSelectionPublications,
      );
    },
  });
  controller.dispose();
});
