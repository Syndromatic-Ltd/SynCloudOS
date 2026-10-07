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

import { DocumentSchemaError } from "./DocumentErrors";
import { canonicalDocumentJson, immutableDocumentValue, type DocumentType } from "./documentTypes";

/** Private staging only: never publishes, admits history or mutates its owner. */
export function stageDocumentEdit<TModel, TSerialized>(
  current: Readonly<TModel>,
  type: DocumentType<TModel, TSerialized>,
  transform: (current: Readonly<TModel>) => TModel,
  validateModel?: (next: Readonly<TModel>) => void,
): { readonly model: TModel; readonly contentIdentity: string } {
  const candidate = transform(current);
  if (candidate && typeof (candidate as { then?: unknown }).then === "function") {
    // Observe an accidentally returned rejecting promise without admitting it.
    void Promise.resolve(candidate).catch(() => undefined);
    throw new DocumentSchemaError(type.id, "Document transformations must be synchronous and pure.");
  }
  const next = immutableDocumentValue(candidate, type.id);
  const serialized = immutableDocumentValue(type.write(next, { typeId: type.id, schemaVersion: type.schemaVersion }), type.id);
  if (!type.validate(serialized)) throw new DocumentSchemaError(type.id);
  const validation = validateModel?.(next) as unknown;
  if (validation && typeof (validation as { then?: unknown }).then === "function") {
    void Promise.resolve(validation).catch(() => undefined);
    throw new DocumentSchemaError(type.id, "Document validators must finish before synchronous commitment.");
  }
  return Object.freeze({ model: next, contentIdentity: canonicalDocumentJson(serialized, type.id) });
}
