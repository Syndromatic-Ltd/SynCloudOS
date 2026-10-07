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

// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEMetalSurface } from "../../../src/NSE/Material/NSEMetalSurface";

afterEach(cleanup);

it("projects material semantics without source-path or implementation-lineage diagnostics", () => {
  const { container } = render(<NSEMetalSurface mode="light">Content</NSEMetalSurface>);
  const surface = container.querySelector('[data-nse-material="metal"]')!;
  expect(surface.textContent).toBe("Content");
  expect(surface.getAttribute("data-nse-metal-surface-recipe")).toBe("nse.sidebar.metal.surface");
  expect(Array.from(surface.attributes, (attribute) => attribute.name).filter((name) => /source-path|lineage/.test(name))).toEqual([]);
});
