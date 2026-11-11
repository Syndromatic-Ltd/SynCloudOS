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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rubberBandOffset } from "../../src/NSE/Scroll";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NSE scroll primitives", () => {






  it("damps rubber-band overscroll logarithmically (sign-preserving, sub-linear)", () => {
    expect(rubberBandOffset(0, 300)).toBe(0);
    expect(rubberBandOffset(300, 0)).toBe(0); // no dimension → no offset

    const pull = rubberBandOffset(300, 300);
    // 300 * 0.55 * log10(2) ≈ 49.67
    expect(pull).toBeCloseTo(49.67, 1);

    // Sign-preserving and symmetric.
    expect(rubberBandOffset(-300, 300)).toBeCloseTo(-pull, 5);

    // Pulling twice as far yields more offset, but less than double (logarithmic resistance).
    const farther = rubberBandOffset(600, 300);
    expect(farther).toBeGreaterThan(pull);
    expect(farther).toBeLessThan(pull * 2);
  });
});
