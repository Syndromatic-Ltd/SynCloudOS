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
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebspringEntrance } from "../../src/Webspring/useWebspringEntrance";

const clock = {
  setTimeout: (callback: () => void, delay: number) => window.setTimeout(callback, delay),
  clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Webspring gated entrance", () => {
  it("holds the entrance until the presented login window finishes exiting", () => {
    const { result, rerender } = renderHook(({ gated }) => useWebspringEntrance(clock, true, gated, false), { initialProps: { gated: true } });
    expect(result.current.entrancePhase).toBe("holding");
    expect(result.current.loginReady).toBe(false);
    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.loginReady).toBe(true);
    rerender({ gated: false });
    expect(result.current.entrancePhase).toBe("holding");
    act(() => result.current.onLoginExited());
    expect(result.current.entrancePhase).toBe("ready");
    expect(result.current.loginReady).toBe(false);
  });

  it("does not present a stale gate when authentication completes during the icon catch", () => {
    const { result, rerender } = renderHook(({ gated }) => useWebspringEntrance(clock, true, gated, false), { initialProps: { gated: true } });
    act(() => vi.advanceTimersByTime(100));
    rerender({ gated: false });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.entrancePhase).toBe("ready");
    expect(result.current.loginReady).toBe(false);
  });

  it("does not release a renewed gate when an earlier dismissal completes", () => {
    const { result, rerender } = renderHook(({ gated }) => useWebspringEntrance(clock, true, gated, false), { initialProps: { gated: true } });
    act(() => vi.advanceTimersByTime(1200));
    rerender({ gated: false });
    rerender({ gated: true });
    act(() => result.current.onLoginExited());
    expect(result.current.entrancePhase).toBe("holding");
    expect(result.current.loginReady).toBe(true);
  });

  it("skips the decorative wait with reduced motion but still waits for boot", () => {
    const { result, rerender } = renderHook(({ booted }) => useWebspringEntrance(clock, booted, true, true), { initialProps: { booted: false } });
    act(() => vi.runOnlyPendingTimers());
    expect(result.current.entrancePhase).toBe("waiting");
    expect(result.current.loginReady).toBe(false);
    rerender({ booted: true });
    act(() => vi.runOnlyPendingTimers());
    expect(result.current.loginReady).toBe(true);
  });

  it("reconstructs a provider-return scene and releases it only after dismissal", () => {
    const { result, rerender } = renderHook(({ booted }) => useWebspringEntrance(clock, booted, false, false, true), { initialProps: { booted: false } });
    expect(result.current.entrancePhase).toBe("holding");
    expect(result.current.restoringLogin).toBe(true);
    rerender({ booted: true });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.restoringLogin).toBe(false);
    expect(result.current.entrancePhase).toBe("holding");
    act(() => result.current.onLoginExited());
    expect(result.current.entrancePhase).toBe("ready");
  });
});
