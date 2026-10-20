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
  DocumentSchemaError,
  DocumentTypeRegistrationError,
  DocumentTypeRegistry,
  canonicalDocumentLocation,
  type DocumentType,
} from "../../src/SynCloudOS/Documents";

type NoteModel = { title: string; body: string };
type NoteV1 = { schemaVersion: 1; text: string };
type NoteV2 = { schemaVersion: 2; title: string; body: string };

const noteType: DocumentType<NoteModel, NoteV2> = {
  id: "com.syncloudos.note",
  displayName: "Note",
  schemaVersion: 2,
  extensions: ["synnote"],
  mimeTypes: ["application/vnd.syncloudos.note+json"],
  autosave: { mode: "debounced", delayMs: 750 },
  capabilities: { versions: true, conflicts: true },
  create: () => ({ title: "Untitled", body: "" }),
  read: (value) => ({ title: value.title, body: value.body }),
  write: (model) => ({ schemaVersion: 2, ...model }),
  validate: (value): value is NoteV2 =>
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === 2 &&
    "title" in value &&
    typeof value.title === "string" &&
    "body" in value &&
    typeof value.body === "string",
  migrations: {
    1: (value: NoteV1): NoteV2 => ({
      schemaVersion: 2,
      title: "Imported note",
      body: value.text,
    }),
  },
};

describe("DocumentTypeRegistry", () => {
  it("rejects duplicate identifiers and resolves extensions case-insensitively", () => {
    const registry = new DocumentTypeRegistry();
    registry.register(noteType);
    expect(registry.forExtension(".SYNNOTE")?.id).toBe(noteType.id);
    expect(() => registry.register(noteType)).toThrow(DocumentTypeRegistrationError);
  });

  it("migrates one schema version at a time before reading", () => {
    const registry = new DocumentTypeRegistry();
    registry.register(noteType);
    expect(registry.decode(noteType.id, { schemaVersion: 1, text: "Hello" })).toEqual({
      title: "Imported note",
      body: "Hello",
    });
    expect(() =>
      registry.decode(noteType.id, { schemaVersion: 0, text: "Old" }),
    ).toThrow(DocumentSchemaError);
    expect(() =>
      registry.decode(noteType.id, { schemaVersion: 3, displayName: "Future", body: "" }),
    ).toThrow(DocumentSchemaError);
  });

  it("validates registrations before mutation and disposes without deleting a replacement", () => {
    const registry = new DocumentTypeRegistry();
    expect(() => registry.register({ ...noteType, id: "note" })).toThrow(TypeError);
    expect(registry.forExtension("synnote")).toBeNull();

    const registration = registry.register(noteType);
    registration.dispose();
    expect(registry.forExtension("synnote")).toBeNull();
    expect(() => registry.require(noteType.id)).toThrow("Unknown document type");
  });

  it("uses tagged canonical tuples so distinct location kinds cannot collide", () => {
    expect(canonicalDocumentLocation({
      kind: "memory",
      namespace: "remote",
      key: "https://documents.example/note",
    })).not.toBe(canonicalDocumentLocation({
      kind: "remote",
      url: "https://documents.example/note",
    }));
  });
});
