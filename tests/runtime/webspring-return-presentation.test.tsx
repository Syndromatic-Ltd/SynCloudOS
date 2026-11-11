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
});
