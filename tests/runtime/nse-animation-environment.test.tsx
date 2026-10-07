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

import { cleanup, act, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AFXTimingFunction } from "../../src/FX/AnimationFX/public";
import {
  NSEAnimationDefaults,
  NSEAnimationEnvironmentProvider,
  useNSEAnimationEnvironment,
} from "../../src/NSE/sdkPackageEntry";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
} from "./helpers";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type MediaChangeListener = (event: MediaQueryListEvent) => void;

type InstalledMedia = {
  readonly media: MediaQueryList;
  readonly matchMedia: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly addListener: ReturnType<typeof vi.fn>;
  readonly removeListener: ReturnType<typeof vi.fn>;
  setMatches(matches: boolean): void;
};

let restoreMatchMedia: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

function installMatchMedia(
  initialMatches: boolean,
  mode: "modern" | "legacy" = "modern",
): InstalledMedia {
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const listeners = new Set<MediaChangeListener>();
  let matches = initialMatches;
  const addEventListener = vi.fn((
    _type: string,
    listener: MediaChangeListener,
  ) => listeners.add(listener));
  const removeEventListener = vi.fn((
    _type: string,
    listener: MediaChangeListener,
  ) => listeners.delete(listener));
  const addListener = vi.fn((listener: MediaChangeListener) => listeners.add(listener));
  const removeListener = vi.fn((listener: MediaChangeListener) => listeners.delete(listener));
  const media = {
    media: REDUCED_MOTION_QUERY,
    get matches() {
      return matches;
    },
    onchange: null,
    ...(mode === "modern"
      ? { addEventListener, removeEventListener }
      : { addListener, removeListener }),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn((_query: string) => media);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  restoreMatchMedia = () => {
    if (previous) Object.defineProperty(window, "matchMedia", previous);
    else delete (window as Window & { matchMedia?: typeof window.matchMedia }).matchMedia;
  };

  return {
    media,
    matchMedia,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
    setMatches(nextMatches) {
      matches = nextMatches;
      const event = { matches, media, type: "change" } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

function EnvironmentProbe({ label = "environment" }: { readonly label?: string }) {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return (
    <output data-testid={label} data-reduced-motion={String(reducedMotion)}>
      {String(reducedMotion)}
    </output>
  );
}

function createRuntimeWithFrames() {
  const baseEnvironment = createTestRuntimeEnvironment();
  const listeners = new Set<() => void>();
  let reducedMotion = false;
  const frames = {
    now: () => 0,
    requestFrame: () => () => undefined,
    get reducedMotion() {
      return reducedMotion;
    },
    suspended: false,
    subscribeState(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const runtime = createTestRuntime({
    environment: { ...baseEnvironment, animationFrames: frames },
  });
  return {
    runtime,
    setReducedMotion(nextReducedMotion: boolean) {
      reducedMotion = nextReducedMotion;
      for (const listener of listeners) listener();
    },
  };
}

describe("NSE animation environment", () => {
  it("falls back to the system media query and tracks modern media changes", () => {
    const media = installMatchMedia(false);
    render(
      <NSEAnimationEnvironmentProvider>
        <EnvironmentProbe />
      </NSEAnimationEnvironmentProvider>,
    );

    expect(screen.getByTestId("environment").dataset.reducedMotion).toBe("false");
    expect(media.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(media.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );

    act(() => media.setMatches(true));
    expect(screen.getByTestId("environment").dataset.reducedMotion).toBe("true");
  });

  it("supports legacy media-listener subscriptions", () => {
    const media = installMatchMedia(false, "legacy");
    render(
      <NSEAnimationEnvironmentProvider>
        <EnvironmentProbe />
      </NSEAnimationEnvironmentProvider>,
    );

    expect(media.addListener).toHaveBeenCalledWith(expect.any(Function));
    expect(media.addEventListener).not.toHaveBeenCalled();
    act(() => media.setMatches(true));
    expect(screen.getByTestId("environment").dataset.reducedMotion).toBe("true");
  });

  it("composes explicit provider requests monotonically", () => {
    installMatchMedia(false);
    const view = render(
      <NSEAnimationEnvironmentProvider reducedMotion>
        <NSEAnimationEnvironmentProvider reducedMotion={false}>
          <EnvironmentProbe />
        </NSEAnimationEnvironmentProvider>
      </NSEAnimationEnvironmentProvider>,
    );
    expect(screen.getByTestId("environment").dataset.reducedMotion).toBe("true");

    view.rerender(
      <NSEAnimationEnvironmentProvider reducedMotion={false}>
        <NSEAnimationEnvironmentProvider reducedMotion>
          <EnvironmentProbe />
        </NSEAnimationEnvironmentProvider>
      </NSEAnimationEnvironmentProvider>,
    );
    expect(screen.getByTestId("environment").dataset.reducedMotion).toBe("true");
  });

  it("keeps independent roots scoped to their own provider values", () => {
    installMatchMedia(false);
    const first = render(
      <NSEAnimationEnvironmentProvider reducedMotion>
        <EnvironmentProbe label="first" />
      </NSEAnimationEnvironmentProvider>,
    );
    const second = render(
      <NSEAnimationEnvironmentProvider reducedMotion={false}>
        <EnvironmentProbe label="second" />
      </NSEAnimationEnvironmentProvider>,
    );

    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("true");
    expect(screen.getByTestId("second").dataset.reducedMotion).toBe("false");
    first.rerender(
      <NSEAnimationEnvironmentProvider reducedMotion={false}>
        <EnvironmentProbe label="first" />
      </NSEAnimationEnvironmentProvider>,
    );
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("false");
    expect(screen.getByTestId("second").dataset.reducedMotion).toBe("false");
    second.unmount();
  });

  it("publishes the exact deeply frozen AFX-compatible defaults", () => {
    const expected = {
      easing: {
        standard: { kind: "cubic-bezier", x1: 0.2, y1: 0.8, x2: 0.2, y2: 1 },
        emphasized: { kind: "cubic-bezier", x1: 0.2, y1: 0.9, x2: 0.18, y2: 1 },
        decelerate: { kind: "cubic-bezier", x1: 0.16, y1: 0.94, x2: 0.18, y2: 1 },
        accelerate: { kind: "cubic-bezier", x1: 0.62, y1: 0, x2: 0.92, y2: 0.42 },
      },
      durationSeconds: { instant: 0.01, reducedFade: 0.12, quick: 0.16, standard: 0.18 },
    };

    expect(NSEAnimationDefaults).toEqual(expected);
    expect(Object.isFrozen(NSEAnimationDefaults)).toBe(true);
    expect(Object.isFrozen(NSEAnimationDefaults.easing)).toBe(true);
    expect(Object.isFrozen(NSEAnimationDefaults.durationSeconds)).toBe(true);
    for (const easing of Object.values(NSEAnimationDefaults.easing)) {
      expect(Object.isFrozen(easing)).toBe(true);
      expect(() => new AFXTimingFunction(easing)).not.toThrow();
    }
  });

  it("derives host motion from each runtime's settings, store, and frame state", () => {
    const first = createRuntimeWithFrames();
    const second = createRuntimeWithFrames();
    render(
      <>
        <SynCloudOSProvider runtime={first.runtime}>
          <EnvironmentProbe label="first" />
        </SynCloudOSProvider>
        <SynCloudOSProvider runtime={second.runtime}>
          <EnvironmentProbe label="second" />
        </SynCloudOSProvider>
      </>,
    );

    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("false");
    expect(screen.getByTestId("second").dataset.reducedMotion).toBe("false");

    act(() => first.runtime.settings.set("motion", "reduced"));
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("true");
    expect(screen.getByTestId("second").dataset.reducedMotion).toBe("false");

    act(() => {
      first.runtime.settings.set("motion", "standard");
      first.runtime.store.mutate((draft) => {
        draft.responsive.prefersReducedMotion = true;
      });
    });
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("false");

    act(() => first.runtime.settings.set("motion", "system"));
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("true");

    act(() => {
      first.runtime.store.mutate((draft) => {
        draft.responsive.prefersReducedMotion = false;
      });
      first.setReducedMotion(true);
    });
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("true");

    act(() => first.runtime.settings.set("motion", "standard"));
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("true");
    act(() => first.setReducedMotion(false));
    expect(screen.getByTestId("first").dataset.reducedMotion).toBe("false");
    expect(screen.getByTestId("second").dataset.reducedMotion).toBe("false");
  });
});
