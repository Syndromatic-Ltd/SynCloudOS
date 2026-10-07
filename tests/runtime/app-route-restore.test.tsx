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
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";
import { defineWebspring, type WebspringViewProps } from "../../src/Webspring/public";

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1, id: "com.example.webspring.route-test", version: "1.0.0", title: "Route test",
    webspringShell: {
      views: [{ id: "route", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "route", tablet: "route", mobile: "route" },
      homeRoute: "/", branding: { name: { key: "site.name", fallback: "Route test" } },
    },
  },
  components: {
    route: ({ model }: WebspringViewProps) => <main data-testid="webspring" data-route={model.routePath} />,
  },
});

vi.mock("../../src/Webspring/SystemUILayer", () => ({
  SystemUILayer: () => React.createElement("div", { "data-testid": "system-ui" })
}));

describe("App root composition", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem("syncloudos:last-active-app-route", "/software");
  });

  afterEach(cleanup);

  it("renders provider-owned routes without restoring a persisted previous app", async () => {
    const { App } = await import("../../src/App");
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => { draft.application.routePath = "/studio"; });
    const rendered = render(React.createElement(SynCloudOSProvider, { runtime }, React.createElement(App, { shell })));

    expect(screen.getByTestId("webspring").getAttribute("data-route")).toBe("/studio");
    expect(screen.getByTestId("system-ui")).toBeTruthy();
    expect(window.sessionStorage.getItem("syncloudos:last-active-app-route")).toBe("/software");
    expect(screen.getByRole("status", { name: "Starting SynCloudOS" })).toBeTruthy();
    await act(async () => {
      runtime.store.mutate((draft) => { draft.booted = true; draft.application.routePath = "/about"; });
    });
    expect(screen.getByTestId("webspring").getAttribute("data-route")).toBe("/about");
    await waitFor(() => expect(screen.queryByRole("status", { name: "Starting SynCloudOS" })).toBeNull());

    rendered.unmount();
    await runtime.dispose("route test cleanup");
  });

  it("releases the startup curtain at the presentable statechart boundary before boot completion", async () => {
    const { App } = await import("../../src/App");
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => {
      draft.booted = false;
      draft.statechart.currentState = "active.application.active";
      draft.application.routePath = "/studio";
    });

    const rendered = render(React.createElement(SynCloudOSProvider, { runtime }, React.createElement(App, { shell })));

    expect(runtime.store.getSnapshot().booted).toBe(false);
    expect(runtime.store.getSnapshot().statechart.currentState).toBe("active.application.active");
    await waitFor(() => expect(screen.queryByRole("status", { name: "Starting SynCloudOS" })).toBeNull());

    rendered.unmount();
    await runtime.dispose("startup presentation cleanup");
  });
});
