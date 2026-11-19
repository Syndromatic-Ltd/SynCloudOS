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
import { afterEach, describe, expect, it } from "vitest";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestWebspring } from "./webspringTestShell";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "./helpers";

const stageSelector = '[data-nse-control="window"][data-nse-part="background"][data-nse-presentation="stage"][data-nse-role="standard"]';
const runtimes: ReturnType<typeof createTestRuntime>[] = [];

afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("webspring-host-stack-test");
});

function nearestCommonAncestor(left: Node, right: Node): Node | null {
  const ancestors = new Set<Node>();
  for (let node: Node | null = left; node; node = node.parentNode) ancestors.add(node);
  for (let node: Node | null = right; node; node = node.parentNode) {
    if (ancestors.has(node)) return node;
  }
  return null;
}

function createStackShell() {
  return createTestWebspring({
    info: {
      bundleIdentifier: "com.example.webspring.stack",
      displayName: "Stack Host",
      branding: { name: { key: "host.name", fallback: "Stack Host" } },
    },
  });
}

describe("WebspringHost flat layer stack", () => {
  it("renders the stage as the launcher's sibling in the same appearance boundary, with launch dim and focus handoff", async () => {
    const runtime = authoriseTestRuntime(createTestRuntime({
      id: "runtime:webspring-host-stack",
      initialBundles: [
        createTestBundle({
          bundleIdentifier: "com.example.alpha",
          displayName: "Alpha",
          route: "/alpha",
          presentation: "stage",
        }),
      ],
    }));
    runtimes.push(runtime);
    await runtime.boot({ initialPathname: "/" });

    render(
      <SynCloudOSProvider runtime={runtime}>
        <NSEAppearanceProvider theme={atmoTheme} appearanceService={runtime.appearance}>
          <WebspringHost shell={createStackShell()} authentication="disabled" startupPhase="complete" />
        </NSEAppearanceProvider>
      </SynCloudOSProvider>,
    );

    const viewHost = document.querySelector<HTMLElement>(".webspring-view-host")!;
    const stackElement = viewHost.parentElement!;
    const launcherRoot = document.querySelector<HTMLElement>("main.webspring-board")!;
    expect(stackElement).not.toBeNull();
    expect(launcherRoot).not.toBeNull();

    const alphaIcon = await screen.findByRole("button", { name: "Open Alpha" });
    alphaIcon.focus();
    fireEvent.click(alphaIcon);

    // Wait for both the launch dim and the stage window to mount during launch.
    let stageWindow: HTMLElement | null = null;
    let launchDim: HTMLElement | null = null;
    await waitFor(() => {
      stageWindow = document.querySelector<HTMLElement>(stageSelector);
      launchDim = document.querySelector<HTMLElement>(".webspring-launch-dim");
      expect(stageWindow).not.toBeNull();
      expect(launchDim).not.toBeNull();
    });

    expect(launcherRoot.contains(stageWindow!)).toBe(false);
    expect(nearestCommonAncestor(launcherRoot, stageWindow!)).toBe(stackElement);
    expect(launcherRoot.compareDocumentPosition(stageWindow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const launcherTheme = launcherRoot.closest("[data-nse-theme]");
    const stageTheme = stageWindow!.closest("[data-nse-theme]");
    expect(launcherTheme).not.toBeNull();
    expect(stageTheme).toBe(launcherTheme);

    // The launch dim sits after the launcher root and before the stage window in document order.
    expect(launcherRoot.compareDocumentPosition(launchDim!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(launchDim!.compareDocumentPosition(stageWindow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Wait for launch to settle and verify focus moves inside the stage window.
    await waitFor(() => {
      expect(stageWindow!.contains(document.activeElement)).toBe(true);
    }, { timeout: 3000 });

    // Returning home restores focus to the launched icon.
    await act(async () => {
      await runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "test" });
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(alphaIcon);
    });
  });
});
