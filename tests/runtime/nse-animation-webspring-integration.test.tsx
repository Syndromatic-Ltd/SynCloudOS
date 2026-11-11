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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { NSEAnimationEnvironmentProvider } from "@syndromatic/syncloudos/nse";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageLayer } from "../../src/Webspring/ApplicationStageLayer";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import { WebspringBoardView } from "../../src/Webspring/Contents/Views/WebspringBoardView/WebspringBoardView";
import { defineWebspring } from "../../src/Webspring/Webspring";
import { WebspringController } from "../../src/Webspring/WebspringController";
import { WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { resolveWebspringMotion } from "../../src/Webspring/Webspring.transitions";
import { resolveWebspringLaunchDimMotion } from "../../src/Webspring/WebspringLaunchDim";
import { resolveWebspringBoardMotion } from "../../src/Webspring/Contents/Views/WebspringBoardView/WebspringBoardView.transitions";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";
import type {
  RuntimeAnimationAdapterFactory,
  RuntimeAnimationAdapterLease,
  RuntimeAnimationPlayback,
  RuntimeAnimationRequest,
} from "../../src/SynCloudOS/AnimationFX";

/** Records the runtime's native presentations; the test finishes them. */
class StagePresentations implements RuntimeAnimationAdapterFactory {
  readonly played: Array<{ request: RuntimeAnimationRequest; finish(): Promise<void> }> = [];
  acquire(): RuntimeAnimationAdapterLease {
    return {
      adapter: {
        animate: (request) => {
          let resolve!: (state: "completed" | "cancelled") => void;
          const finished = new Promise<"completed" | "cancelled">((done) => { resolve = done; });
          const playback: RuntimeAnimationPlayback = {
            finished, progress: () => 0, pause() {}, play() {}, seek() {}, dispose() {},
            cancel: () => resolve("cancelled"),
          };
          this.played.push({ request, finish: async () => { resolve("completed"); await act(async () => { await finished; }); } });
          return playback;
        },
        diagnostics: () => ({ activeCount: 0, listenerCount: 0, timerCount: 0 }),
        dispose() {},
      },
      release() {},
    };
  }
  /** Finishes every presentation of `element`. */
  async finishTarget(element: Element) {
    for (const { request, finish } of [...this.played]) if (request.target === element) await finish();
  }
  /** Finishes every presentation of the element matching `selector`. */
  async finish(selector: string) {
    for (const { request, finish } of [...this.played])
      if ((request.target as Element).matches?.(selector)) await finish();
  }
}

function runtimeWithStagePresentations() {
  const presentations = new StagePresentations();
  const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animation: presentations } });
  return { runtime, presentations };
}

const webspring = defineWebspring({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.example.board",
    version: "1.0.0",
    displayName: "Board fixture",
    webspringShell: {
      views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "board", tablet: "board", mobile: "board" },
      homeRoute: "/",
      branding: { name: { key: "site.name", fallback: "Board fixture" } },
    },
  },
  components: { board: WebspringBoardView },
});

vi.mock("../../src/Webspring/ApplicationStageHost", () => ({
  ApplicationStageHost: ({ multiSwitchId, multiSwitchRole, onMultiSwitchAnimationComplete }: {
    multiSwitchId: string | null;
    multiSwitchRole: "incoming" | "outgoing" | null;
    onMultiSwitchAnimationComplete?: (id: string, role: "incoming" | "outgoing") => void;
  }) => multiSwitchId && multiSwitchRole ? (
    <button type="button" onClick={() => onMultiSwitchAnimationComplete?.(multiSwitchId, multiSwitchRole)}>
      finish {multiSwitchRole}
    </button>
  ) : null,
}));
describe("Webspring owner-local choreography", () => {

  it("keeps radial launch geometry interned and replaces it with a reduced fade", () => {
    const standard = resolveWebspringMotion(false);
    const dimStandard = resolveWebspringLaunchDimMotion(false);
    const dimReduced = resolveWebspringLaunchDimMotion(true);
    expect(standard.getRadialExitForIcon(2, 8)).toBe(standard.getRadialExitForIcon(2, 8));
    expect(standard.getRadialExitForIcon(2, 8)).toMatchObject({ scale: 2.85, opacity: 0 });
    // The launch dim is an AnimationFX presentation over its model opacity.
    expect(dimStandard).toMatchObject({
      opacity: 0.78,
      enter: { duration: 0.56, timing: "linear", tracks: [{ keyPath: "opacity", values: [0, 0.78] }] },
      exit: { duration: 0.56, timing: "linear", tracks: [{ keyPath: "opacity", values: [0.78, 0] }] },
    });
    expect(dimReduced).toMatchObject({
      opacity: 0.72,
      enter: { duration: 0.12, timing: "ease-in-out", tracks: [{ keyPath: "opacity", values: [0, 0.72] }] },
    });
    expect(resolveWebspringBoardMotion(false).launchBackdropDim).toBe(dimStandard);
  });
  it("resolves the owner-local selector duration in standard and reduced modes", () => {
    expect(resolveWebspringMotion(false).selectorDuration).toBe(0.26);
    expect(resolveWebspringMotion(true).selectorDuration).toBe(0.01);
  });
  it("reports both real MultiSwitch roles once and leaves settlement with LaunchServices", () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.from", route: "/from" }));
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.to", route: "/to" }));
    const apps = Object.fromEntries(runtime.apps.getAllApps().map((app) => [app.bundleIdentifier, app]));
    const complete = vi.spyOn(runtime.launchServices, "completeMultiSwitch").mockReturnValue(true);
    const switchId = "switch:animation";
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageLayer
          windowContentRegistry={new WindowContentRendererRegistry()}
          apps={apps}
          lifecycle={{ from: "suspended", to: "active" }}
          activeAppId="com.example.to"
          multiSwitch={{
            id: switchId,
            status: "switching",
            fromAppId: "com.example.from",
            toAppId: "com.example.to",
            fromRoute: "/from",
            toRoute: "/to",
            source: "keyboard",
            startedAt: runtime.environment.now() - 1_000,
            completedAt: null,
          }}
        />
      </SynCloudOSProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "finish outgoing" }));
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "finish incoming" }));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(switchId);
    fireEvent.click(screen.getByRole("button", { name: "finish incoming" }));
    view.unmount();
  });

  it("reports the real application-exit role to Webspring once, when the stage exit settles", () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.leaving", route: "/leaving" }));
    const apps = Object.fromEntries(runtime.apps.getAllApps().map((app) => [app.bundleIdentifier, app]));
    const complete = vi.spyOn(runtime.webspring, "completeReturnRole").mockReturnValue(true);
    const stage = (returnTransitionId: string | null) => (
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageLayer
          windowContentRegistry={new WindowContentRendererRegistry()}
          apps={apps}
          lifecycle={{ leaving: "active" }}
          activeAppId="com.example.leaving"
          returnTransitionId={returnTransitionId}
        />
      </SynCloudOSProvider>
    );
    const view = render(stage(null));
    expect(complete).not.toHaveBeenCalled();
    // The return removes the stage child; its exit (here, a host without
    // presentations) settles and reports the role exactly once.
    view.rerender(stage("return:animation"));
    view.rerender(stage("return:animation"));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith("return:animation", "applicationExit");
  });

  function launchingSnapshot(runtime: ReturnType<typeof createTestRuntime>, appIds: readonly string[], launchTransitionId: string) {
    for (const id of appIds) runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: id, route: `/${id.split(".").at(-1)}` }));
    const base = runtime.store.getSnapshot();
    return {
      ...base,
      appInfo: Object.fromEntries(appIds.map((id) => [id, runtime.apps.getApp(id)!])),
      lifecycle: Object.fromEntries(appIds.map((id) => [id, "active" as const])),
      webspring: { ...base.webspring, launchPhase: "launching" as const, launchingAppId: appIds[0]!, launchTransitionId },
    };
  }

  it("covers a launch when a site's own launcher reports its exit settled", () => {
    const runtime = createTestRuntime();
    const snapshot = launchingSnapshot(runtime, ["com.example.first", "com.example.second", "com.example.third"], "launch:custom");
    const complete = vi.spyOn(runtime.webspring, "completeLaunchCover").mockReturnValue(true);
    const controller = new WebspringController(runtime, webspring, undefined);
    const model = controller.model(snapshot, "desktop");
    // A launcher with an exit of its own (the Syndromatic site's Dial flies
    // its icons out) reports it settled through its actions.
    controller.actions.completeLaunch(model.launchTransitionId!, model.launchingAppId!);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith("launch:custom", "com.example.first");
  });

  it("leaves a Board launch's cover to the runtime: the Board has no launcher exit of its own", async () => {
    const { runtime, presentations } = runtimeWithStagePresentations();
    const snapshot = launchingSnapshot(runtime, ["com.example.first", "com.example.second"], "launch:board");
    const complete = vi.spyOn(runtime.webspring, "completeLaunchCover").mockReturnValue(true);
    const controller = new WebspringController(runtime, webspring, undefined);
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringBoardView model={controller.model(snapshot, "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={webspring.folderPresentation} />
      </SynCloudOSProvider>,
    );
    for (const { finish } of [...presentations.played]) await finish();
    expect(complete).not.toHaveBeenCalled();
    view.unmount();
  });

  it("completes reduced app entry immediately without bypassing the launch-cover gate", () => {
    const runtime = createTestRuntime();
    runtime.settings.set("motion", "reduced");
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.reduced-entry", route: "/reduced-entry" }));
    const app = runtime.apps.getApp("com.example.reduced-entry");
    expect(app).toBeTruthy();
    const settlement = runtime.presentationSettlements.begin({
      operationId: "operation:reduced-entry",
      roles: ["application-enter", "webspring-shell-return"],
      timeoutMs: 1_000,
    });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageView
          windowContentRegistry={new WindowContentRendererRegistry()}
          stage={{ id: "application-stage:com.example.reduced-entry", appId: "com.example.reduced-entry", title: app!.window.title, isFocused: true, zIndex: 1 }}
          app={app!}
          lifecycle="active"
          presentationSettlementId={settlement.id}
        />
      </SynCloudOSProvider>,
    );

    expect(runtime.presentationSettlements.inspect(settlement.id)).toMatchObject({
      status: "pending",
      completedRoles: ["application-enter"],
    });
    settlement.cancel("test-cleanup");
    view.unmount();
  });

  it("settles application entry from the app surface animation, with no content card", async () => {
    const { runtime, presentations } = runtimeWithStagePresentations();
    runtime.apps.registerBundle(createTestBundle({
      bundleIdentifier: "com.example.defacto-entry",
      route: "/defacto-entry",
    }));
    const app = runtime.apps.getApp("com.example.defacto-entry");
    expect(app).toBeTruthy();
    const settlement = runtime.presentationSettlements.begin({
      operationId: "operation:defacto-entry",
      roles: ["application-enter"],
      timeoutMs: 1_000,
    });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageView
          windowContentRegistry={new WindowContentRendererRegistry()}
          stage={{ id: "application-stage:com.example.defacto-entry", appId: "com.example.defacto-entry", title: app!.window.title, isFocused: true, zIndex: 1 }}
          app={app!}
          lifecycle="active"
          presentationSettlementId={settlement.id}
        />
      </SynCloudOSProvider>,
    );

    await presentations.finish(".webspring-app-view-frame");
    expect(runtime.presentationSettlements.inspect(settlement.id)).toMatchObject({
      status: "pending",
      completedRoles: [],
    });

    const surface = presentations.played.find(({ request }) => (request.target as Element).matches(".webspring-app-view-surface"))!;
    expect(surface.request).toMatchObject({ duration: 0.68, fill: "backwards" });
    await presentations.finish(".webspring-app-view-surface");
    expect(runtime.presentationSettlements.inspect(settlement.id)).toEqual({ status: "settled" });
    expect(view.container.querySelector(".webspring-app-view-content-card")).toBeNull();
    view.unmount();
  });

  it("recognises and cancels Board long presses through the scoped controller", () => {
    vi.useFakeTimers();
    try {
      const runtime = createTestRuntime();
      runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.alpha", route: "/alpha" }));
      runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.beta", route: "/beta" }));
      const controller = new WebspringController(runtime, webspring, undefined);
      const view = render(<SynCloudOSProvider runtime={runtime}>
        <WebspringBoardView model={controller.model(runtime.store.getSnapshot(), "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={webspring.folderPresentation} />
      </SynCloudOSProvider>);

      fireEvent.pointerDown(screen.getByRole("button", { name: "Open Alpha" }), { pointerId: 7, isPrimary: true });
      act(() => vi.advanceTimersByTime(520));
      expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ isEditing: true, draggingItemId: "com.example.alpha" });

      fireEvent.pointerCancel(view.container.querySelector("main")!, { pointerId: 7 });
      expect(runtime.store.getSnapshot().webspring.layout.draggingItemId).toBeNull();
      view.unmount();

      const cancellationRuntime = createTestRuntime();
      cancellationRuntime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.cancel", route: "/cancel" }));
      const cancellationController = new WebspringController(cancellationRuntime, webspring, undefined);
      const pending = render(<SynCloudOSProvider runtime={cancellationRuntime}>
        <WebspringBoardView model={cancellationController.model(cancellationRuntime.store.getSnapshot(), "mobile")} actions={cancellationController.actions} applicationOutlet={null} folderPresentation={webspring.folderPresentation} />
      </SynCloudOSProvider>);
      fireEvent.pointerDown(screen.getByRole("button", { name: "Open Cancel" }), { pointerId: 8, isPrimary: true });
      pending.unmount();
      act(() => vi.advanceTimersByTime(520));
      expect(cancellationRuntime.store.getSnapshot().webspring.layout.isEditing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a Board folder over the stage and closes it with Escape", async () => {
    // The folder's cell (icon well and label) under a 400 x 700 board.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("webspring-board")) return new DOMRect(0, 0, 400, 700);
      if (this.dataset.webspringItemId === "folder.tools") return new DOMRect(100, 100, 80, 110);
      if (this.classList.contains("webspring-board-icon-well")) return new DOMRect(110, 100, 60, 60);
      return new DOMRect(0, 0, 0, 0);
    });
    const folderShell = defineWebspring({
      manifest: {
        ...webspring.manifest,
        webspringShell: {
          ...webspring.manifest.webspringShell,
          folders: { editable: true, initial: [{ id: "folder.tools", title: { key: "folders.tools", fallback: "Tools" }, order: 0, apps: ["com.example.beta", "com.example.gamma"] }] },
        },
      },
      components: { board: WebspringBoardView },
    });
    const runtime = createTestRuntime();
    for (const id of ["com.example.alpha", "com.example.beta", "com.example.gamma"]) runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: id, route: `/${id.split(".").at(-1)}` }));
    runtime.webspring.configureFolders(folderShell.manifest.webspringShell.folders!);
    const controller = new WebspringController(runtime, folderShell, undefined);
    const board = () => <SynCloudOSProvider runtime={runtime}>
      <WebspringBoardView model={controller.model(runtime.store.getSnapshot(), "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={folderShell.folderPresentation} />
    </SynCloudOSProvider>;
    const view = render(board());
    const settle = (ms: number) => act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, ms);
      await promise;
      view.rerender(board());
    });

    expect(screen.queryByRole("button", { name: "Open Beta" })).toBeNull();
    const folderButton = screen.getByRole("button", { name: "Open folder Tools" });
    fireEvent.click(folderButton);
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBe("folder.tools");
    await settle(80);

    const dialog = screen.getByRole("dialog", { name: "Tools" });
    expect(dialog.hasAttribute("data-webspring-folder-panel")).toBe(true);
    // The seam runs below the label, 6 px under the cell.
    expect(dialog.style.top).toBe("216px");
    await waitFor(() => expect(view.container.querySelector(".webspring-folder-split")?.getAttribute("data-phase")).toBe("open"), { timeout: 5000 });
    expect(screen.getByRole("button", { name: "Open Beta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Gamma" })).toBeTruthy();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await settle(600);
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    vi.restoreAllMocks();
  });

  /** Slots lie in a row 100 px apart; each slot's artwork is the top 60 px of it. */
  function mockBoardRects() {
    return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-webspring-folder-panel")) return new DOMRect(0, 100, 400, 200);
      if (this.classList.contains("webspring-board-icon-well")) {
        const slot = this.closest<HTMLElement>("[data-webspring-item-id]");
        const offset = this.closest("[data-webspring-folder-panel]") ? 120 : 0;
        return new DOMRect(Number(slot?.dataset.orderIndex ?? 0) * 100, offset, 60, 60);
      }
      if (this.dataset.webspringItemId && this.dataset.orderIndex !== undefined) return new DOMRect(Number(this.dataset.orderIndex) * 100, 0, 80, 96);
      if (this.classList.contains("webspring-board")) return new DOMRect(-200, 0, 1400, 800);
      return new DOMRect(0, 0, 0, 0);
    });
  }

  function boardFixture(folders: { id: string; order: number; apps: string[] }[] = []) {
    // A folder's title comes from the shell's manifest declaration; the runtime's folder view carries none.
    const shell = defineWebspring({
      manifest: {
        ...webspring.manifest,
        webspringShell: {
          ...webspring.manifest.webspringShell,
          folders: {
            editable: true,
            initial: folders.map((folder) => ({ ...folder, title: { key: `folders.${folder.id}`, fallback: "Tools" } })),
          },
        },
      },
      components: { board: WebspringBoardView },
    });
    const runtime = createTestRuntime();
    for (const id of ["com.example.alpha", "com.example.beta", "com.example.gamma"]) runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: id, route: `/${id.split(".").at(-1)}` }));
    runtime.webspring.configureFolders(shell.manifest.webspringShell.folders!);
    const controller = new WebspringController(runtime, shell, undefined);
    function Board() {
      const snapshot = React.useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
      return <WebspringBoardView model={controller.model(snapshot, "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={shell.folderPresentation} />;
    }
    const view = render(<SynCloudOSProvider runtime={runtime}><Board /></SynCloudOSProvider>);
    const rest = (ms: number) => act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, ms);
      await promise;
    });
    return { runtime, view, main: view.container.querySelector("main")!, rest, order: () => runtime.store.getSnapshot().webspring.layout.preference };
  }

  it("merges only over an entry's artwork and reorders only after a rest", async () => {
    mockBoardRects();
    try {
      const { runtime, view, main, rest, order } = boardFixture();
      fireEvent.click(within(view.container).getByRole("button", { name: "Reorder applications" }));

      // Gamma rests on the slot's label, below Beta's artwork: it reorders, it does not merge.
      fireEvent.pointerDown(within(view.container).getByRole("button", { name: "Move Gamma" }), { pointerId: 3, isPrimary: true, button: 0, clientX: 230, clientY: 30 });
      fireEvent.pointerMove(main, { pointerId: 3, clientX: 130, clientY: 70 });
      await rest(200);
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
      expect(order().order).toEqual(["com.example.alpha", "com.example.gamma", "com.example.beta"]);
      fireEvent.pointerUp(main, { pointerId: 3, clientX: 130, clientY: 70 });

      // Gamma's centre rests on Alpha's artwork: the drop well appears and the release merges.
      fireEvent.pointerDown(within(view.container).getByRole("button", { name: "Move Gamma" }), { pointerId: 4, isPrimary: true, button: 0, clientX: 130, clientY: 30 });
      fireEvent.pointerMove(main, { pointerId: 4, clientX: 30, clientY: 30 });
      await rest(400);
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBe("com.example.alpha");
      expect(order().order).toEqual(["com.example.alpha", "com.example.gamma", "com.example.beta"]);
      fireEvent.pointerUp(main, { pointerId: 4, clientX: 30, clientY: 30 });

      const [folderId] = order().order.filter((id) => id.startsWith("folder."));
      expect(order().order).toEqual([folderId, "com.example.beta"]);
      expect(order().folders[folderId]).toEqual({ apps: ["com.example.alpha", "com.example.gamma"] });
      view.unmount();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("keeps the grab offset, so the icon centre rather than the pointer picks the slot", async () => {
    mockBoardRects();
    try {
      const { view, main, rest, order } = boardFixture();
      fireEvent.click(within(view.container).getByRole("button", { name: "Reorder applications" }));
      // Seized at Gamma's right edge, its centre lands at 60, between Alpha (0-60) and Beta (100-160).
      fireEvent.pointerDown(within(view.container).getByRole("button", { name: "Move Gamma" }), { pointerId: 3, isPrimary: true, button: 0, clientX: 259, clientY: 1 });
      fireEvent.pointerMove(main, { pointerId: 3, clientX: 99, clientY: 1 });
      await rest(200);
      expect(order().order).toEqual(["com.example.gamma", "com.example.alpha", "com.example.beta"]);
      fireEvent.pointerUp(main, { pointerId: 3, clientX: 99, clientY: 1 });
      view.unmount();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("springs a folder open under a resting app and drops it inside the panel", async () => {
    mockBoardRects();
    try {
      const { runtime, view, main, rest, order } = boardFixture([{ id: "folder.tools", order: 0, apps: ["com.example.gamma"] }]);
      fireEvent.click(within(view.container).getByRole("button", { name: "Reorder applications" }));
      // Alpha rests on the folder: the well arms, then the folder springs open under it.
      fireEvent.pointerDown(within(view.container).getByRole("button", { name: "Move Alpha" }), { pointerId: 5, isPrimary: true, button: 0, clientX: 130, clientY: 30 });
      fireEvent.pointerMove(main, { pointerId: 5, clientX: 30, clientY: 30 });
      await rest(250);
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBe("folder.tools");
      await rest(700);
      expect(runtime.store.getSnapshot().webspring.openFolderId).toBe("folder.tools");
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
      await waitFor(() => expect(screen.getByRole("dialog", { name: "Tools" })).toBeTruthy(), { timeout: 5000 });
      // The Board is in edit mode, so the panel's member is labelled for moving, not opening.
      await waitFor(() => expect(screen.getByRole("button", { name: "Move Gamma" })).toBeTruthy(), { timeout: 5000 });

      // Inside the panel, Alpha rests on Gamma's artwork and the release places it first.
      fireEvent.pointerMove(main, { pointerId: 5, clientX: 30, clientY: 150 });
      await rest(200);
      // Alpha is not yet a member, so hovering the panel leaves the Board's order alone until release.
      expect(order().order).toEqual(["folder.tools", "com.example.alpha", "com.example.beta"]);
      fireEvent.pointerUp(main, { pointerId: 5, clientX: 30, clientY: 150 });
      expect(order().folders["folder.tools"]).toEqual({ apps: ["com.example.alpha", "com.example.gamma"] });
      expect(order().order).toEqual(["folder.tools", "com.example.beta"]);
      view.unmount();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
