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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebspringStatusLayer } from "../../src/Webspring/WebspringStatusLayer";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation";
import { useWebspringResponder } from "../../src/Webspring/useWebspringResponder";
import { SynCloudOSWatchdog } from "../../src/SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import { RuntimeInputBoundary, SynCloudOSProvider, useRuntimeSelector } from "../../src/SynCloudOSReact";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "./helpers";

const activeRuntimes: SynCloudOSRuntime[] = [];

function ConnectedStatusLayer() {
  const errors = useRuntimeSelector((snapshot) => snapshot.errors);
  return <WebspringStatusLayer errors={errors} />;
}

function WebspringResponder() {
  useWebspringResponder();
  return null;
}

function ThrowingApp() {
  throw new Error("gallery render failed");
}

function CrashedAppPresentation({ runtime }: { runtime: SynCloudOSRuntime }) {
  const activeAppId = useRuntimeSelector((snapshot) => snapshot.application.activeAppId);
  if (activeAppId !== "nse-control-gallery") return null;
  const app = runtime.apps.getApp("nse-control-gallery")!;
  return (
    <SynCloudOSWatchdog
      runtime={runtime}
      watchdogName="NSEControlGallery.app presentation"
      scope="app"
      app={app}
      presentation={{ id: "stage-gallery", kind: "appView", zIndex: 100 }}
      resetKey="stage-gallery:nse-control-gallery"
      fallback={() => <div data-testid="gallery-fallback" />}
    >
      <ThrowingApp />
    </SynCloudOSWatchdog>
  );
}

describe("WebspringStatusLayer recovery", () => {
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    for (const runtime of activeRuntimes.splice(0)) {
      await runtime.dispose({ reason: "test-complete", inFlight: "cancel" });
    }
  });

  it("resolves the AppIcon when an app deadline arrives after an initially empty error history", () => {
    const runtime = createTestRuntime();
    activeRuntimes.push(runtime);
    runtime.apps.registerBundle(createTestBundle({ id: "notes", displayName: "Notes", icon: { src: "/Notes.app/Contents/Resources/AppIcon.png" } }));
    render(<SynCloudOSProvider runtime={runtime}><ConnectedStatusLayer /></SynCloudOSProvider>);
    act(() => runtime.errors.createNotRespondingError(runtime.apps.getApp("notes")!, { reason: "request-timeout" }));
    const dialog = screen.getByRole("alertdialog", { name: "Notes has stopped responding." });
    expect(dialog.querySelector("[data-alert-logo]")?.getAttribute("src")).toBe("/Notes.app/Contents/Resources/AppIcon.png");
  });

  it("keeps a dismissed system alert until its backdrop and alert exits settle", async () => {
    const runtime = createTestRuntime({ authenticationPolicy: "required" });
    activeRuntimes.push(runtime);
    const exits: Array<{ target: Element; settle(): void }> = [];
    const animator: NSEAnimator = {
      ownerAppId: "syncloudos.system",
      animations: {
        acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
        animate(target, definition) {
          let settle!: () => void;
          const finished = new Promise((resolve) => { settle = () => resolve({ state: "completed", reduced: false }); });
          if ((definition as { fill?: string }).fill === "forwards") exits.push({ target: target as Element, settle });
          return { id: "a", finished, progress: 0, cancel() {}, seek() {}, pause() {}, resume() {} };
        },
      } as NSEAnimator["animations"],
    };
    runtime.errors.capture({
      code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH",
      title: "Syndromatic has unexpectedly stopped.",
      message: "An unexpected error has prevented this application from working properly.",
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload", "dismiss"],
    });
    render(
      <SynCloudOSProvider runtime={runtime}>
        <NSEAnimationEnvironmentProvider animator={animator}>
          <ConnectedStatusLayer />
        </NSEAnimationEnvironmentProvider>
      </SynCloudOSProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(exits).toHaveLength(2));
    expect(exits.map(({ target }) => target.className.split(" ")[0]).sort()).toEqual(["nse-control-alert", "nse-control-alert-backdrop"]);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await act(async () => { exits[0]!.settle(); });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await act(async () => { exits[1]!.settle(); });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("dismisses a session mismatch without dispatching navigation or granting authority", async () => {
    const runtime = createTestRuntime({ authenticationPolicy: "required" });
    activeRuntimes.push(runtime);
    const dispatch = vi.spyOn(runtime.commands, "dispatch");
    runtime.errors.capture({
      code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH",
      title: "Syndromatic has unexpectedly stopped.",
      message: "An unexpected error has prevented this application from working properly.",
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload", "dismiss"],
    });

    render(
      <SynCloudOSProvider runtime={runtime}>
        <ConnectedStatusLayer />
      </SynCloudOSProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(dispatch).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
  });

  it("returns a crashed application to Webspring and clears its fatal dialog", async () => {
    const runtime = authoriseTestRuntime(createTestRuntime());
    activeRuntimes.push(runtime);
    runtime.apps.registerBundle(createTestBundle({
      id: "nse-control-gallery",
      packageName: "NSEControlGallery.app",
      displayName: "NSE Control Gallery",
      route: "/__syncloudos/nse-gallery",
    }));
    await runtime.boot({ initialPathname: "/" });
    const admission = await runtime.routes.openRoute("/__syncloudos/nse-gallery", { source: "test" }).result;
    expect(admission, JSON.stringify(admission)).toMatchObject({ status: "completed", committed: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dispatch = runtime.commands.dispatch.bind(runtime.commands);
    let dispatchOutcome: unknown;
    vi.spyOn(runtime.commands, "dispatch").mockImplementation((async (...args: Parameters<typeof dispatch>) => {
      dispatchOutcome = await dispatch(...args);
      return dispatchOutcome;
    }) as typeof runtime.commands.dispatch);

    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <WebspringResponder />
          <ConnectedStatusLayer />
          <CrashedAppPresentation runtime={runtime} />
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    await screen.findByRole("alertdialog", { name: "NSE Control Gallery stopped unexpectedly." });
    fireEvent.click(screen.getByRole("button", { name: "Return to Webspring" }));

    await waitFor(() => expect(dispatchOutcome).toMatchObject({ status: "executed" }));

    await waitFor(() => {
      const snapshot = runtime.store.getSnapshot();
      expect(snapshot.statechart.currentState).toBe("active.webspring");
      expect(snapshot.application.activeAppId).toBeNull();
      expect(snapshot.application.routePath).toBe("/");
      expect(snapshot.errors).toEqual([]);
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("captures one application failure when the production watchdog runs under StrictMode", async () => {
    const runtime = createTestRuntime();
    activeRuntimes.push(runtime);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = {
      id: "nse-control-gallery",
      packageName: "NSEControlGallery.app",
      displayName: "NSE Control Gallery",
    } as never;

    render(
      <React.StrictMode>
        <SynCloudOSProvider runtime={runtime}>
          <ConnectedStatusLayer />
          <SynCloudOSWatchdog
            runtime={runtime}
            watchdogName="NSEControlGallery.app presentation"
            scope="app"
            app={app}
            presentation={{ id: "stage-gallery", kind: "appView", zIndex: 100 }}
            resetKey="stage-gallery:nse-control-gallery"
            fallback={() => <div data-testid="gallery-fallback" />}
          >
            <ThrowingApp />
          </SynCloudOSWatchdog>
        </SynCloudOSProvider>
      </React.StrictMode>,
    );

    await screen.findByTestId("gallery-fallback");
    expect(runtime.store.getSnapshot().errors.map((error) => error.code)).toEqual(["APP_CONTENT_FAILED"]);
  });
});
