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

import { useEffect, useMemo, useState } from "react";
import {
  DocumentVersionConflictError,
  IndexedDBDocumentAdapter,
  type DocumentRecord,
} from "../../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";

type NoteContent = { readonly body: string };

export function IndexedDBDocumentFixture() {
  const runtime = useKernelSynCloudOS();
  const browserWindow = runtime.environment.browser.getWindow();
  const indexedDB = browserWindow?.indexedDB;
  if (!indexedDB) throw new Error("IndexedDB document fixture requires injected browser authority.");
  const databaseName = useMemo(() => {
    const requested = new URLSearchParams(runtime.environment.browser.getLocation().search).get("database");
    return requested?.startsWith("syncloudos-framework-documents-")
      ? requested
      : "syncloudos-framework-documents-default";
  }, [runtime]);
  const location = useMemo(() => ({
    kind: "indexed-db" as const,
    database: databaseName,
    store: "documents",
    key: "durable-note",
  }), [databaseName]);
  const adapter = useMemo(() => new IndexedDBDocumentAdapter({
    indexedDB,
    databaseName,
    environment: runtime.environment,
  }), [databaseName, indexedDB, runtime]);
  const [record, setRecord] = useState<DocumentRecord<NoteContent> | null>(null);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    let active = true;
    void adapter.read<NoteContent>(location).then((stored) => {
      if (!active || !stored) return;
      setRecord(stored);
      setBody(stored.content.body);
    }).catch((error) => {
      if (active) setStatus(error instanceof Error ? error.message : "Storage unavailable");
    });
    return () => { active = false; adapter.close(); };
  }, [adapter]);

  const create = async () => {
    const current = await adapter.read(location);
    if (current) await adapter.remove(location, current.version);
    const saved = await adapter.write<NoteContent>({
      location,
      typeId: "com.syncloudos.framework-test.note",
      schemaVersion: 1,
      content: { body: "Durable" },
      expectedVersion: null,
      idempotencyKey: `fixture-create:${runtime.environment.randomUUID()}`,
    });
    setRecord(saved);
    setBody(saved.content.body);
    setStatus("Saved");
  };

  const attemptStaleSave = async () => {
    if (!record) return;
    try {
      await adapter.write({
        location,
        typeId: record.typeId,
        schemaVersion: record.schemaVersion,
        content: { body: "Stale replacement" },
        expectedVersion: { ...record.version, etag: '"stale"' },
        idempotencyKey: `fixture-stale:${runtime.environment.randomUUID()}`,
      });
    } catch (error) {
      if (error instanceof DocumentVersionConflictError) {
        setStatus("A newer version is available");
        return;
      }
      throw error;
    }
  };

  const deleteFixtureDatabase = async () => {
    adapter.close();
    await Promise.resolve();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Fixture database cleanup failed."));
      request.onblocked = () => reject(new Error("Fixture database cleanup was blocked."));
    });
    setRecord(null);
    setBody("");
    setStatus("Deleted");
  };

  return (
    <main aria-label="IndexedDB document adapter fixture">
      <h1>IndexedDB document adapter</h1>
      <label>
        Body
        <input aria-label="Body" value={body} onChange={(event) => setBody(event.currentTarget.value)} />
      </label>
      <button type="button" onClick={() => void create()}>Create durable note</button>
      <button type="button" onClick={() => void attemptStaleSave()} disabled={!record}>Attempt stale save</button>
      <button type="button" onClick={() => void deleteFixtureDatabase()}>Delete fixture database</button>
      <span data-testid="saved-version">{record?.version.sequence ?? 0}</span>
      <p role="status">{status}</p>
    </main>
  );
}
