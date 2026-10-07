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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Routing II host ownership", () => {
  it("does not install a global React Router provider or import react-router-dom", () => {
    const source = readFileSync(
      new URL("../../src/SynCloudOSReact/browserRuntime.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\bBrowserRouter\b/u);
    expect(source).not.toMatch(/from\s+["']react-router-dom["']/u);
  });

  it("does not declare React Router as a direct runtime dependency", () => {
    const manifest = JSON.parse(readFileSync(
      new URL("../../package.json", import.meta.url),
      "utf8",
    )) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["react-router-dom"]).toBeUndefined();
  });
});
