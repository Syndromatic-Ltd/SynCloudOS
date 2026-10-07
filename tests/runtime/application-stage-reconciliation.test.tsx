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

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageLayer } from "../../src/Webspring/ApplicationStageLayer";
import { WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { createTestBundle, createTestRuntime } from "./helpers";

const stageEffects = vi.hoisted(() => ({ events: [] as string[] }));

vi.mock("../../src/Webspring/SynWareEntryRenderer", async () => {
  const React = await import("react");
  return {
    SynWareEntryRenderer: ({ app }: { readonly app: { readonly id: string; readonly displayName: string } }) => {
      React.useLayoutEffect(() => {
        stageEffects.events.push(`setup:${app.id}`);
        return () => { stageEffects.events.push(`cleanup:${app.id}`); };
      }, [app.id]);
      return React.createElement("div", { "data-stage-app-id": app.id }, app.displayName);
    },
  };
});

describe("ApplicationStageLayer reconciliation", () => {
  it("does not replay the outgoing stage when an incoming MultiSwitch stage is inserted", () => {
    const runtime = createTestRuntime({ id: "runtime:stage-reconciliation" });
    runtime.apps.registerMany([
      createTestBundle({ id: "studio", route: "/studio" }),
      createTestBundle({ id: "software", route: "/software" }),
    ]);
    const studio = runtime.apps.getApp("studio")!;
    const software = runtime.apps.getApp("software")!;
    const apps = { studio, software };
    const registry = new WindowContentRendererRegistry();
    const frame = (switching: boolean) => (
      <React.StrictMode>
        <SynCloudOSProvider runtime={runtime}>
          <ApplicationStageLayer
            windowContentRegistry={registry}
            apps={apps}
            lifecycle={switching ? { studio: "suspended", software: "active" } : { studio: "active", software: "idle" }}
            activeAppId={switching ? "software" : "studio"}
            multiSwitch={switching ? {
              id: "multiswitch:back",
              status: "switching",
              fromAppId: "studio",
              toAppId: "software",
              fromRoute: "/studio",
              toRoute: "/software",
              source: "history",
              startedAt: runtime.environment.now(),
              completedAt: null,
            } : undefined}
          />
        </SynCloudOSProvider>
      </React.StrictMode>
    );

    const view = render(frame(false));
    stageEffects.events.length = 0;
    view.rerender(frame(true));

    expect(stageEffects.events.filter((event) => event === "cleanup:studio")).toEqual([]);
    expect([...view.container.querySelectorAll<HTMLElement>("[data-stage-app-id]")].map((element) => element.dataset.stageAppId)).toEqual([
      "studio",
      "software",
    ]);
    view.unmount();
  });
});
