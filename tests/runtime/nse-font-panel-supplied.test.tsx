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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NSEFontLibrary } from "../../src/NSE/Typography/NSEFontLibrary";
import { NSEFontManager } from "../../src/NSE/Typography/NSEFontManager";
import { NSEFontPanel, type NSEFontPanelCommandPort } from "../../src/NSE/Typography/NSEFontPanel";
import { NSEOverlayProvider } from "../../src/NSE/Overlays/NSEOverlayProvider";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact/SynCloudOSProvider";
import { useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact/nseFocusPort";
import { typographyFontFamilies } from "../fixtures/typographyFontFamilies";
import { createTestRuntime } from "./helpers";
import { normaliseTextShadow } from "../../src/NSE/Text/textAttributes";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { cleanup(); for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose("test"); });
function Harness({ children }: { children: React.ReactNode }) {
  const port = useRuntimeNSEOverlayPort("workspace");
  return <NSEOverlayProvider runtimePort={port} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}
function mountPanel(manager: NSEFontManager) {
  const runtime = createTestRuntime(); runtimes.push(runtime);
  const execute = vi.fn<NSEFontPanelCommandPort["execute"]>(async () => ({ status: "executed" as const }));
  render(<SynCloudOSProvider runtime={runtime}><Harness><NSEFontPanel open anchor={null} manager={manager} commandPort={{ execute }} onOpenChange={() => undefined} /></Harness></SynCloudOSProvider>);
  return execute;
}
it("renders an empty unavailable font selection without crashing or dispatching a font", () => {
  const execute = mountPanel(new NSEFontManager({ library: null }));
  expect(screen.queryByText(/No fonts available/)).not.toBeNull();
  expect((screen.getByRole("spinbutton", { name: "Font size" }) as HTMLInputElement).disabled).toBe(true);
  expect(within(screen.getByRole("grid", { name: "Font family" })).queryAllByRole("gridcell")).toHaveLength(0);
  expect(execute).not.toHaveBeenCalled();
});
it("lists only supplied metadata and dispatches its selected font through the existing command port", async () => {
  const execute = mountPanel(new NSEFontManager({ families: typographyFontFamilies, library: null }));
  expect(screen.queryByText("Prelude")).toBeNull();
  fireEvent.click(within(screen.getByRole("grid", { name: "Typeface" })).getByRole("gridcell", { name: "Bold Italic" }));
  await waitFor(() => expect(execute).toHaveBeenCalledWith("format.font", { fontId: "fixture.sans.bold-italic", size: 12 }, expect.any(AbortSignal)));
});
it("emits canonical shadow coordinates at a cardinal angle without negative zero", () => {
  const execute = mountPanel(new NSEFontManager({ families: typographyFontFamilies, library: null }));
  fireEvent.click(screen.getByRole("button", { name: "Text shadow" }));
  const dial = screen.getByRole("slider", { name: "Shadow angle" });
  fireEvent.keyDown(dial, { key: "Home" });
  for (let step = 0; step < 18; step++) fireEvent.keyDown(dial, { key: "ArrowRight" });
  const last = execute.mock.calls.at(-1)!;
  const shadow = (last[1] as { shadow: { colour: string; blur: number; offsetX: number; offsetY: number } }).shadow;
  expect(Object.is(shadow.offsetY, -0)).toBe(false);
  expect(normaliseTextShadow(shadow)).toEqual({ colour: "#0000007f", blur: 3, offsetX: 2, offsetY: 0 });
});
it("updates an initially empty panel after a font is registered and tolerates removing its last face", async () => {
  const release = vi.fn();
  const library = new NSEFontLibrary({ storage: null, preferences: null, faceHost: { register: async () => release } });
  const execute = mountPanel(new NSEFontManager({ library }));
  expect((screen.getByRole("spinbutton", { name: "Font size" }) as HTMLInputElement).disabled).toBe(true);
  const bytes = readFileSync(resolve("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"));
  let id = "";
  await act(async () => {
    const result = await library.addFonts([{ name: "Fixture.ttf", size: bytes.byteLength, arrayBuffer: async () => Uint8Array.from(bytes).buffer }]);
    expect(result.rejected).toEqual([]); id = result.added[0]!.id;
  });
  await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Font size" }) as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Remove font" }));
  await waitFor(() => expect(library.userPreset(id)).toBeUndefined());
  expect(release).toHaveBeenCalledOnce();
  expect((screen.getByRole("spinbutton", { name: "Font size" }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByText(/No fonts available/)).not.toBeNull();
  expect(execute).not.toHaveBeenCalled();
});
