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

/**
 * Runtime values NSE controls use, re-exported from their defining modules.
 *
 * NSE may import runtime *types* from the SynCloudOS facade (they are erased),
 * but a value import from the facade evaluates the whole runtime graph,
 * including runtime construction. Values reach NSE through this entry
 * instead, so a lightweight control never drags createSynCloudOS into its
 * dependency graph. Keep every export here free of runtime construction.
 */
export { commandValidationRequestKey } from "./Commands/commandTypes";
export { defineSyncUndoAction } from "./Undo/undoTypes";
export { encodeOpaqueIdentity } from "./MediaPanels/opaqueIdentity";
export { normalisePasteboardRepresentations } from "./Pasteboard/Pasteboard";
export { normaliseRuntimeCursorDescriptor } from "./Pointer/TrackingRegionManager";
export { saveFilePanelTarget } from "./FilePanels/FilePanelDocumentBridge";
export { declareSynCloudOSLifecycleSignal, SynCloudOSLifecycleError, SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "./ErrorManager/lifecycleError";
export type {
  SynCloudOSLifecycleDisposal,
  SynCloudOSLifecycleDisposalReason,
  SynCloudOSLifecycleErrorOptions,
  SynCloudOSLifecycleResource,
} from "./ErrorManager/lifecycleError";

export { canonicalDocumentJson } from "./Documents/documentTypes";
export { createUndoManager } from "./Undo/UndoManager";
export { createCanonicalWindowRecord, freezeWindowRecord } from "./Windows/windowTypes";
