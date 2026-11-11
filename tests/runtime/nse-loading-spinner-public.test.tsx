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
import * as nse from "@syndromatic/syncloudos/nse";
import * as systemUI from "@syndromatic/syncloudos/nse/system-ui";
import type { LoadingSpinnerVariant } from "@syndromatic/syncloudos/nse/system-ui";
import { LoadingSpinner as ExistingLoadingSpinner } from "../../src/NSE/Components/LoadingSpinner";

afterEach(cleanup);

// These imports resolve through the SDK entry table used by the package build.
// No component or public module is mocked.
it("exports the system chrome's sprite spinner through nse/system-ui only", () => {
  expect(systemUI.LoadingSpinner).toBe(ExistingLoadingSpinner);
  // SynWare draws progress with NSEProgressIndicator.
  expect("LoadingSpinner" in nse).toBe(false);
  const variant: LoadingSpinnerVariant = "light";
  const rendered = render(<systemUI.LoadingSpinner variant={variant} label="" ariaLabel="Loading Example" />);
  const spinner = rendered.getByRole("status", { name: "Loading Example" });
  expect(spinner.classList.contains("nse-loading-spinner--light")).toBe(true);
  expect(spinner.querySelector(".nse-loading-spinner-sprite")).not.toBeNull();
});
