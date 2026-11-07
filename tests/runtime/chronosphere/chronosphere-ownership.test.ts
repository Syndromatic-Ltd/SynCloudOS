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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";

describe("Chronosphere presentation ownership", () => {
  it("publishes the permanent app integration entry and removes runtime presentation", () => {
    expect(synWareSdkEntries.chronosphere).toBe("src/SynCloudOS/AppSDK/Chronosphere/public.ts");
    expect(existsSync(resolve("src/SynCloudOS/Chronosphere"))).toBe(false);
    expect(existsSync(resolve("src/NSE/Chronosphere/Chronosphere.tsx"))).toBe(true);
  });

  it("keeps all NSE Chronosphere source independent of AppSDK context and types", () => {
    const root = resolve("src/NSE/Chronosphere");
    expect(existsSync(root)).toBe(true);
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.tsx?$/.test(file)) {
          expect(readFileSync(file, "utf8"), file).not.toMatch(/useSCOS|AppSDK\//);
        }
      }
    };
    visit(root);
  });
});
