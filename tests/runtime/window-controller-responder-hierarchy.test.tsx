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

import { cleanup, render } from "@testing-library/react";
import React, { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WindowLayer } from "../../src/Webspring/WindowLayer";
import { createWindowLayerFixture } from "../fixtures/windowLayerFixture";

afterEach(cleanup);

describe("WindowController responder ownership", () => {
  it("keeps one controller-owned application/window chain across StrictMode remounts and releases it on close", async () => {
    const fixture = await createWindowLayerFixture({
      windows: [{ id: "window-atmo", role: "standard", title: "Atmo Refresh" }],
    });
    const controller = fixture.runtime.windows.select("window-atmo");
    const view = render(
      <StrictMode>
        <SynCloudOSProvider runtime={fixture.runtime}>
          <WindowLayer contentRegistry={fixture.contentRegistry} />
        </SynCloudOSProvider>
      </StrictMode>,
    );

    expect(fixture.runtime.responders.get("application:session-notes")).toMatchObject({ parentId: "workspace", kind: "application" });
    expect(fixture.runtime.responders.get(controller.windowResponderId)).toMatchObject({ parentId: "application:session-notes", kind: "window" });
    expect(fixture.runtime.responders.inspect().registrations.filter(({ id }) => id === controller.windowResponderId)).toHaveLength(1);
    expect(fixture.runtime.focus.getActiveAnchors()).toMatchObject({
      applicationResponderId: "application:session-notes",
      windowResponderId: controller.windowResponderId,
    });
    expect(fixture.runtime.undo.resolveForResponder(fixture.runtime.responders.resolveChain(controller.windowResponderId))).toBe(
      fixture.runtime.undo.get({ kind: "window", id: controller.id }),
    );

    view.unmount();
    expect(fixture.runtime.responders.get(controller.windowResponderId)).not.toBeNull();

    await fixture.runtime.windows.requestClose(controller.id, { reason: "command" });
    expect(fixture.runtime.responders.get(controller.windowResponderId)).toBeNull();
    expect(fixture.runtime.responders.get("application:session-notes")).toBeNull();
    await fixture.cleanup();
  });
});
