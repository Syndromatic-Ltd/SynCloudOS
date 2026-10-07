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

export * from "./documentTypes";
export * from "./DocumentErrors";
export * from "./DocumentTypeRegistry";
export * from "./Adapters";
export * from "./DocumentRecoveryStore";
export * from "./AutosaveScheduler";
export * from "./ApplicationDocument";
export * from "./DocumentPresentationCloseCoordinator";
export * from "./DocumentController";
export * from "./IndexedDBDocumentRecoveryStore";
export * from "./DocumentRestoration";
export * from "./DocumentResourceService";
export * from "./documentEditTypes";
export * from "./documentEditingTypes";
export * from "./DocumentEditingParticipants";
export * from "./documentAssetTypes";
export * from "./documentAssetErrors";
export * from "./DocumentAssetStore";
export * from "./IndexedDBDocumentAssetStore";
export * from "./DocumentAssetRetention";
export * from "./documentAssetManifest";
export * from "./DocumentAssetSaveCoordinator";
export * from "./documentOutputTypes";
export * from "./DocumentOutputPreparation";
export * from "./documentOutputPrint";
export type {
  ServiceTerminalClient,
  ServiceTerminalOperations,
  ServiceTerminalReceipt,
  ServiceTerminalRequest,
} from "./serviceTerminalOperations";
