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

import type { DocumentType } from "../../src/SynCloudOS/Documents";

export interface NoteDocumentModel {
  readonly title: string;
  readonly body: string;
}

function isNoteDocumentModel(value: unknown): value is NoteDocumentModel {
  return Boolean(value) && typeof value === "object" &&
    typeof (value as Record<string, unknown>).title === "string" &&
    typeof (value as Record<string, unknown>).body === "string";
}

export const noteType: DocumentType<NoteDocumentModel> = Object.freeze({
  id: "com.syncloudos.note",
  displayName: "Note",
  schemaVersion: 1,
  extensions: Object.freeze(["synnote"]),
  mimeTypes: Object.freeze(["application/vnd.syncloudos.note+json"]),
  capabilities: Object.freeze({ versions: true, conflicts: true }),
  autosave: "disabled",
  create: () => Object.freeze({ title: "Untitled", body: "" }),
  read: (serialized) => Object.freeze({ ...serialized }),
  write: (model) => ({ ...model }),
  validate: isNoteDocumentModel,
});
