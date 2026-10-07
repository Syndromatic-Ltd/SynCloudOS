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
import { act, cleanup, render } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSRuntimeContext } from "../../src/SynCloudOSReact";
import { useWebspringReturnCompletion } from "../../src/Webspring/useWebspringReturnCompletion";
import { WebspringContentController } from "../../src/Webspring/webspringContent";

const { completeReturnRole } = vi.hoisted(() => ({
  completeReturnRole: vi.fn(() => true),
}));

const requiredTracks = ["material", "icons"] as const;

let reportTrack: ((track: string) => void) | null = null;

function ReturnCompletionHarness({ returnTransitionId }: { returnTransitionId: string | null }) {
  const { completeTrack } = useWebspringReturnCompletion(returnTransitionId, requiredTracks);
  reportTrack = completeTrack;
  return null;
}

function RuntimeHarness({ returnTransitionId }: { returnTransitionId: string | null }) {
  return (
    <SynCloudOSRuntimeContext.Provider value={{
      webspring: { completeReturnRole },
    } as never}>
      <ReturnCompletionHarness returnTransitionId={returnTransitionId} />
    </SynCloudOSRuntimeContext.Provider>
  );
}

function MaterialOnlyReturnCompletionHarness({ returnTransitionId }: { returnTransitionId: string | null }) {
  const { completeTrack } = useWebspringReturnCompletion(returnTransitionId, ["material"] as const);
  reportTrack = completeTrack;
  return null;
}

function MaterialOnlyRuntimeHarness({ returnTransitionId }: { returnTransitionId: string | null }) {
  return (
    <SynCloudOSRuntimeContext.Provider value={{
      webspring: { completeReturnRole },
    } as never}>
      <MaterialOnlyReturnCompletionHarness returnTransitionId={returnTransitionId} />
    </SynCloudOSRuntimeContext.Provider>
  );
}

function ImmediateReturnTracks({
  returnTransitionId,
  completeTrack,
}: {
  returnTransitionId: string | null;
  completeTrack: (track: string) => void;
}) {
  useEffect(() => {
    if (!returnTransitionId) return;
    completeTrack("icons");
    completeTrack("material");
  }, [completeTrack, returnTransitionId]);
  return null;
}

function ImmediateRuntimeHarness({ returnTransitionId }: { returnTransitionId: string | null }) {
  return (
    <SynCloudOSRuntimeContext.Provider value={{
      webspring: { completeReturnRole },
    } as never}>
      <ImmediateReturnCompletionHarness returnTransitionId={returnTransitionId} />
    </SynCloudOSRuntimeContext.Provider>
  );
}

function ImmediateReturnCompletionHarness({ returnTransitionId }: { returnTransitionId: string | null }) {
  const { completeTrack } = useWebspringReturnCompletion(returnTransitionId, requiredTracks);
  return <ImmediateReturnTracks returnTransitionId={returnTransitionId} completeTrack={completeTrack} />;
}



describe("Webspring return presentation", () => {
  afterEach(() => {
    cleanup();
    completeReturnRole.mockReset();
    reportTrack = null;
  });


  it("settles shellReturn once after all tracks settle for the active transition", () => {
    const { rerender } = render(<RuntimeHarness returnTransitionId="return-1" />);

    act(() => reportTrack?.("material"));
    expect(completeReturnRole).not.toHaveBeenCalled();

    act(() => reportTrack?.("icons"));
    expect(completeReturnRole).toHaveBeenCalledTimes(1);
    expect(completeReturnRole).toHaveBeenLastCalledWith("return-1", "shellReturn");

    act(() => {
      reportTrack?.("icons");
      reportTrack?.("unknown");
    });
    expect(completeReturnRole).toHaveBeenCalledTimes(1);

    rerender(<RuntimeHarness returnTransitionId="return-2" />);
    act(() => {
      reportTrack?.("icons");
      reportTrack?.("material");
    });
    expect(completeReturnRole).toHaveBeenCalledTimes(2);
    expect(completeReturnRole).toHaveBeenLastCalledWith("return-2", "shellReturn");
  });

  it("settles a material-only presentation without waiting for a nonexistent icon track", () => {
    render(<MaterialOnlyRuntimeHarness returnTransitionId="return-board" />);

    act(() => reportTrack?.("icons"));
    expect(completeReturnRole).not.toHaveBeenCalled();

    act(() => reportTrack?.("material"));
    expect(completeReturnRole).toHaveBeenCalledTimes(1);
    expect(completeReturnRole).toHaveBeenLastCalledWith("return-board", "shellReturn");
  });

  it("accepts immediate reduced-motion track completion from a child effect for the new return transition", () => {
    const { rerender } = render(<ImmediateRuntimeHarness returnTransitionId={null} />);
    expect(completeReturnRole).not.toHaveBeenCalled();

    rerender(<ImmediateRuntimeHarness returnTransitionId="return-reduced-motion" />);

    expect(completeReturnRole).toHaveBeenCalledTimes(1);
    expect(completeReturnRole).toHaveBeenLastCalledWith("return-reduced-motion", "shellReturn");
  });

  it("retries a refused completion without letting a stale transition consume the next role", () => {
    completeReturnRole
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValue(true);
    const { rerender } = render(<RuntimeHarness returnTransitionId="stale-return" />);

    act(() => {
      reportTrack?.("material");
      reportTrack?.("icons");
    });
    expect(completeReturnRole).toHaveBeenLastCalledWith("stale-return", "shellReturn");

    act(() => reportTrack?.("icons"));
    expect(completeReturnRole).toHaveBeenCalledTimes(2);
    expect(completeReturnRole).toHaveBeenLastCalledWith("stale-return", "shellReturn");

    rerender(<RuntimeHarness returnTransitionId="valid-return" />);
    act(() => {
      reportTrack?.("material");
      reportTrack?.("icons");
    });
    expect(completeReturnRole).toHaveBeenCalledTimes(3);
    expect(completeReturnRole).toHaveBeenLastCalledWith("valid-return", "shellReturn");
  });

  it("drops partial completion when a return is cancelled", () => {
    const { rerender } = render(<RuntimeHarness returnTransitionId="cancelled-return" />);
    act(() => reportTrack?.("material"));
    rerender(<RuntimeHarness returnTransitionId={null} />);
    act(() => reportTrack?.("icons"));
    expect(completeReturnRole).not.toHaveBeenCalled();

    rerender(<RuntimeHarness returnTransitionId="next-return" />);
    act(() => reportTrack?.("icons"));
    expect(completeReturnRole).not.toHaveBeenCalled();
    act(() => reportTrack?.("material"));
    expect(completeReturnRole).toHaveBeenCalledExactlyOnceWith("next-return", "shellReturn");
  });


  it("keeps content reads bounded, ordered, resource-scoped and generation-safe", async () => {
    let resolveFirst: ((items: readonly never[]) => void) | undefined;
    const first = new Promise<readonly never[]>((resolve) => { resolveFirst = resolve; });
    const reads = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce([
        { id: "b", title: "Older", publishedAt: "2026-09-08T10:00:00.000Z", image: { url: "hero", alternativeText: "Hero" }, destination: { appId: "journal", route: "/journal/b" } },
        { id: "a", title: "Newer", publishedAt: "2026-09-09T10:00:00.000Z", image: { url: "https://outside.test/hero.png", alternativeText: "Outside" }, destination: { appId: "journal", route: "/journal/a" } },
        { id: "unsafe", title: "Unsafe", destination: { appId: "journal", route: "https://outside.test" } },
      ]);
    const controller = new WebspringContentController({ sections: [{ id: "latest", title: { key: "latest", fallback: "Latest" }, sourceId: "journal", limit: 99, empty: "hide" }] }, {
      journal: { read: reads, resolveImage: (resource) => resource === "hero" ? "/registered/hero.png" : null },
    });
    controller.start();
    const refresh = controller.refresh();
    await refresh;
    resolveFirst?.([]);
    await Promise.resolve();

    expect(reads.mock.calls.every(([request]) => request.limit === 20)).toBe(true);
    expect(controller.getSnapshot()[0]).toMatchObject({ id: "latest", empty: "hide", state: { status: "ready" } });
    const state = controller.getSnapshot()[0].state;
    expect(state.status === "ready" ? state.items.map((item) => item.id) : []).toEqual(["a", "b"]);
    expect(state.status === "ready" ? state.items[0].image : undefined).toBeUndefined();
    expect(state.status === "ready" ? state.items[1].image?.url : undefined).toBe("/registered/hero.png");
    controller.dispose();
  });

  it("publishes independent content sections and cancels a hanging source on disposal", async () => {
    let hangingSignal: AbortSignal | undefined;
    const controller = new WebspringContentController({ sections: [
      { id: "slow", title: { key: "slow" }, sourceId: "slow", limit: Number.NaN, empty: "message" },
      { id: "fast", title: { key: "fast" }, sourceId: "fast", limit: 2, empty: "message" },
      { id: "optional", title: { key: "optional" }, sourceId: "missing", limit: 2, empty: "hide" },
    ] }, {
      slow: { read: ({ signal }) => { hangingSignal = signal; return new Promise(() => undefined); } },
      fast: { read: async () => [{ id: "one", title: "One", destination: { appId: "journal", route: "/journal/one" } }] },
    });

    controller.start();
    await vi.waitFor(() => expect(controller.getSnapshot()[1].state.status).toBe("ready"));
    expect(controller.getSnapshot()[0].state.status).toBe("loading");
    expect(controller.getSnapshot()[2]).toMatchObject({ empty: "hide", state: { status: "unavailable" } });
    controller.dispose();
    expect(hangingSignal?.aborted).toBe(true);
  });
});
