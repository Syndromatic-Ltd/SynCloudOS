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
import { atmoPaintCSS, withoutScopeTwins } from "../fixtures/atmoStylesheets";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SynWareEntryRenderer } from "../../src/Webspring/SynWareEntryRenderer";
import { createTestBundle, createTestRuntime } from "./helpers";

afterEach(cleanup);

const loadingSelector = '[data-nse-control="view"][data-nse-part="loading"][data-nse-role="application"]';
const loadingPaint = [...withoutScopeTwins(atmoPaintCSS()).matchAll(/[^{}]+\{[^{}]*\}/gu)]
  .map(([rule]) => rule.trim())
  .find(rule => rule.slice(0, rule.indexOf("{")).trim() === loadingSelector) ?? "";

function renderLoadingState(loadingClassName: string) {
  const runtime = createTestRuntime();
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.loading", displayName: "Chronosphere" }));
  const app = runtime.apps.getApp("com.example.loading")!;
  return render(<SynWareEntryRenderer
    runtime={runtime}
    app={app}
    responderId="application:com.example.loading"
    isLoading
    loadingClassName={loadingClassName}
    loadingLabel="Loading Chronosphere"
    loadingPackageLabel="Loading internal.package.app"
    missingComponentLabel="Missing"
  />);
}

it.each(["webspring-app-view-loading", "webspring-window-loading"])("keeps %s white and centred in a short surface after the host CSS cascade", loadingClassName => {
  const css = withoutScopeTwins(readFileSync("src/Webspring/WebspringHost.css", "utf8"));
  const style = document.createElement("style");
  // Flatten the relevant rules for jsdom, with framework structure first and Atmo paint after it.
  const structure = [...css.matchAll(/[^{}]+\{[^{}]*\}/gu)]
    .map(([rule]) => rule)
    .filter(rule => /^\s*\.[^{}]*(?:webspring-loading-state|webspring-app-view-loading|webspring-window-loading)[^{}]*\{/.test(rule));
  style.textContent = [...structure, loadingPaint].join("\n");
  document.head.appendChild(style);
  try {
    const { container } = renderLoadingState(loadingClassName);
    const state = container.querySelector(loadingSelector)!;
    expect(state).not.toBeNull();
    const computed = getComputedStyle(state);
    expect(computed.color).toBe("rgb(255, 255, 255)");
    expect(computed.minHeight).toBe("0px");
    expect(computed.position).toBe("absolute");
    expect(computed.placeItems).toBe("center");
  } finally { style.remove(); }
});

it.each(["webspring-app-view-loading", "webspring-window-loading"])("renders the same named loading state for %s", loadingClassName => {
  const { container } = renderLoadingState(loadingClassName);
  expect(screen.getByText("Loading Chronosphere…")).toBeTruthy();
  expect(screen.queryByText("Loading internal.package.app")).toBeNull();
  const state = container.querySelector(loadingSelector)!;
  expect(state).not.toBeNull();
  expect(state.getAttribute("aria-busy")).toBe("true");
  expect(state.querySelector(".nse-loading-spinner--dark")).not.toBeNull();
  expect(state.firstElementChild!.querySelector(".nse-loading-spinner")).not.toBeNull();
});

it("shares the existing cotton image through the neutral loading token", () => {
  const defaults = readFileSync("src/NSE/Structure/defaults.css", "utf8");
  expect(defaults).toMatch(/--nse-loading-background-image:\s*url\(["']?\/assets\/textures\/NSETileCotton\.jpg/);
  expect(loadingPaint).toMatch(/background-image:\s*var\(--nse-loading-background-image\)/);
  expect(loadingPaint).toMatch(/color:\s*#fff/);
});
