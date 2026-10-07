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

describe("instance-owned error records", () => {
  it("keeps captured errors scoped to their runtime and carries the owner id", () => {
    const first = createTestRuntime({ id: "runtime:error:first" });
    const second = createTestRuntime({ id: "runtime:error:second" });
    const error = first.errors.capture({
      code: "UNKNOWN_RUNTIME_ERROR",
      title: "First runtime",
      message: "Only the first runtime saw this.",
    });

    expect(error).toMatchObject({ runtimeId: first.runtimeId, message: "Only the first runtime saw this." });
    expect(first.errors.getLatest()).toEqual(error);
    expect(second.errors.getHistory()).toEqual([]);
  });
});
