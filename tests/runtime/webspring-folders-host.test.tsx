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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { defineWebspring, WebspringBoardView } from "../../src/Webspring/public";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("webspring-folders-host-test");
});

it("traps focus in an open folder under the standard host and returns it to the folder", async () => {
  const runtime = createTestRuntime({ initialBundles: ["alpha", "beta", "gamma"].map((id) => createTestBundle({ id, route: `/${id}` })) });
  runtimes.push(runtime);
  await runtime.boot({ initialPathname: "/" });
  const shell = defineWebspring({
    manifest: {
      schemaVersion: 1, id: "fixture.folders-shell", version: "1.0.0", title: "Fixture",
      webspringShell: {
        views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
        defaults: { desktop: "board", tablet: "board", mobile: "board" }, homeRoute: "/",
        branding: { name: { key: "host.name", fallback: "Fixture" } },
        folders: { editable: true, initial: [{ id: "folder.tools", title: { key: "folders.tools", fallback: "Tools" }, order: 0, apps: ["beta", "gamma"] }] },
      },
    },
    components: { board: WebspringBoardView },
  });
  render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider>);

  const folderButton = await screen.findByRole("button", { name: "Open folder Tools" });
  folderButton.focus();
  fireEvent.click(folderButton);
  const dialog = await screen.findByRole("dialog", { name: "Tools" });
  const beta = screen.getByRole("button", { name: "Open Beta" });
  const gamma = screen.getByRole("button", { name: "Open Gamma" });
  await waitFor(() => expect(document.activeElement).toBe(beta));

  // The launcher behind is out of reach while the folder is open.
  // (jsdom does not reflect `inert`; the scope sets it with aria-hidden.)
  const launcher = document.querySelector<HTMLElement>(".webspring-board-launcher")!;
  expect(launcher.closest("[aria-hidden='true']")).not.toBeNull();
  expect(dialog.closest("[aria-hidden='true']")).toBeNull();

  gamma.focus();
  fireEvent.keyDown(gamma, { key: "Tab" });
  expect(document.activeElement).toBe(beta);
  fireEvent.keyDown(beta, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(gamma);
  // Focus that escapes is drawn back in.
  act(() => folderButton.focus());
  expect(dialog.contains(document.activeElement)).toBe(true);

  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
  expect(launcher.closest("[aria-hidden='true']")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open folder Tools" })));
});
