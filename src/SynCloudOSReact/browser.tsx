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

export { mountSynCloudOS } from "./browserRuntime";
export { IndexedDBDocumentRecoveryStore } from "../SynCloudOS/Documents/IndexedDBDocumentRecoveryStore";
export { InMemoryDocumentAdapter } from "../SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
export {
  createSynCloudOSHostContribution,
} from "./browserHostContributions";
export {
  createRegisteredFontResourceLoader,
  fontResourceMimeTypeForPath,
} from "../SynCloudOS/BundleLoader/fontResourceLoader";
export { trustSynWareBundleForCanonicalHost } from "../SynCloudOS/BundleLoader/trustedBundleProvenance";
export {
  BrowserImageProcessingWorker,
  createBrowserAcceleratedImageProcessingPipeline,
  createBrowserImageProcessingPipeline,
  createBrowserImageProcessingWorkerBackend,
} from "../SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker";
export type {
  BrowserImageProcessingWorkerOptions,
  IFXCanvasImageMetadata,
  IFXEncodedImageMetadata,
} from "../SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker";
export {
  BrowserWebGPUImageProcessingBackend,
  createBrowserWebGPUImageProcessingBackend,
} from "../SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend";
export type {
  BrowserWebGPUImageExecutionRequest,
  BrowserWebGPUImageExecutor,
  BrowserWebGPUImageOperation,
} from "../SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend";
export type {
  MountSynCloudOSOptions,
  MountedSynCloudOSHost,
  SynCloudOSBrowserBundle,
  SynCloudOSDiscoveredBundleDescriptor,
} from "./browserRuntime";
export type { SynCloudOSShellResources } from "../Webspring/WebspringController";
export type {
  SynCloudOSHostContribution,
  SynCloudOSHostContributionPreparation,
  SynCloudOSHostInstallContext,
  SynCloudOSHostTerminalSeedReservation,
} from "./browserHostContributions";
export type { SynCloudOSAppModule, TrustedSynWareBundle } from "../SynCloudOS/BundleLoader/bundleTypes";
export type { RegisteredFontResource } from "../SynCloudOS/BundleLoader/fontResourceLoader";
export type { SynWareTrustedPrivilege } from "../SynCloudOS/BundleLoader/trustedBundleProvenance";
export type { SynCloudOSAppServiceClientContext } from "../SynCloudOS/Runtime/runtimeInstanceTypes";
export type { SynCloudOSServiceDefinition } from "../SynCloudOS/ServiceRegistry/serviceTypes";
export type { SynCloudOSDocumentKindMetadata } from "../SynCloudOS/DocumentStore/documentStoreTypes";
export type { SynCloudOSRole } from "../SynCloudOS/PermissionManager/permissionTypes";
export type { SynCloudOSPolicyProfile, SynCloudOSPolicyProfileSession } from "../SynCloudOS/PolicyKit/policyTypes";
export type {
  SynCloudOSLocaleBundleResourceInput,
  SynCloudOSLocaleBundleResourceLoader,
} from "../SynCloudOS/LocaleServices/localeTypes";
export { createIndexedDBDocumentAssetStore } from "../SynCloudOS/Documents/IndexedDBDocumentAssetStore";
export { createInMemoryDocumentAssetStore } from "../SynCloudOS/Documents/DocumentAssetStore";
export { createDocumentAssetStorageAdapter, createDocumentAssetSaveCoordinator } from "../SynCloudOS/Documents/DocumentAssetSaveCoordinator";
export type { DocumentAssetStore, DocumentAssetScope, DocumentAssetReference } from "../SynCloudOS/Documents/documentAssetTypes";
