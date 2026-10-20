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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { defineWebspring, WebspringBoardView } from "../../src/Webspring/public";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestBundle, createTestManifest, createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("webspring-disabled-app-test");
});

it.each([
  { id: "board", component: WebspringBoardView },
])("keeps a disabled app visible, dimmed and described in $id", async ({ id, component }) => {
  const reason = "This application is being prepared.";
  const loadModule = vi.fn(() => Promise.resolve({ default: () => null }));
  const runtime = createTestRuntime({ initialBundles: [createTestBundle({
    ...createTestManifest({ bundleIdentifier: "com.example.preparing", displayName: "Preparing", policy: { public: true } }),
    disabled: true, disabledReason: reason,
  }, { loadModule })] });
  runtimes.push(runtime);
  await runtime.boot({ initialPathname: "/" });
  const shell = defineWebspring({
    manifest: {
      schemaVersion: 1, bundleIdentifier: "com.example.fixture.disabled-shell", version: "1.0.0", displayName: "Fixture",
      webspringShell: {
        views: [{ id, presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
        defaults: { desktop: id, tablet: id, mobile: id }, homeRoute: "/",
        branding: { name: { key: "host.name", fallback: "Fixture" } },
      },
    },
    components: { [id]: component },
  });
  render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider>);
  const button = screen.getByRole("button", { name: "Open Preparing" }) as HTMLButtonElement;
  expect(button.textContent).toContain("Preparing");
  expect(button.disabled).toBe(true);
  expect(button.classList.contains("is-disabled")).toBe(true);
  expect(button.getAttribute("aria-description")).toBe(reason);
  expect(button.title).toBe(reason);
  fireEvent.click(button);
  fireEvent.doubleClick(button);
  expect(runtime.store.getSnapshot().webspring.layout.isEditing).toBe(false);
  expect(loadModule).not.toHaveBeenCalled();

  await act(async () => {
    runtime.apps.registerBundle(createTestBundle({
      ...createTestManifest({ bundleIdentifier: "com.example.preparing", displayName: "Preparing", policy: { public: true } }),
      disabled: true, disabledReason: "A newer availability explanation.",
    }, { loadModule }));
  });
  expect(screen.getByRole("button", { name: "Open Preparing" }).getAttribute("aria-description")).toBe("A newer availability explanation.");
  expect(loadModule).not.toHaveBeenCalled();
});
