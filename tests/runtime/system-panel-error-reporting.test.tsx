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
import { act, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { SystemPanelsLayer } from "../../src/Webspring/SystemPanelsLayer";
import { WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { createTestRuntime } from "./helpers";

vi.mock("../../src/Webspring/WindowLayer", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/Webspring/WindowLayer")>();
  return {
    ...original,
    createTransientWindowSurfaceBridge: () => ({
      present: () => Promise.reject(new Error("Panel host unavailable")),
      dismiss: async () => {},
      dispose: () => {},
    }),
  };
});

it("reports failed system panel presentation through the runtime error manager", async () => {
  const runtime = createTestRuntime({ id: "runtime:system-panel-error" });
  const capture = vi.spyOn(runtime.errors, "capture");
  const view = render(<SynCloudOSProvider runtime={runtime}><SystemPanelsLayer windowContentRegistry={new WindowContentRendererRegistry()} /></SynCloudOSProvider>);
  try {
    await act(async () => { await runtime.commands.dispatch("system.showFonts", undefined, { source: "toolbar" }); });
    await waitFor(() => expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      code: "APP_CONTENT_FAILED", source: "Webspring.SystemPanelsLayer",
      error: expect.objectContaining({ message: "Panel host unavailable" }), recoverable: true,
      context: expect.objectContaining({ operation: "present" }),
    })));
  } finally {
    view.unmount();
    capture.mockRestore();
    runtime.dispose("test");
  }
});
