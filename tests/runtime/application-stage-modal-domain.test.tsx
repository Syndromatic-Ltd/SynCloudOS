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

import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageLayer } from "../../src/Webspring/ApplicationStageLayer";
import { createWindowTestDependencies, modalWindow } from "../fixtures/windowTestDependencies";

vi.mock("../../src/Webspring/ApplicationStageHost", () => ({
  ApplicationStageHost: ({ app }: { readonly app: SynCloudOSAppInfo }) => (
    <div data-application-stage-host={app.id}>{app.displayName}</div>
  ),
}));

describe("ApplicationStageLayer modal domain", () => {
  afterEach(() => vi.restoreAllMocks());

  it("restores exact physical inert and aria-hidden state when the top-level modal closes", async () => {
    const fixture = createWindowTestDependencies();
    Object.defineProperty(fixture.runtime, "windows", { configurable: true, value: fixture.manager });
    const app = {
      id: "com.syndromatic.Notes",
      displayName: "Notes",
      presentation: "appView",
      window: { title: "Notes" },
    } as SynCloudOSAppInfo;
    const modal = fixture.manager.create(modalWindow("application-stage-modal"));
    await fixture.manager.open(modal.id);
    const view = render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <ApplicationStageLayer
          apps={{ [app.id]: app }}
          lifecycle={{ [app.id]: "active" }}
          activeAppId={app.id}
        />
      </SynCloudOSProvider>,
    );
    const stage = view.container.querySelector<HTMLElement>(".webspring-apps-container")!;

    expect(stage.hasAttribute("inert")).toBe(true);
    expect(stage.getAttribute("aria-hidden")).toBe("true");
    await act(() => fixture.manager.requestClose(modal.id, { reason: "command" }));
    await waitFor(() => expect(stage.hasAttribute("inert")).toBe(false));
    expect(stage.hasAttribute("aria-hidden")).toBe(false);
    await fixture.cleanup();
  });

  it("physically blocks the active application stage for a parentless system modal", async () => {
    const fixture = createWindowTestDependencies();
    Object.defineProperty(fixture.runtime, "windows", { configurable: true, value: fixture.manager });
    const app = {
      id: "com.syndromatic.Notes",
      displayName: "Notes",
      presentation: "appView",
      window: { title: "Notes" },
    } as SynCloudOSAppInfo;
    const modal = fixture.manager.create(modalWindow("system-application-stage-modal", null, {
      applicationId: null,
      applicationSessionId: null,
    }));
    await fixture.manager.open(modal.id);
    const view = render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <ApplicationStageLayer
          apps={{ [app.id]: app }}
          lifecycle={{ [app.id]: "active" }}
          activeAppId={app.id}
        />
      </SynCloudOSProvider>,
    );
    const stage = view.container.querySelector<HTMLElement>(".webspring-apps-container")!;

    expect(stage.hasAttribute("inert")).toBe(true);
    expect(stage.getAttribute("aria-hidden")).toBe("true");
    expect(stage.style.pointerEvents).toBe("none");
    await fixture.cleanup();
  });
});
