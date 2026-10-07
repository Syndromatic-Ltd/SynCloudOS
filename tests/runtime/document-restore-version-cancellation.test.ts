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
import {
  DocumentController,
  InMemoryDocumentAdapter,
  type DocumentStorageAdapter,
} from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("document restore-version cancellation", () => {
  it("forwards cancellation through the adapter await and never mutates a stale document", async () => {
    const dependencies = createDocumentTestDependencies();
    const backing = new InMemoryDocumentAdapter(dependencies.environment);
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const adapter: DocumentStorageAdapter = {
      id: "restore-version-cancellation",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: async (location, version, options) => {
        readStarted.resolve(undefined);
        await releaseRead.promise;
        // Deliberately ignore the signal here: ApplicationDocument must check
        // it again before it applies the late record to the editor model.
        return backing.readVersion(location, version, { ...options, signal: undefined });
      },
    };
    const controller = new DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "restore-cancellation", key: "note" } as const;
    const document = await controller.newDocument({ documentId: "restore-cancellation", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "saved version" }), { actionName: "Save version" });
    await document.save({ reason: "explicit" });
    const version = (await document.listVersions())[0]!;
    document.update((model) => ({ ...model, body: "newer local edit" }), { actionName: "New local edit" });
    const before = document.snapshot();
    const abort = new AbortController();

    const restoring = controller.restoreVersion(document.id, version, abort.signal);
    await readStarted.promise;
    abort.abort("mounted owner revoked");
    releaseRead.resolve(undefined);

    await expect(restoring).rejects.toMatchObject({ code: "document-aborted" });
    expect(document.snapshot()).toMatchObject({
      model: before.model,
      state: before.state,
      currentVersion: before.currentVersion,
      dirtyRevision: before.dirtyRevision,
      conflict: before.conflict,
    });
    await dependencies.cleanup();
  });
});
