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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEModalDialog } from "../../src/NSE/Containers";
import { NSEFocusPortProvider } from "../../src/NSE/Focus";
import { SynCloudOSProvider, useRuntimeNSEFocusPort } from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";

afterEach(cleanup);

function RuntimeModal() {
  const port = useRuntimeNSEFocusPort("runtime");
  return (
    <NSEFocusPortProvider port={port}>
      <NSEModalDialog open title="Runtime modal">Modal body</NSEModalDialog>
    </NSEFocusPortProvider>
  );
}

describe("NSEModalDialog focus ownership", () => {
  it("retains runtime logical authority when its shell is portalled", () => {
    const runtime = createTestRuntime();
    render(<SynCloudOSProvider runtime={runtime}><RuntimeModal /></SynCloudOSProvider>);
    const dialog = screen.getByRole("dialog", { name: "Runtime modal" });
    const scope = dialog.closest<HTMLElement>("[data-syncloudos-focus-scope]");
    expect(scope?.dataset.syncloudosFocusScope).toMatch(/^nse-modal-dialog:/);
    expect(scope?.dataset.syncloudosRuntimeOwner).toBe(runtime.runtimeId);
  });
});
