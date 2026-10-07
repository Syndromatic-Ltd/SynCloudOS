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
import { describe, expect, it } from "vitest";
import { openSynCloudOSRuntimeRoute } from "../../src/SynCloudOS/Routing/runtimeRouteClient";
import { createTestBundle, createTestRuntime } from "./helpers";

describe("runtime route client", () => {
  it("preserves the caller's query and fragment when synchronising a committed route", async () => {
    const runtime = createTestRuntime({ initialBundles: [createTestBundle({ id: "studio", route: "/studio" })] });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    window.history.replaceState({}, "", "/");

    const handle = openSynCloudOSRuntimeRoute(runtime, "/studio?folder=nse#selected");
    await handle.result;
    await Promise.resolve();

    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/studio?folder=nse#selected");
  });
});
