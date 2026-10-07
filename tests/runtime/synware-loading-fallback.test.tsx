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
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SynWareEntryRenderer } from "../../src/Webspring/SynWareEntryRenderer";
import { createTestBundle, createTestRuntime } from "./helpers";

afterEach(cleanup);

it.each(["webspring-app-view-loading", "webspring-window-loading"])("keeps %s white and centered in a short surface after the host CSS cascade", loadingClassName => {
  const css = readFileSync("src/Webspring/WebspringHost.css", "utf8");
  const style = document.createElement("style");
  // Load the actual competing rules in source order; unrelated host styles are
  // not needed to verify this loading state's colour and sizing.
  style.textContent = [...css.matchAll(/[^{}]+\{[^{}]*\}/g)]
    .map(([rule]) => rule)
    .filter(rule => /^\s*\.[^{}]*(?:webspring-loading-state|webspring-app-view-loading|webspring-window-loading)[^{}]*\{/.test(rule))
    .join("\n");
  document.head.appendChild(style);
  try {
    const rendered = render(<div className={`${loadingClassName} webspring-loading-state`} />);
    const computed = getComputedStyle(rendered.container.firstElementChild!);
    expect(computed.color).toBe("rgb(255, 255, 255)");
    expect(computed.minHeight).toBe("0px");
    expect(computed.position).toBe("absolute");
    expect(computed.placeItems).toBe("center");
  } finally { style.remove(); }
});

it.each(["webspring-app-view-loading", "webspring-window-loading"])("renders the same named loading state for %s", loadingClassName => {
  const runtime = createTestRuntime();
  runtime.apps.registerBundle(createTestBundle({ id: "loading", displayName: "Chronosphere" }));
  const app = runtime.apps.getApp("loading")!;
  const rendered = render(<SynWareEntryRenderer runtime={runtime} app={app} responderId="application:loading" isLoading loadingClassName={loadingClassName} loadingLabel="Loading Chronosphere" loadingPackageLabel="Loading internal.package.app" missingComponentLabel="Missing" />);
  expect(screen.getByText("Loading Chronosphere…")).toBeTruthy();
  expect(screen.queryByText("Loading internal.package.app")).toBeNull();
  const state = rendered.container.querySelector<HTMLElement>(".webspring-loading-state")!;
  expect(state).not.toBeNull();
  expect(state.getAttribute("aria-busy")).toBe("true");
  expect(state.querySelector(".nse-loading-spinner--dark")).not.toBeNull();
  expect(state.firstElementChild!.querySelector(".nse-loading-spinner")).not.toBeNull();
});

it("shares the existing cotton image through the neutral loading token", () => {
  const components = readFileSync("src/NSE/Components/components.css", "utf8");
  const host = readFileSync("src/Webspring/WebspringHost.css", "utf8");
  expect(components).toMatch(/--nse-loading-background-image:\s*url\(["']?\/assets\/textures\/NSETileCotton\.jpg/);
  expect(host).toMatch(/\.webspring-loading-state\s*\{[^}]*background-image:\s*var\(--nse-loading-background-image\)/);
  expect(host).toMatch(/\.webspring-loading-state\s*\{[^}]*color:\s*#fff/);
});
