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
import { DocumentController, InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe("document versions", () => {
  it("restores a historical version as a dirty undoable edit", async () => {
    const dependencies = createDocumentTestDependencies();
    cleanups.push(dependencies.cleanup);
    const controller = new DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(new InMemoryDocumentAdapter(dependencies.environment));
    const document = await controller.newDocument({
      typeId: noteType.id,
      location: { kind: "memory", namespace: "notes", key: "history" },
    });
    document.update((model) => ({ ...model, body: "One" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    const firstVersion = document.currentVersion!;
    document.update((model) => ({ ...model, body: "Two" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    await document.restoreVersion(firstVersion);
    expect(document.model.body).toBe("One");
    expect(document.state).toBe("dirty");
    await document.undoManager.undo();
    expect(document.model.body).toBe("Two");
  });
});
