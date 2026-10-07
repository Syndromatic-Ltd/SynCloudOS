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

export { createBrowserFilePanelAdapter } from "./BrowserFilePanelAdapter";
export { createDownloadFilePanelAdapter } from "./BrowserDownloadPanelAdapter";
export { createFileSystemAccessPanelAdapter } from "./FileSystemAccessPanelAdapter";
export { createFilePanelService, FilePanelReferenceError, isFilePanelAbort, mapFilePanelBrowserException, normalizeFilePanelAcceptTypes, throwIfFilePanelAborted } from "./FilePanelService";
export { saveFilePanelTarget } from "./FilePanelDocumentBridge";
export type {
  BrowserFilePanelPort,
  BrowserFilePanelSelection,
  DownloadFilePanelPort,
  FilePanelAcceptType,
  FilePanelAdapter,
  FilePanelCapability,
  FilePanelConflict,
  FilePanelConflictDecision,
  FilePanelDirectoryHandle,
  FilePanelDocumentSaveBinding,
  FilePanelDocumentSaveResult,
  FilePanelExportPayload,
  FilePanelExportSink,
  FilePanelFileHandle,
  FilePanelPermissionState,
  FilePanelReference,
  FilePanelReferenceBase,
  FilePanelReleaseReason,
  FilePanelResult,
  FilePanelSaveTarget,
  FilePanelService,
  FilePanelWritable,
  FileSystemAccessOpenOptions,
  FileSystemAccessPanelPort,
  FileSystemAccessSaveOptions,
  FileSystemAccessSaveSelection,
  OpenPanelRequest,
  SavePanelRequest,
} from "./filePanelTypes";
