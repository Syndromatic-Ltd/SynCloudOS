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

import { describe, expect, it } from "vitest";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";
import { createTestRuntime } from "./helpers";

describe("UndoManagerRegistry", () => {
  it("owns managers by document/window/application/modal and resolves the first responder owner", () => {
    const runtime = createTestRuntime();
    const appOwner = { kind: "application" as const, id: "app" };
    const documentOwner = { kind: "document" as const, id: "document:one" };
    runtime.undo.create(appOwner);
    const document = runtime.undo.create(documentOwner);
    runtime.responders.register({ id: "app", kind: "application", parentId: "workspace", scopeId: "app", undoOwner: appOwner });
    runtime.responders.register({ id: "document:one", kind: "document", parentId: "app", scopeId: "window", undoOwner: documentOwner });
    runtime.responders.register({ id: "editor", kind: "control", parentId: "document:one", scopeId: "window" });
    runtime.focus.requestFocus("editor");
    expect(runtime.undo.resolveForResponder()?.owner).toEqual(documentOwner);
    expect(runtime.undo.get(documentOwner)).toBe(document);
    expect(runtime.undo.remove(documentOwner)).toBe(true);
    expect(runtime.undo.resolveForResponder()?.owner).toEqual(appOwner);
  });

  it("isolates owners across runtimes and disposes all entries", async () => {
    const first = createTestRuntime({ id: "runtime:undo:first" });
    const second = createTestRuntime({ id: "runtime:undo:second" });
    const owner = { kind: "document" as const, id: "same" };
    first.undo.create(owner).register(defineSyncUndoAction({ name: "One", asyncPolicy: "forbid", undo: () => {}, redo: () => {} }));
    second.undo.create(owner);
    expect(first.undo.get(owner)?.canUndo).toBe(true);
    expect(second.undo.get(owner)?.canUndo).toBe(false);
    await first.dispose("done");
    expect(first.undo.get(owner)).toBeNull();
    expect(second.undo.get(owner)).not.toBeNull();
  });
});
