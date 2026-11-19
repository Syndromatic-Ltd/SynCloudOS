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
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { WSApplication, createWebspring } from "../../src/Webspring/WSApplication";
import { WSBoardViewController } from "../../src/Webspring/Contents/Views/WSBoardViewController/WSBoardViewController";
import { WSIconView } from "../../src/Webspring/WSIconView";
import { WSLauncherViewController } from "../../src/Webspring/WSLauncherViewController";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { WEBSPRING_DRAG_REORDER_REST_MS } from "../../src/Webspring/webspringDragArbiter";
import type { WSInfo } from "../../src/Webspring/WSInfo";
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: SynCloudOSRuntime[] = [];

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const runtime of runtimes.splice(0)) {
    await runtime.dispose("ws-launcher-test");
  }
});

const baseInfo: WSInfo = {
  bundleIdentifier: "com.example.launcher-test",
  displayName: "Launcher Fixture",
  version: "1.0.0",
};

async function createBootedRuntime(appIds: readonly string[]) {
  const runtime = createTestRuntime({
    initialBundles: appIds.map((id, index) => createTestBundle({
      bundleIdentifier: id,
      displayName: id.split(".").at(-1)!.replace(/^./u, (c) => c.toUpperCase()),
      route: `/${id.split(".").at(-1)}`,
      webspring: { order: index },
    })),
  });
  runtimes.push(runtime);
  await runtime.boot({ initialPathname: "/" });
  return runtime;
}

class MinimalGridLauncher extends WSLauncherViewController {
  override renderView() {
    return (
      <div className="minimal-grid">
        {this.items.map((item, index) => <WSIconView key={item.id} item={item} index={index} />)}
      </div>
    );
  }
}

describe("WSLauncherViewController and WSIconView", () => {
  it("gives a minimal subclass items, live announcements and drag proxy plumbing", async () => {
    vi.useFakeTimers();
    const runtime = await createBootedRuntime(["com.example.one", "com.example.two"]);
    class MinimalApp extends WSApplication {
      static override mainViewController = MinimalGridLauncher;
    }
    const shell = createWebspring({ info: baseInfo, application: MinimalApp });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );

    const items = view.container.querySelectorAll("[data-webspring-item-id]");
    expect(items).toHaveLength(2);
    expect(view.container.querySelector('.webspring-reorder-announcement[aria-live="polite"]')).not.toBeNull();

    const firstButton = screen.getByRole("button", { name: "Open One" });
    fireEvent.pointerDown(firstButton, { button: 0, isPrimary: true, pointerId: 1, clientX: 40, clientY: 40 });
    await act(async () => { await vi.advanceTimersByTimeAsync(520); });
    fireEvent.pointerMove(firstButton, { pointerId: 1, clientX: 60, clientY: 45 });

    const proxy = document.body.querySelector(".webspring-drag-proxy");
    expect(proxy).not.toBeNull();
    expect(proxy!.textContent).toContain("One");
  });

  it("previews on hover and focus, and enters edit mode on a double-click", async () => {
    const runtime = await createBootedRuntime(["com.example.one", "com.example.two"]);
    class MinimalApp extends WSApplication {
      static override mainViewController = MinimalGridLauncher;
    }
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={createWebspring({ info: baseInfo, application: MinimalApp })} startupPhase="complete" />
      </SynCloudOSProvider>,
    );
    const one = screen.getByRole("button", { name: "Open One" });
    fireEvent.pointerEnter(one, { pointerId: 1 });
    await waitFor(() => expect(runtime.store.getSnapshot().webspring.hoveredAppId).toBe("com.example.one"));
    fireEvent.pointerLeave(one, { pointerId: 1 });
    await waitFor(() => expect(runtime.store.getSnapshot().webspring.hoveredAppId).toBeNull());
    fireEvent.focus(screen.getByRole("button", { name: "Open Two" }));
    await waitFor(() => expect(runtime.store.getSnapshot().webspring.hoveredAppId).toBe("com.example.two"));

    fireEvent.doubleClick(one);
    await waitFor(() => expect(screen.getByRole("button", { name: "Move One" })).toBeTruthy());
  });

  it("draws the icon effect, glow artwork and jiggle only where a launcher asks for them", async () => {
    vi.useFakeTimers();
    const runtime = await createBootedRuntime(["com.example.one", "com.example.two"]);
    const hovered: string[] = [];
    class DialLikeLauncher extends WSLauncherViewController {
      override renderView() {
        return <div className="dial-like">{this.items.map((item, index) => (
          <WSIconView key={item.id} item={item} index={index} iconEffect glowArtwork jiggle className="dial-icon" onHoverStart={(id) => hovered.push(id)} />
        ))}</div>;
      }
    }
    class DialApp extends WSApplication {
      static override mainViewController = DialLikeLauncher;
      static override iconEffect = ({ active }: { readonly active: boolean }) => <i data-testid="effect" data-active={String(active)} />;
    }
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={createWebspring({ info: baseInfo, application: DialApp })} startupPhase="complete" />
      </SynCloudOSProvider>,
    );
    const one = screen.getByRole("button", { name: "Open One" });
    expect(one.classList.contains("dial-icon")).toBe(true);
    expect(one.classList.contains("webspring-board-icon")).toBe(false);
    expect(one.querySelector(".webspring-icon-artwork__glow")).not.toBeNull();
    fireEvent.pointerEnter(one, { pointerId: 1 });
    expect(hovered).toEqual(["com.example.one"]);
    // The handler replaces the default preview.
    expect(runtime.store.getSnapshot().webspring.hoveredAppId).toBeNull();
    expect(one.querySelector('[data-testid="effect"]')?.getAttribute("data-active")).toBe("true");

    fireEvent.pointerDown(one, { button: 0, isPrimary: true, pointerId: 2, clientX: 10, clientY: 10 });
    await act(async () => { await vi.advanceTimersByTimeAsync(520); });
    fireEvent.pointerUp(view.container.querySelector(".ws-launcher")!, { pointerId: 2, clientX: 10, clientY: 10 });
    const jiggling = view.container.querySelectorAll('[data-jiggle="true"]');
    expect(jiggling).toHaveLength(2);
    expect((jiggling[1] as HTMLElement).style.getPropertyValue("--webspring-jiggle-direction")).toBe("-1");
  });

  it("leaves the Board's icons without the effect, glow artwork or jiggle", async () => {
    vi.useFakeTimers();
    const runtime = await createBootedRuntime(["com.example.one", "com.example.two"]);
    class EffectApp extends WSApplication {
      static override iconEffect = () => <i data-testid="effect" />;
    }
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={createWebspring({ info: baseInfo, application: EffectApp })} startupPhase="complete" />
      </SynCloudOSProvider>,
    );
    const one = screen.getByRole("button", { name: "Open One" });
    fireEvent.pointerEnter(one, { pointerId: 1 });
    fireEvent.pointerDown(one, { button: 0, isPrimary: true, pointerId: 2, clientX: 10, clientY: 10 });
    await act(async () => { await vi.advanceTimersByTimeAsync(520); });
    expect(view.container.querySelector('[data-testid="effect"]')).toBeNull();
    expect(view.container.querySelector(".webspring-icon-artwork__glow")).toBeNull();
    expect(view.container.querySelector("[data-jiggle]")).toBeNull();
  });

  it("opens a folder with no extra subclass code", async () => {
    const runtime = await createBootedRuntime(["com.example.one", "com.example.alpha", "com.example.beta"]);
    class FolderApp extends WSApplication {
      static override mainViewController = MinimalGridLauncher;
    }
    const shell = createWebspring({
      info: {
        ...baseInfo,
        folders: {
          editable: true,
          initial: [{
            id: "folder.tools",
            title: { key: "folders.tools", fallback: "Tools" },
            order: 1,
            apps: ["com.example.alpha", "com.example.beta"],
          }],
        },
      },
      application: FolderApp,
    });

    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open folder Tools" }));
    const dialog = await screen.findByRole("dialog", { name: "Tools" });
    expect(dialog.querySelectorAll("[data-webspring-item-id]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Open Alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Beta" })).toBeTruthy();
  });

  it("drags an app out of a folder and drops it between top-level items", async () => {
    vi.useFakeTimers();
    const runtime = await createBootedRuntime([
      "com.example.one",
      "com.example.two",
      "com.example.alpha",
      "com.example.beta",
    ]);
    class FolderApp extends WSApplication {
      static override mainViewController = MinimalGridLauncher;
    }
    const shell = createWebspring({
      info: {
        ...baseInfo,
        folders: {
          editable: true,
          initial: [{
            id: "folder.tools",
            title: { key: "folders.tools", fallback: "Tools" },
            order: 2,
            apps: ["com.example.alpha", "com.example.beta"],
          }],
        },
      },
      application: FolderApp,
    });

    const rectFor = (left: number, top: number, width = 64, height = 64): DOMRect =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    const getRectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-webspring-folder-panel")) return rectFor(50, 260, 400, 140);
      const itemNode = this.hasAttribute("data-webspring-item-id") ? this : this.closest<HTMLElement>("[data-webspring-item-id]");
      const id = itemNode?.dataset.webspringItemId;
      // The top-level row sits below the panel, so the corridor up to the folder icon stays clear.
      if (id === "com.example.one") return rectFor(20, 440);
      if (id === "com.example.two") return rectFor(220, 440);
      if (id === "folder.tools") return rectFor(420, 440);
      // Leaving the folder puts alpha at the end of the row.
      if (id === "com.example.alpha") return this.closest("[data-webspring-folder-panel]") ? rectFor(80, 290) : rectFor(620, 440);
      if (id === "com.example.beta") return rectFor(180, 290);
      return rectFor(0, 0, 800, 600);
    });

    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder Tools" }));
    const dialog = screen.getByRole("dialog", { name: "Tools" });
    const alphaButton = dialog.querySelector<HTMLElement>('[data-webspring-item-id="com.example.alpha"]')!;
    const root = view.container.querySelector<HTMLElement>(".ws-launcher")!;

    fireEvent.pointerDown(alphaButton, { button: 0, isPrimary: true, pointerId: 7, clientX: 112, clientY: 322 });
    await act(async () => { await vi.advanceTimersByTimeAsync(520); });

    // Leave the panel to return alpha to the top level, then rest in the gap before two to settle on index 1.
    await act(async () => {
      fireEvent.pointerMove(root, { pointerId: 7, clientX: 200, clientY: 472 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();

    await act(async () => {
      fireEvent.pointerMove(root, { pointerId: 7, clientX: 200, clientY: 472 });
      await vi.advanceTimersByTimeAsync(WEBSPRING_DRAG_REORDER_REST_MS + 10);
    });
    await act(async () => {
      fireEvent.pointerUp(root, { pointerId: 7, clientX: 200, clientY: 472 });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
    const topIds = Array.from(
      view.container.querySelectorAll<HTMLElement>(".minimal-grid [data-webspring-item-id]"),
      (element) => element.dataset.webspringItemId,
    );
    expect(topIds).toEqual(["com.example.one", "com.example.alpha", "com.example.two", "folder.tools"]);
    expect(runtime.store.getSnapshot().webspring.layout.preference.folders["folder.tools"]?.apps).toEqual(["com.example.beta"]);
    getRectSpy.mockRestore();
  });

  it("supports keyboard reorder with live announcements and Escape commit", async () => {
    const runtime = await createBootedRuntime(["com.example.one", "com.example.two"]);
    class GridApp extends WSApplication {
      static override mainViewController = MinimalGridLauncher;
    }
    const shell = createWebspring({ info: baseInfo, application: GridApp });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );

    vi.useFakeTimers();
    const first = screen.getByRole("button", { name: "Open One" });
    fireEvent.pointerDown(first, { button: 0, isPrimary: true, pointerId: 2, clientX: 40, clientY: 40 });
    await act(async () => { await vi.advanceTimersByTimeAsync(520); });
    fireEvent.pointerUp(view.container.querySelector<HTMLElement>(".ws-launcher")!, { pointerId: 2, clientX: 40, clientY: 40 });
    const movingFirst = screen.getByRole("button", { name: "Move One" });
    movingFirst.focus();
    fireEvent.keyDown(movingFirst, { key: "ArrowRight" });

    const liveRegion = view.container.querySelector('.webspring-reorder-announcement[aria-live="polite"]')!;
    expect(liveRegion.textContent).toBe("One moved to position 2.");
    expect(runtime.store.getSnapshot().webspring.layout.preference.order).toEqual(["com.example.two", "com.example.one"]);

    fireEvent.keyDown(movingFirst, { key: "Escape" });
    expect(runtime.store.getSnapshot().webspring.layout.isEditing).toBe(false);
    expect(screen.getByRole("button", { name: "Open One" })).toBeTruthy();
  });

  it("throws descriptive errors when WSIconView is misused", async () => {
    expect(() => render(<WSIconView index={0} app={{
      bundleIdentifier: "com.example.one",
      displayName: "One",
      iconUrl: null,
      route: "/one",
      selected: false,
      running: false,
      state: "registered",
      badgeCount: 0,
      accent: "#eaf6ff",
      featured: false,
      selectorAngle: 0,
    }} />)).toThrow(/WSLauncherRootView/);

    const app = {
      bundleIdentifier: "com.example.one",
      displayName: "One",
      iconUrl: null,
      route: "/one",
      selected: false,
      running: false,
      state: "registered" as const,
      badgeCount: 0,
      accent: "#eaf6ff",
      featured: false,
      selectorAngle: 0,
    };
    class BadIconLauncher extends WSLauncherViewController {
      override renderView() {
        return <WSIconView index={0} item={{ kind: "app", id: "com.example.one", app, dialPlacement: { angle: null, iconPosition: { x: 0, y: 0 }, labelPosition: { x: 0, y: 0 }, indicatorPosition: null } }} app={app} />;
      }
    }
    const runtime = await createBootedRuntime(["com.example.one"]);
    class BadIconApp extends WSApplication {
      static override mainViewController = BadIconLauncher;
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const shell = createWebspring({ info: baseInfo, application: BadIconApp });
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/exactly one/);
    consoleError.mockRestore();
  });

  it("offers Use fallback view when a custom launcher throws, and offers none when WSBoardViewController throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    class ThrowingLauncher extends WSLauncherViewController {
      override renderView(): React.ReactNode {
        throw new Error("custom launcher crashed");
      }
    }
    class BrokenCustomApp extends WSApplication {
      static override mainViewController = ThrowingLauncher;
    }
    const runtime = await createBootedRuntime(["com.example.one"]);
    const shell = createWebspring({ info: baseInfo, application: BrokenCustomApp });
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );

    expect((await screen.findByRole("alert")).textContent).toContain("custom launcher crashed");
    fireEvent.click(screen.getByRole("button", { name: "Use fallback view" }));
    expect(document.querySelector("main.webspring-board")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open One" })).toBeTruthy();

    cleanup();
    vi.spyOn(WSBoardViewController.prototype, "renderView").mockImplementation(() => {
      throw new Error("board crashed");
    });
    const boardShell = createWebspring({ info: baseInfo });
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={boardShell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("board crashed");
    expect(screen.queryByRole("button", { name: "Use fallback view" })).toBeNull();
    consoleError.mockRestore();
  });

  it("declares expected returnTracks and invokes WSApplication lifecycle hooks", async () => {
    expect(WSLauncherViewController.returnTracks).toEqual(["material", "icons"]);
    expect(WSBoardViewController.returnTracks).toEqual(["material"]);

    const events: string[] = [];
    class HookedApp extends WSApplication {
      static override mainViewController = MinimalGridLauncher;
      override applicationWillFinishLaunching() { events.push("willFinish"); }
      override applicationDidFinishLaunching() { events.push("didFinish"); }
      override applicationWillTerminate() { events.push("willTerminate"); }
    }

    const runtime = await createBootedRuntime(["com.example.one"]);
    const shell = createWebspring({ info: baseInfo, application: HookedApp });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringHost shell={shell} startupPhase="complete" />
      </SynCloudOSProvider>,
    );

    await waitFor(() => expect(events).toEqual(["willFinish", "didFinish"]));
    view.unmount();
    expect(events).toEqual(["willFinish", "didFinish", "willTerminate"]);
  });
});
