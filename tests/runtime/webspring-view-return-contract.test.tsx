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
import React, { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WSBoardViewController, WSLauncherViewController, type WSLauncherViewControllerClass } from "../../src/Webspring/public";
import { createTestWebspring } from "./webspringTestShell";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

// Keep the real host and settlement lifecycle; omit unrelated canvas decoration.

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("view-return-contract-test");
});

function CompletionContent({ launcher }: { readonly launcher: WSLauncherViewController }) {
  const { returnTransitionId } = launcher;
  const { reducedMotion } = launcher.presentationTraits;
  useEffect(() => {
    if (returnTransitionId && reducedMotion) launcher.completeReturnTrack("material");
  }, [launcher, reducedMotion, returnTransitionId]);
  return <main>
    <button onClick={() => launcher.completeReturnTrack("material")}>Complete material</button>
    <button onClick={() => launcher.completeReturnTrack("icons")}>Complete icons</button>
  </main>;
}

/** A launcher that reports its return tracks from buttons; `returnTracks` is left undeclared when omitted. */
function completionLauncher(returnTracks?: readonly ("material" | "icons")[]) {
  class CompletionLauncher extends WSLauncherViewController {
    override renderView() { return <CompletionContent launcher={this} />; }
  }
  if (returnTracks) Object.defineProperty(CompletionLauncher, "returnTracks", { value: returnTracks, enumerable: true });
  return CompletionLauncher;
}

async function mountView(launcher: WSLauncherViewControllerClass, reducedMotion = false) {
  const environment = createTestRuntimeEnvironment();
  environment.matchMedia = (query) => ({
    media: query, matches: reducedMotion && query.includes("prefers-reduced-motion"),
    subscribe: () => () => undefined, dispose: () => undefined,
  });
  const runtime = createTestRuntime({ environment, initialBundles: [createTestBundle({ bundleIdentifier: "com.example.alpha", policy: { public: true } })] });
  runtimes.push(runtime);
  await runtime.boot({ initialPathname: "/" });
  const shell = createTestWebspring({
    info: { bundleIdentifier: "com.example.test.view-return-contract", displayName: "Return fixture", branding: { name: { key: "host.name", fallback: "Return fixture" } } },
    launcher,
  });
  render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider>);
  let transitionId = "";
  await act(async () => {
    transitionId = runtime.webspringChoreography.beginReturn("com.example.alpha");
    // No app is mounted in this launcher fixture; supply the independent app-exit role.
    runtime.webspring.completeReturnRole(transitionId, "applicationExit");
  });
  return { runtime, transitionId };
}

function expectAnimationSettlement(runtime: ReturnType<typeof createTestRuntime>, transitionId: string) {
  expect(runtime.store.getSnapshot().webspring).toMatchObject({ launchPhase: "idle", returnTransitionId: null });
  expect(runtime.events.getHistory().filter((event) => event.type === "webspring.return.complete").map((event) => event.payload)).toEqual([
    expect.objectContaining({ returnTransitionId: transitionId, completionSource: "animation", outstandingRoles: [] }),
  ]);
}

function completeMaterial(selector: string) {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "transform" });
  fireEvent(document.querySelector(selector)!, event);
}

describe("Webspring view-owned return completion", () => {
  it("settles a custom material-only launcher without the fallback timer", async () => {
    const { runtime, transitionId } = await mountView(completionLauncher(["material"]));
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expectAnimationSettlement(runtime, transitionId);
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expectAnimationSettlement(runtime, transitionId);
  });

  it("waits for a declared icon track", async () => {
    const { runtime, transitionId } = await mountView(completionLauncher(["material", "icons"]));
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expect(runtime.store.getSnapshot().webspring.returnTransitionId).toBe(transitionId);
    fireEvent.click(screen.getByRole("button", { name: "Complete icons" }));
    expectAnimationSettlement(runtime, transitionId);
  });

  class Launchpad extends WSBoardViewController { static override pageSize = 4; }
  it.each([
    { id: "board", launcher: WSBoardViewController, reducedMotion: false },
    { id: "board", launcher: WSBoardViewController, reducedMotion: true },
    { id: "launchpad", launcher: Launchpad, reducedMotion: false },
    { id: "launchpad", launcher: Launchpad, reducedMotion: true },
  ])("settles Board $id with reduced motion $reducedMotion", async ({ launcher, reducedMotion }) => {
    const { runtime, transitionId } = await mountView(launcher, reducedMotion);
    if (!reducedMotion) {
      expect(runtime.store.getSnapshot().webspring.returnTransitionId).toBe(transitionId);
      completeMaterial(".webspring-board-material");
    }
    expectAnimationSettlement(runtime, transitionId);
  });

  it("preserves both completion tracks for a launcher that declares none", async () => {
    const { runtime, transitionId } = await mountView(completionLauncher());
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expect(runtime.store.getSnapshot().webspring.returnTransitionId).toBe(transitionId);
    fireEvent.click(screen.getByRole("button", { name: "Complete icons" }));
    expectAnimationSettlement(runtime, transitionId);
  });
});
