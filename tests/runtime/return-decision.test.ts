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

import { describe, expect, it, vi } from "vitest";
import {
  confirmReturnDecisionKeepWindows,
  confirmReturnDecisionQuit,
} from "../../src/Webspring/returnDecision";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/SynCloudOS";

function stubRuntime(options: {
  readonly closeResult: unknown;
  readonly routeResult?: unknown;
  readonly windowsResult?: unknown;
  readonly appRoute?: string;
  readonly returnTransitionIds?: ReadonlyArray<string | null>;
  readonly clockStep?: number;
}) {
  const lease = Object.freeze({ applicationId: "window-owner", epoch: 1, token: "application-close:test" });
  const preparationToken = Object.freeze({
    tokenId: "application-close-preparation:test",
    runtimeId: "runtime:test",
    applicationId: "window-owner",
    resultWindowControllerId: "application:window-owner",
  });
  const preparedResult = options.windowsResult ?? { status: "ready", token: preparationToken };
  const close = vi.fn(() => ({ result: Promise.resolve(options.closeResult) }));
  const openRoute = vi.fn(() => ({ result: Promise.resolve(options.routeResult ?? { status: "completed", committed: true }) }));
  const prepareCloseApplication = vi.fn(() => Promise.resolve(preparedResult));
  const rollbackCloseApplication = vi.fn(() => Promise.resolve());
  const beginApplicationClose = vi.fn(() => lease);
  const endApplicationClose = vi.fn();
  const getApp = vi.fn(() => ({ route: options.appRoute ?? "/window-owner" }));
  const transitionIds = options.returnTransitionIds ?? [null];
  let snapshotCalls = 0;
  const store = {
    getSnapshot: () => {
      const id = transitionIds[Math.min(snapshotCalls, transitionIds.length - 1)];
      snapshotCalls += 1;
      return { webspring: { returnTransitionId: id } };
    },
  };
  let now = 0;
  const environment = {
    now: () => {
      now += options.clockStep ?? 1;
      return now;
    },
    setTimeout: (callback: () => void) => setTimeout(callback, 0),
  };
  const runtime = {
    lifecycle: { close },
    routes: { openRoute },
    windows: { prepareCloseApplication, rollbackCloseApplication, beginApplicationClose, endApplicationClose },
    apps: { getApp },
    store,
    environment,
  } as unknown as SynCloudOSRuntime;
  return {
    runtime,
    close,
    openRoute,
    prepareCloseApplication,
    rollbackCloseApplication,
    beginApplicationClose,
    endApplicationClose,
    lease,
    preparationToken,
  };
}

describe("return-to-Webspring decision flows", () => {
  it("prepares the complete close, routes live, then commits through lifecycle behind the shell", async () => {
    const { runtime, close, openRoute, prepareCloseApplication, rollbackCloseApplication, beginApplicationClose, endApplicationClose, lease, preparationToken } = stubRuntime({
      closeResult: { status: "completed", committed: true },
    });
    const order: string[] = [];
    beginApplicationClose.mockImplementationOnce(() => { order.push("lease"); return lease; });
    prepareCloseApplication.mockImplementationOnce(async () => { order.push("prepare"); return { status: "ready", token: preparationToken }; });
    openRoute.mockImplementationOnce(() => { order.push("route"); return { result: Promise.resolve({ status: "completed", committed: true }) }; });
    close.mockImplementationOnce(() => { order.push("close"); return { result: Promise.resolve({ status: "completed", committed: true }) }; });

    await expect(confirmReturnDecisionQuit(runtime, "window-owner")).resolves.toBe("closed");
    expect(order).toEqual(["lease", "prepare", "route", "close"]);
    expect(prepareCloseApplication).toHaveBeenCalledWith("window-owner", { reason: "application-quit" }, lease);
    expect(close).toHaveBeenCalledWith("window-owner", {
      reason: "return-decision-quit",
      closeTransaction: { authority: lease, preparation: preparationToken },
    });
    expect(openRoute).toHaveBeenCalledWith("/", { source: "system-ui:return-decision" });
    expect(rollbackCloseApplication).not.toHaveBeenCalled();
    expect(endApplicationClose).toHaveBeenCalledWith(lease);
  });

  it("waits for the return transition to settle before the trailing close", async () => {
    const { runtime, close } = stubRuntime({
      closeResult: { status: "completed", committed: true },
      returnTransitionIds: ["return-1", "return-1", null],
    });

    await expect(confirmReturnDecisionQuit(runtime, "window-owner")).resolves.toBe("closed");
    expect(close).toHaveBeenCalledWith("window-owner", {
      reason: "return-decision-quit",
      closeTransaction: { authority: expect.anything(), preparation: expect.anything() },
    });
  });

  it("refuses before routing when close preparation is refused", async () => {
    const { runtime, close, openRoute, endApplicationClose, lease } = stubRuntime({
      closeResult: { status: "completed", committed: true },
      windowsResult: { status: "cancelled", windowControllerId: "window-1" },
    });

    await expect(confirmReturnDecisionQuit(runtime, "window-owner")).resolves.toBe("refused");
    expect(close).not.toHaveBeenCalled();
    expect(openRoute).not.toHaveBeenCalled();
    expect(endApplicationClose).toHaveBeenCalledWith(lease);
  });

  it("routes back to the app when the trailing close is refused", async () => {
    const { runtime, openRoute, rollbackCloseApplication, endApplicationClose, lease, preparationToken } = stubRuntime({
      closeResult: { status: "failed", committed: false },
      appRoute: "/window-owner",
    });

    await expect(confirmReturnDecisionQuit(runtime, "window-owner")).resolves.toBe("refused");
    expect(openRoute).toHaveBeenNthCalledWith(1, "/", { source: "system-ui:return-decision" });
    expect(openRoute).toHaveBeenNthCalledWith(2, "/window-owner", { source: "system-ui:return-decision" });
    expect(rollbackCloseApplication).toHaveBeenCalledWith(preparationToken, lease);
    expect(endApplicationClose).toHaveBeenCalledWith(lease);
  });

  it("throws when the shell route does not commit", async () => {
    const { runtime, close, rollbackCloseApplication, endApplicationClose, lease, preparationToken } = stubRuntime({
      closeResult: { status: "completed", committed: true },
      routeResult: { status: "cancelled", committed: false, reason: "superseded" },
    });

    await expect(confirmReturnDecisionQuit(runtime, "window-owner")).rejects.toThrow(/did not complete/);
    expect(close).not.toHaveBeenCalled();
    expect(rollbackCloseApplication).toHaveBeenCalledWith(preparationToken, lease);
    expect(endApplicationClose).toHaveBeenCalledWith(lease);
  });

  it("treats a non-settling return animation as an error and rolls preparation back", async () => {
    const { runtime, close, rollbackCloseApplication, lease, preparationToken } = stubRuntime({
      closeResult: { status: "completed", committed: true },
      returnTransitionIds: ["return-stuck"],
      clockStep: 3_000,
    });

    await expect(confirmReturnDecisionQuit(runtime, "window-owner")).rejects.toThrow(/did not settle/);
    expect(close).not.toHaveBeenCalled();
    expect(rollbackCloseApplication).toHaveBeenCalledWith(preparationToken, lease);
  });

  it("keeps windows by returning without closing the application", async () => {
    const { runtime, close, openRoute } = stubRuntime({
      closeResult: { status: "completed", committed: true },
    });

    await confirmReturnDecisionKeepWindows(runtime);
    expect(close).not.toHaveBeenCalled();
    expect(openRoute).toHaveBeenCalledWith("/", { source: "system-ui:return-decision" });
  });

  it("throws when Keep Windows cannot commit the shell route", async () => {
    const { runtime } = stubRuntime({
      closeResult: { status: "completed", committed: true },
      routeResult: { status: "failed", committed: false, phase: "will", error: { message: "boom" } },
    });

    await expect(confirmReturnDecisionKeepWindows(runtime)).rejects.toThrow(/did not complete/);
  });
});
