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
    id: "com.example.board",
    version: "1.0.0",
    title: "Board fixture",
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
    runtime.apps.registerBundle(createTestBundle({ id: "from", route: "/from" }));
    runtime.apps.registerBundle(createTestBundle({ id: "to", route: "/to" }));
    const apps = Object.fromEntries(runtime.apps.getAllApps().map((app) => [app.id, app]));
    const complete = vi.spyOn(runtime.launchServices, "completeMultiSwitch").mockReturnValue(true);
    const switchId = "switch:animation";
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageLayer
          windowContentRegistry={new WindowContentRendererRegistry()}
          apps={apps}
          lifecycle={{ from: "suspended", to: "active" }}
          activeAppId="to"
          multiSwitch={{
            id: switchId,
            status: "switching",
            fromAppId: "from",
            toAppId: "to",
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
    runtime.apps.registerBundle(createTestBundle({ id: "leaving", route: "/leaving" }));
    const apps = Object.fromEntries(runtime.apps.getAllApps().map((app) => [app.id, app]));
    const complete = vi.spyOn(runtime.webspring, "completeReturnRole").mockReturnValue(true);
    const stage = (returnTransitionId: string | null) => (
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageLayer
          windowContentRegistry={new WindowContentRendererRegistry()}
          apps={apps}
          lifecycle={{ leaving: "active" }}
          activeAppId="leaving"
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
    for (const id of appIds) runtime.apps.registerBundle(createTestBundle({ id, route: `/${id}` }));
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
    const snapshot = launchingSnapshot(runtime, ["first", "second", "third"], "launch:custom");
    const complete = vi.spyOn(runtime.webspring, "completeLaunchCover").mockReturnValue(true);
    const controller = new WebspringController(runtime, webspring, undefined);
    const model = controller.model(snapshot, "desktop");
    // A launcher with an exit of its own (the Syndromatic site's Dial flies
    // its icons out) reports it settled through its actions.
    controller.actions.completeLaunch(model.launchTransitionId!, model.launchingAppId!);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith("launch:custom", "first");
  });

  it("leaves a Board launch's cover to the runtime: the Board has no launcher exit of its own", async () => {
    const { runtime, presentations } = runtimeWithStagePresentations();
    const snapshot = launchingSnapshot(runtime, ["first", "second"], "launch:board");
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
    runtime.apps.registerBundle(createTestBundle({ id: "reduced-entry", route: "/reduced-entry" }));
    const app = runtime.apps.getApp("reduced-entry");
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
          stage={{ id: "application-stage:reduced-entry", appId: "reduced-entry", title: app!.window.title, isFocused: true, zIndex: 1 }}
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
      id: "defacto-entry",
      route: "/defacto-entry",
    }));
    const app = runtime.apps.getApp("defacto-entry");
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
          stage={{ id: "application-stage:defacto-entry", appId: "defacto-entry", title: app!.window.title, isFocused: true, zIndex: 1 }}
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
      runtime.apps.registerBundle(createTestBundle({ id: "alpha", route: "/alpha" }));
      runtime.apps.registerBundle(createTestBundle({ id: "beta", route: "/beta" }));
      const controller = new WebspringController(runtime, webspring, undefined);
      const view = render(<SynCloudOSProvider runtime={runtime}>
        <WebspringBoardView model={controller.model(runtime.store.getSnapshot(), "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={webspring.folderPresentation} />
      </SynCloudOSProvider>);

      fireEvent.pointerDown(screen.getByRole("button", { name: "Open Alpha" }), { pointerId: 7, isPrimary: true });
      act(() => vi.advanceTimersByTime(520));
      expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ isEditing: true, draggingItemId: "alpha" });

      fireEvent.pointerCancel(view.container.querySelector("main")!, { pointerId: 7 });
      expect(runtime.store.getSnapshot().webspring.layout.draggingItemId).toBeNull();
      view.unmount();

      const cancellationRuntime = createTestRuntime();
      cancellationRuntime.apps.registerBundle(createTestBundle({ id: "cancel", route: "/cancel" }));
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
          folders: { editable: true, initial: [{ id: "folder.tools", title: { key: "folders.tools", fallback: "Tools" }, order: 0, apps: ["beta", "gamma"] }] },
        },
      },
      components: { board: WebspringBoardView },
    });
    const runtime = createTestRuntime();
    for (const id of ["alpha", "beta", "gamma"]) runtime.apps.registerBundle(createTestBundle({ id, route: `/${id}` }));
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
    const prepare = vi.spyOn(folderShell.folderPresentation, "prepare");
    const folderButton = screen.getByRole("button", { name: "Open folder Tools" });
    fireEvent.pointerEnter(folderButton);
    expect(prepare).toHaveBeenCalledWith(view.container.querySelector("main"));
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

  it("merges only into the entry the dragged app rests on long enough", async () => {
    // Slots lie in a row, 100 px apart; the board is wide enough that no drag turns the page.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.webspringItemId && this.dataset.orderIndex !== undefined) return new DOMRect(Number(this.dataset.orderIndex) * 100, 0, 80, 96);
      if (this.classList.contains("webspring-board")) return new DOMRect(-200, 0, 1400, 800);
      return new DOMRect(0, 0, 0, 0);
    });
    try {
      const runtime = createTestRuntime();
      for (const id of ["alpha", "beta", "gamma"]) runtime.apps.registerBundle(createTestBundle({ id, route: `/${id}` }));
      runtime.webspring.configureFolders({ editable: true, initial: [] });
      const controller = new WebspringController(runtime, webspring, undefined);
      function Board() {
        const snapshot = React.useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
        return <WebspringBoardView model={controller.model(snapshot, "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={webspring.folderPresentation} />;
      }
      const view = render(<SynCloudOSProvider runtime={runtime}><Board /></SynCloudOSProvider>);
      const main = view.container.querySelector("main")!;
      const rest = (ms: number) => act(async () => {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, ms);
        await promise;
      });
      const centreOf = (index: number) => ({ clientX: index * 100 + 40, clientY: 48 });
      const order = () => runtime.store.getSnapshot().webspring.layout.preference;

      fireEvent.click(within(view.container).getByRole("button", { name: "Reorder applications" }));
      fireEvent.pointerDown(within(view.container).getByRole("button", { name: "Move Gamma" }), { pointerId: 3, isPrimary: true, button: 0, ...centreOf(2) });
      fireEvent.pointerMove(main, { pointerId: 3, ...centreOf(0) });
      await rest(400);
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBe("alpha");

      // Into Beta's centre: Alpha is no longer the target, and Beta has not yet armed.
      fireEvent.pointerMove(main, { pointerId: 3, ...centreOf(1) });
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
      fireEvent.pointerUp(main, { pointerId: 3, ...centreOf(1) });
      expect(order().folders).toEqual({});
      expect(order().order).toEqual(["alpha", "beta", "gamma"]);

      fireEvent.pointerDown(within(view.container).getByRole("button", { name: "Move Gamma" }), { pointerId: 4, isPrimary: true, button: 0, ...centreOf(2) });
      fireEvent.pointerMove(main, { pointerId: 4, ...centreOf(1) });
      await rest(400);
      expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBe("beta");
      fireEvent.pointerUp(main, { pointerId: 4, ...centreOf(1) });
      const [folderId] = order().order.filter((id) => id.startsWith("folder."));
      expect(order().order).toEqual(["alpha", folderId]);
      expect(order().folders[folderId]).toEqual({ apps: ["beta", "gamma"] });
      view.unmount();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
