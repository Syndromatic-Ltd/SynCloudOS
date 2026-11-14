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
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NSEApplication, NSEWindowController } from "../../src/NSE/Application";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppHosting/applicationClass";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { defineWebspring, WebspringBoardView } from "../../src/Webspring/public";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { authoriseTestRuntime, createTestRuntime, registerTestSynWare } from "./helpers";

it("moves one production Webspring window between stage and floating frames with its draft intact", async () => {
  const id = "com.example.stage-transfer";
  const didLoad = vi.fn();
  let controller: NSEWindowController | undefined;
  function Editor() {
    const [draft, setDraft] = useState("");
    return <input aria-label="Transfer draft" value={draft} onChange={event => setDraft(event.currentTarget.value)} />;
  }
  class Main extends NSEWindowController {
    static override view = Editor;
    override windowDidLoad() { controller = this; didLoad(); }
  }
  class Application extends NSEApplication { static override mainWindow = Main; }
  const runtime = authoriseTestRuntime(createTestRuntime());
  registerTestSynWare(runtime, createSynWareDefinitionFromApplicationClass(Application, {
    schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: "Stage transfer",

  }));
  const shell = defineWebspring({
    manifest: {
      schemaVersion: 1, bundleIdentifier: "com.example.transfer-shell", version: "1.0.0", displayName: "Transfer shell",
      webspringShell: {
        views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
        defaults: { desktop: "board", tablet: "board", mobile: "board" }, homeRoute: "/",
        branding: { name: { key: "transfer.shell.name", fallback: "Transfer shell" } },
      },
    },
    components: { board: WebspringBoardView },
  });
  await runtime.boot({ initialPathname: "/" });
  authoriseTestRuntime(runtime);
  const view = render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider>);
  try {
    await act(async () => { await runtime.launchServices.openApp(id, { source: "developer" }).result; });
    const draft = await screen.findByRole("textbox", { name: "Transfer draft" });
    const window = controller!.window;
    const windowId = window.id!;
    expect(windowId).toBeTruthy();
    expect(window.isFullScreen).toBe(true);
    expect(draft.closest(".webspring-app-view-fullbleed-content")).toBeTruthy();
    fireEvent.change(draft, { target: { value: "An unsaved draft" } });
    draft.focus();
    await act(async () => window.toggleFullScreen());
    expect(runtime.windows.select(windowId).record.fullScreen).toBe("off");
    expect([...document.querySelectorAll("[data-window-presentation-slot]")].map(slot => slot.closest("[data-window-host]")?.getAttribute("data-window-host"))).toContain(windowId);
    await waitFor(() => expect(draft.closest("[data-window-host]")?.getAttribute("data-window-host")).toBe(windowId));
    expect(screen.getByRole("textbox", { name: "Transfer draft" })).toBe(draft);
    expect(document.activeElement).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe("An unsaved draft");
    await act(async () => window.toggleFullScreen());
    await waitFor(() => expect(draft.closest(".webspring-app-view-fullbleed-content")).toBeTruthy());
    expect(controller!.window).toBe(window);
    expect(window.id).toBe(windowId);
    expect(didLoad).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Transfer draft" })).toBe(draft);
  } finally {
    view.unmount();
    await runtime.dispose("stage-transfer-test");
  }
});
