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
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestLauncher, createTestWebspring } from "./webspringTestShell";
import { createTestRuntime } from "./helpers";

vi.mock("../../src/FrameworkTests/FrameworkTestHost", () => ({
  FrameworkTestHost: ({ pathname }: { readonly pathname: string }) => <div data-testid="lazy-framework-test-host">{pathname}</div>,
}));

const repositoryRoot = resolve(__dirname, "../..");
const hosts: MountedSynCloudOSHost[] = [];
const elements: HTMLElement[] = [];
const runtimes: ReturnType<typeof createTestRuntime>[] = [];

const shell = createTestWebspring({
  info: {
    bundleIdentifier: "com.example.webspring.mount-test",
    displayName: "Mount test",
    branding: { name: { key: "site.name", fallback: "Mount test" } },
  },
  launcher: createTestLauncher(() => <main data-testid="mounted-launcher" />, "persistent"),
});

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    await act(async () => { await host.dispose("browser-runtime-mount-test"); });
  }
  for (const element of elements.splice(0)) element.remove();
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("browser-runtime-mount-test");
  window.history.replaceState(null, "", "/");
});

describe("browser runtime direct host mounting", () => {
  it("deletes src/App.tsx", () => {
    expect(existsSync(resolve(repositoryRoot, "src/App.tsx"))).toBe(false);
  });

  it("moves the shell startup phase from presentationPending to presentationReady", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} />
      </SynCloudOSProvider>,
    );

    // Before boot completes, presentationPending holds the startup curtain.
    expect(screen.getByRole("status", { name: "Starting SynCloudOS" })).toBeTruthy();

    await act(async () => {
      runtime.store.mutate((draft) => {
        draft.booted = true;
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Starting SynCloudOS" })).toBeNull();
    });
  });

  it("lazy-mounts /__framework-tests/<name> only behind import.meta.env.DEV", async () => {
    const browserRuntimeSource = readFileSync(resolve(repositoryRoot, "src/SynCloudOSReact/browserRuntime.tsx"), "utf8");
    expect(browserRuntimeSource).toMatch(/import\.meta\.env\.DEV[\s\S]*import\(["']\.\.\/FrameworkTests\/FrameworkTestHost["']\)/u);

    window.history.replaceState(null, "", "/__framework-tests/sample-probe");
    const element = document.createElement("div");
    document.body.append(element);
    elements.push(element);

    await act(async () => {
      hosts.push(await mountSynCloudOS({ element, shell }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("lazy-framework-test-host").textContent).toBe("/__framework-tests/sample-probe");
    });
  });
});
