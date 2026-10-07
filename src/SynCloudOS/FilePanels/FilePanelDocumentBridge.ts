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

import { throwIfFilePanelAborted } from "./FilePanelService";
import type {
  FilePanelConflict,
  FilePanelDocumentSaveBinding,
  FilePanelDocumentSaveResult,
  FilePanelSaveTarget,
} from "./filePanelTypes";

function conflictFor(target: FilePanelSaveTarget, expectedVersion: import("../Documents").DocumentVersion | undefined): FilePanelConflict {
  return {
    kind: expectedVersion ? "document-version" : "existing-file",
    displayName: target.kind === "file-handle" ? target.reference.name : target.suggestedName,
    target,
    expectedVersion,
  };
}

/**
 * Document bridge for a user-selected save destination. A handle never
 * becomes a synthetic DocumentLocation: unmappable targets use their explicit
 * export sink and caller serializer instead.
 */
export async function saveFilePanelTarget(
  binding: FilePanelDocumentSaveBinding,
  target: FilePanelSaveTarget,
  signal: AbortSignal,
): Promise<FilePanelDocumentSaveResult> {
  throwIfFilePanelAborted(signal);
  const destination = await binding.resolveDocumentDestination(target, signal);
  throwIfFilePanelAborted(signal);
  if (target.exists) {
    const decision = await binding.confirmConflict(conflictFor(target, destination?.expectedVersion), signal);
    throwIfFilePanelAborted(signal);
    if (decision === "choose-another") return { kind: "choose-another" };
    if (decision !== "replace") return { kind: "cancelled" };
  }
  if (!destination) {
    const payload = await binding.createExportPayload(target, signal);
    throwIfFilePanelAborted(signal);
    return target.sink.write(payload, signal);
  }

  let conflict: import("../Documents").DocumentDestinationConflictPolicy;
  if (!target.exists) {
    conflict = { kind: "fail-if-exists" };
  } else {
    if (!destination.expectedVersion) {
      throw new TypeError("A replacement save requires the exact destination document version.");
    }
    conflict = { kind: "replace", expectedVersion: destination.expectedVersion };
  }
  return binding.documentController.saveAsDocument({
    documentId: binding.documentId,
    destination: destination.location,
    conflict,
    signal,
  });
}
