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
  panelWindow,
  popoverWindow,
  sheetWindow,
  standardWindow,
} from "../fixtures/windowTestDependencies";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("window relationships", () => {
  it("keeps a sheet directly above its parent and blocks the parent responder", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const unrelated = fixture.manager.create(standardWindow("unrelated"));
    const sheet = fixture.manager.create(sheetWindow("sheet", parent.id));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(unrelated.id);
    await fixture.manager.attachSheet(parent.id, sheet.id);

    expect(fixture.manager.list().map(({ id }) => id)).toEqual(["unrelated", "parent", "sheet"]);
    expect(fixture.manager.snapshot().blockedWindowControllerIds).toEqual(["parent"]);
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe("sheet");
    expect(fixture.manager.snapshot().mainWindowControllerId).toBe("parent");
    expect(fixture.focus.inspect().scopes).toContainEqual({
      id: "window:sheet",
      kind: "modal",
      parentResponderId: "window:parent",
      modal: true,
      trapFocus: true,
    });

    fixture.manager.makeKey(parent.id);
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe(sheet.id);
    expect(fixture.manager.list().map(({ id }) => id)).toEqual(["unrelated", "parent", "sheet"]);
  });

  it("dismisses an unpinned popover without closing its parent or panels", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const panel = fixture.manager.create(panelWindow("inspector", { parentWindowControllerId: parent.id, pinned: false }));
    const popover = fixture.manager.create(popoverWindow("popover", parent.id));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(panel.id, { activate: false });
    await fixture.manager.open(popover.id);

    await fixture.manager.dismissTransientWindows({ reason: "outside-pointer", except: parent.id });
    expect(fixture.manager.list().map(({ id }) => id)).toEqual(["parent", "inspector"]);
    expect(parent.record.state).toBe("open");
    expect(panel.record.state).toBe("open");
    expect(popover.record.state).toBe("closed");
  });

  it("moves an owner tree as a unit and lets an owned panel close independently", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const panel = fixture.manager.create(panelWindow("panel", { parentWindowControllerId: parent.id }));
    const other = fixture.manager.create(standardWindow("other"));
    await fixture.manager.open(parent.id);
    await fixture.manager.open(panel.id, { activate: false });
    await fixture.manager.open(other.id);

    fixture.manager.order(parent.id, "front");
    expect(fixture.manager.list().map(({ id }) => id)).toEqual(["other", "parent", "panel"]);
    expect(await fixture.manager.requestClose(panel.id, { reason: "control" })).toEqual({
      outcome: "closed",
      windowControllerId: panel.id,
    });
    expect(parent.record.state).toBe("open");
  });

  it("rejects invalid parents, a second attached sheet and children of closed parents", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    expect(() => fixture.manager.create(sheetWindow("self", "self"))).toThrow(/itself|parent/i);
    const first = fixture.manager.create(sheetWindow("first", parent.id));
    const second = fixture.manager.create(sheetWindow("second", parent.id));
    await expect(fixture.manager.open(first.id)).rejects.toThrow(/open parent/i);
    await fixture.manager.open(parent.id);
    await fixture.manager.attachSheet(parent.id, first.id);
    await expect(fixture.manager.attachSheet(parent.id, second.id)).rejects.toThrow(/already.*sheet/i);

    const sheetParent = fixture.manager.create(sheetWindow("not-standard-parent", parent.id));
    expect(() => fixture.manager.create(sheetWindow("invalid-child", sheetParent.id))).toThrow(/standard|modal/i);
  });

  it("closes the complete child forest and records sheet completion once", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const parent = fixture.manager.create(standardWindow("parent"));
    const sheet = fixture.manager.create(sheetWindow("sheet", parent.id));
    const popover = fixture.manager.create(popoverWindow("popover", sheet.id, "sheet-help", { pinned: true }));
    await fixture.manager.open(parent.id);
    await fixture.manager.attachSheet(parent.id, sheet.id);
    await fixture.manager.open(popover.id);

    expect(await fixture.manager.requestClose(parent.id, { reason: "command" })).toEqual({
      outcome: "closed",
      windowControllerId: parent.id,
    });
    expect([parent, sheet, popover].map(({ record }) => record.state)).toEqual(["closed", "closed", "closed"]);
    expect(sheet.sheetCompletion).toEqual({ outcome: "closed", windowControllerId: sheet.id });
    expect(await fixture.manager.endSheet(sheet.id, { action: "ignored" })).toBe(sheet.sheetCompletion);
  });
});
