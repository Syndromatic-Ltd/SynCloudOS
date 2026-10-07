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

import { ApplicationDocument } from "../../src/SynCloudOS/Documents/ApplicationDocument";
import { DocumentController } from "../../src/SynCloudOS/Documents/DocumentController";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
import { createDocumentTestDependencies } from "./documentTestDependencies";
import { noteType } from "./noteDocumentType";

export function editDocumentFixture<TModel>(type: DocumentType<TModel>, model?: TModel, maxEntries = 100) {
  const dependencies = createDocumentTestDependencies();
  const adapter = new InMemoryDocumentAdapter(dependencies.environment);
  const id = dependencies.environment.randomUUID();
  const document = ApplicationDocument.create({
    id, type, model, adapter,
    location: { kind: "memory", namespace: "edits", key: id },
    ...dependencies,
    undoManager: dependencies.undo.create({ kind: "document", id }, { maxEntries }),
  });
  return { document, adapter, dependencies, cleanup: async () => {
    await document.markClosed();
    await dependencies.cleanup();
  } };
}

export function editingControllerFixture() {
  const dependencies = createDocumentTestDependencies();
  const controller = new DocumentController(dependencies);
  const adapter = new InMemoryDocumentAdapter(dependencies.environment);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, adapter, dependencies, cleanup: async () => {
    for (const document of controller.openDocuments) await document.markClosed();
    await dependencies.cleanup();
  } };
}
