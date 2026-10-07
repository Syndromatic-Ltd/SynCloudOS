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
import { describe, expect, it } from "vitest";
import { createBrowserFilePickerPort } from "../../src/SynCloudOS/PlatformAdapters/BrowserFilePickerPort";
import { createBrowserFilePanelAdapter } from "../../src/SynCloudOS/FilePanels/BrowserFilePanelAdapter";
import { createFilePanelService } from "../../src/SynCloudOS/FilePanels/FilePanelService";
import type { OpenPanelRequest } from "../../src/SynCloudOS/FilePanels/filePanelTypes";

const request: OpenPanelRequest = { id: "insert-image", accepts: [{ description: "Images", mimeTypes: ["image/png", "image/jpeg"], extensions: [".png", ".jpg"] }], selection: "single-file", access: "read", requires: ["read"] };
const chooser = () => document.querySelector<HTMLInputElement>("input[type=file]");

describe("the browser file chooser behind the Open panel", () => {
  it("offers the request's types, returns the chosen file and leaves no input behind", async () => {
    const port = createBrowserFilePickerPort(window)!;
    const service = createFilePanelService([createBrowserFilePanelAdapter(port)]);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" });
    const opened = service.open(request);
    await Promise.resolve(); await Promise.resolve();
    const input = chooser()!;
    expect(input.accept).toBe("image/png,image/jpeg,.png,.jpg");
    expect(input.multiple).toBe(false);
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    const result = await opened;
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") await expect(result.values[0]!.kind === "ephemeral-file" && result.values[0]!.read()).resolves.toBe(file);
    expect(chooser()).toBeNull();
  });

  it("reports a dismissed chooser as cancelled and an aborted request as aborted", async () => {
    const port = createBrowserFilePickerPort(window)!;
    const cancelled = port.pickFiles(request, new AbortController().signal);
    chooser()!.dispatchEvent(new Event("cancel"));
    const selection = await cancelled;
    expect(selection.kind).toBe("cancelled");
    selection.cleanup();
    expect(chooser()).toBeNull();
    const controller = new AbortController();
    const aborted = port.pickFiles(request, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toBeDefined();
    expect(chooser()).toBeNull();
  });
});
