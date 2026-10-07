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

import { afterEach, describe, expect, it } from "vitest";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("application undo client cleanup")));
});

function fixture(id = "app-undo-client") {
  const runtime = createTestRuntime({ initialBundles: [createTestBundle({ id, route: `/${id}` })] });
  runtimes.push(runtime);
  const app = runtime.apps.getApp(id)!;
  const responderId = `application:${id}`;
  const siblingResponderId = `${responderId}:sibling`;
  if (!runtime.responders.get(responderId)) {
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  }
  runtime.responders.register({ id: siblingResponderId, kind: "view", parentId: responderId, scopeId: siblingResponderId });
  return { runtime, app, responderId, siblingResponderId };
}

describe("mounted application undo client", () => {
  it("keeps an application undo facade partitioned to its own mount", async () => {
    const { app, responderId, runtime, siblingResponderId } = fixture();
    const first = createMountedSynWareRuntime({ runtime, app, responderId });
    const second = createMountedSynWareRuntime({ runtime, app, responderId: siblingResponderId });
    const owner = { kind: "application" as const, id: app.id };
    const firstUndo = first.runtime.undo.create(owner, { maxEntries: 10 });
    const secondUndo = second.runtime.undo.get(owner)!;
    let value = 1;

    firstUndo.register(defineSyncUndoAction({
      name: "First mount edit",
      asyncPolicy: "forbid",
      undo: () => { value = 0; },
      redo: () => { value = 1; },
    }));

    expect(firstUndo.canUndo).toBe(true);
    expect(secondUndo.canUndo).toBe(false);
    await expect(secondUndo.undo()).resolves.toMatchObject({ status: "empty" });
    expect(value).toBe(1);
    await expect(firstUndo.undo()).resolves.toMatchObject({ status: "completed" });
    expect(value).toBe(0);
    first.dispose();
    second.dispose();
  });
});
