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
import { validateGlobalKeyboardListeners } from "../../scripts/quality/architecture-boundaries.mjs";

describe("global keyboard listener boundary", () => {
  it("rejects direct, aliased, constant, and wrapper global keyboard listeners with TypeScript resolution", () => {
    const fixtures = [
      "raw-keyboard-direct.ts.fixture",
      "raw-keyboard-alias.ts.fixture",
      "raw-keyboard-constant.ts.fixture",
      "raw-keyboard-wrapper.ts.fixture",
      "raw-keyboard-destructured-alias.ts.fixture",
      "raw-keyboard-bind-alias.ts.fixture",
      "raw-keyboard-arrow-wrapper.ts.fixture",
      "raw-keyboard-transitive-remove.ts.fixture",
      "raw-keyboard-call-alias.ts.fixture",
      "raw-keyboard-apply-alias.ts.fixture",
      "raw-keyboard-reflect-apply.ts.fixture",
    ];
    const errors = validateGlobalKeyboardListeners({
      root: process.cwd(),
      files: fixtures.map((fixture) => `tests/fixtures/architecture-boundaries/${fixture}`),
    });
    for (const fixture of fixtures) {
      expect(errors.some((error) => error.startsWith(`tests/fixtures/architecture-boundaries/${fixture}:`)), fixture).toBe(true);
    }
    expect(errors.every((error) => error.includes("raw-global-keyboard-listener"))).toBe(true);
    expect(validateGlobalKeyboardListeners({ root: process.cwd(), files: ["tests/fixtures/architecture-boundaries/react-keyboard-allowed.tsx.fixture"] })).toEqual([]);
  });

  it("rejects every raw global keyboard listener in source", () => {
    const errors = validateGlobalKeyboardListeners({ root: process.cwd() });
    expect(errors).toEqual([]);
  }, 15_000);
});
