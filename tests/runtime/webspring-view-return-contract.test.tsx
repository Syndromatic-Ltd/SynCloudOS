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
import { createWebspringBoardView, defineWebspring, WebspringBoardView, type WebspringViewComponent, type WebspringViewProps } from "../../src/Webspring/public";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

// Keep the real host and settlement lifecycle; omit unrelated canvas decoration.

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("view-return-contract-test");
});

function CompletionView({ model, actions, applicationOutlet }: WebspringViewProps) {
  useEffect(() => {
    if (model.returnTransitionId && model.presentationTraits.reducedMotion) actions.completeReturnTrack("material");
  }, [actions, model.presentationTraits.reducedMotion, model.returnTransitionId]);
  return <main>
    <button onClick={() => actions.completeReturnTrack("material")}>Complete material</button>
    <button onClick={() => actions.completeReturnTrack("icons")}>Complete icons</button>
    {applicationOutlet}
  </main>;
}

async function mountView(id: string, component: WebspringViewComponent, reducedMotion = false) {
  const environment = createTestRuntimeEnvironment();
  environment.matchMedia = (query) => ({
    media: query, matches: reducedMotion && query.includes("prefers-reduced-motion"),
    subscribe: () => () => undefined, dispose: () => undefined,
  });
  const runtime = createTestRuntime({ environment, initialBundles: [createTestBundle({ id: "alpha", policy: { public: true } })] });
  runtimes.push(runtime);
  await runtime.boot({ initialPathname: "/" });
  const shell = defineWebspring({
    manifest: {
      schemaVersion: 1, id: "test.view-return-contract", version: "1.0.0", title: "Return fixture",
      webspringShell: {
        views: [{ id, presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
        defaults: { desktop: id, tablet: id, mobile: id }, homeRoute: "/",
        branding: { name: { key: "host.name", fallback: "Return fixture" } },
      },
    },
    components: { [id]: component },
  });
  render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider>);
  let transitionId = "";
  await act(async () => {
    transitionId = runtime.webspringChoreography.beginReturn("alpha");
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
  it("settles a custom material-only view under an arbitrary ID without the fallback timer", async () => {
    const View = Object.assign(CompletionView, { returnTracks: ["material"] as const });
    const { runtime, transitionId } = await mountView("custom-launcher", View);
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expectAnimationSettlement(runtime, transitionId);
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expectAnimationSettlement(runtime, transitionId);
  });

  it("waits for a declared icon track even when a custom view uses the ID board", async () => {
    const View = Object.assign(CompletionView, { returnTracks: ["material", "icons"] as const });
    const { runtime, transitionId } = await mountView("board", View);
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expect(runtime.store.getSnapshot().webspring.returnTransitionId).toBe(transitionId);
    fireEvent.click(screen.getByRole("button", { name: "Complete icons" }));
    expectAnimationSettlement(runtime, transitionId);
  });

  it.each([
    { id: "board", component: WebspringBoardView, reducedMotion: false },
    { id: "board", component: WebspringBoardView, reducedMotion: true },
    { id: "launchpad", component: createWebspringBoardView({ pageSize: 4 }), reducedMotion: false },
    { id: "launchpad", component: createWebspringBoardView({ pageSize: 4 }), reducedMotion: true },
  ])("settles Board $id with reduced motion $reducedMotion", async ({ id, component, reducedMotion }) => {
    const { runtime, transitionId } = await mountView(id, component, reducedMotion);
    if (!reducedMotion) {
      expect(runtime.store.getSnapshot().webspring.returnTransitionId).toBe(transitionId);
      completeMaterial(".webspring-board-material");
    }
    expectAnimationSettlement(runtime, transitionId);
  });

  it("preserves both completion tracks for an undeclared custom transition", async () => {
    const View = (props: WebspringViewProps) => <CompletionView {...props} />;
    const { runtime, transitionId } = await mountView("legacy", View);
    fireEvent.click(screen.getByRole("button", { name: "Complete material" }));
    expect(runtime.store.getSnapshot().webspring.returnTransitionId).toBe(transitionId);
    fireEvent.click(screen.getByRole("button", { name: "Complete icons" }));
    expectAnimationSettlement(runtime, transitionId);
  });
});
