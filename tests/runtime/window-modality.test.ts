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

import { afterEach, describe, expect, it } from "vitest";
import {
  createWindowTestDependencies,
  modalWindow,
  sheetWindow,
  standardWindow,
} from "../fixtures/windowTestDependencies";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("window modality", () => {
  it("blocks a parent domain and restores focus to its last live content responder", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const modal = fixture.manager.create(modalWindow("modal", parent.id));
    await fixture.manager.open(parent.id);
    fixture.focus.requestFocus(parent.contentState.status === "loaded" ? parent.contentState.rootResponderId : parent.windowResponderId);
    await fixture.manager.open(modal.id);

    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual([parent.id]);
    expect(fixture.focus.requestFocus(parent.contentState.status === "loaded" ? parent.contentState.rootResponderId : parent.windowResponderId)).toMatchObject({ status: "blocked" });
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe(modal.id);
    const parentBounds = parent.record.bounds;
    fixture.manager.setBounds(parent.id, { ...parentBounds, x: parentBounds.x + 40 }, "programmatic");
    fixture.manager.minimise(parent.id);
    expect(parent.record.bounds).toBe(parentBounds);
    expect(parent.record.state).toBe("open");

    await fixture.manager.requestClose(modal.id, { reason: "command" });
    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual([]);
    expect(fixture.focus.getFocusedResponderId()).toBe(parent.contentState.status === "loaded" ? parent.contentState.rootResponderId : parent.windowResponderId);
    expect(fixture.focus.inspect().scopes.map(({ id }) => id)).not.toContain("window:modal");
  });

  it("nests modal scopes and keeps the outer modal blocked until its sheet ends", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const modal = fixture.manager.create(modalWindow("modal", parent.id));
    const sheet = fixture.manager.create(sheetWindow("sheet", modal.id));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(modal.id);
    await fixture.manager.attachSheet(modal.id, sheet.id);

    expect(fixture.focus.inspect().scopes).toContainEqual(expect.objectContaining({
      id: "window:sheet",
      parentScopeId: "window:modal",
      parentResponderId: "window:modal",
    }));
    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual(["parent", "modal"]);

    const firstPending = fixture.manager.endSheet(sheet.id, { action: "save" });
    const repeatedPending = fixture.manager.endSheet(sheet.id, { action: "discard" });
    expect(repeatedPending).toBe(firstPending);
    const first = await firstPending;
    const repeated = await repeatedPending;
    expect(first).toEqual({ outcome: "closed", windowControllerId: sheet.id, data: { action: "save" } });
    expect(repeated).toBe(first);
    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual(["parent"]);
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe(modal.id);
  });

  it("physically blocks an equal-level outer modal beneath a nested modal", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const outer = fixture.manager.create(modalWindow("outer", parent.id));
    const inner = fixture.manager.create(modalWindow("inner", outer.id));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(outer.id);
    await fixture.manager.open(inner.id);

    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual(["parent", "outer"]);
    expect(fixture.focus.inspect().scopes).toContainEqual(expect.objectContaining({
      id: "window:inner",
      parentScopeId: "window:outer",
    }));
  });

  it("blocks every lower-level window for an application modal without a parent", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const first = fixture.manager.create(standardWindow("first"));
    const second = fixture.manager.create(standardWindow("second"));
    const modal = fixture.manager.create(modalWindow("modal"));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    await fixture.manager.open(modal.id);

    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual(["first", "second"]);
    fixture.manager.makeKey(first.id);
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe(modal.id);
    await expect(fixture.manager.requestClose(first.id, { reason: "command" })).resolves.toEqual({
      outcome: "refused",
      windowControllerId: first.id,
      reason: "blocked",
    });
    expect(first.record.state).toBe("open");
  });
});
