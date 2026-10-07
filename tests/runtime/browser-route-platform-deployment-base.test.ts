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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserRoutePlatform } from "../../src/SynCloudOS/PlatformAdapters/BrowserRoutePlatform";
import { createBrowserRuntimeEnvironment } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import type { BrowserNavigationTarget } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

class FakeNavigation extends EventTarget implements BrowserNavigationTarget {}

class FakeNavigateEvent extends Event {
  readonly canIntercept = true;
  readonly destination: { url: string; getState: () => unknown };
  readonly downloadRequest = null;
  readonly hashChange = false;
  readonly navigationType = "push" as const;
  readonly signal = new AbortController().signal;
  readonly intercept = vi.fn();

  constructor(url: string) {
    super("navigate");
    this.destination = { url, getState: () => ({ source: "browser" }) };
  }
}

describe("BrowserRoutePlatform deployment base projection", () => {
  beforeEach(() => {
    window.history.replaceState({ host: true }, "", "/nested/product/");
  });

  it("projects physical browser locations into logical SynCloudOS route space and restores the base on writes", () => {
    const environment = createBrowserRuntimeEnvironment();
    const platform = createBrowserRoutePlatform(environment, { deploymentBasePath: "/nested/product/" });

    expect(platform.getLocation()).toMatchObject({
      pathname: "/",
      search: "",
      hash: "",
      href: `${window.location.origin}/`,
    });

    platform.syncRoute("/fx-browser-lifecycle?mode=installed#probe", {
      replace: true,
      dispatchPopState: false,
    });

    expect(window.location.pathname).toBe("/nested/product/fx-browser-lifecycle");
    expect(window.location.search).toBe("?mode=installed");
    expect(window.location.hash).toBe("#probe");
    expect(platform.getLocation()).toMatchObject({
      pathname: "/fx-browser-lifecycle",
      search: "?mode=installed",
      hash: "#probe",
      href: `${window.location.origin}/fx-browser-lifecycle?mode=installed#probe`,
    });
  });

  it("projects same-base Navigation API destinations and declines paths outside the mounted product base", () => {
    const navigation = new FakeNavigation();
    const environment = {
      ...createBrowserRuntimeEnvironment(),
      navigation,
    };
    const platform = createBrowserRoutePlatform(environment, { deploymentBasePath: "/nested/product" });
    const observed: Array<{ url: string; canIntercept: boolean; state: unknown }> = [];
    platform.getNavigationTarget()?.addEventListener("navigate", (event) => {
      const projected = event as Event & {
        canIntercept: boolean;
        destination: { url: string; getState?: () => unknown };
      };
      observed.push({
        url: projected.destination.url,
        canIntercept: projected.canIntercept,
        state: projected.destination.getState?.(),
      });
    });

    navigation.dispatchEvent(new FakeNavigateEvent(`${window.location.origin}/nested/product/library?page=2`));
    navigation.dispatchEvent(new FakeNavigateEvent(`${window.location.origin}/other-product/library`));

    expect(observed).toEqual([
      { url: `${window.location.origin}/library?page=2`, canIntercept: true, state: { source: "browser" } },
      { url: `${window.location.origin}/other-product/library`, canIntercept: false, state: { source: "browser" } },
    ]);
  });
});
