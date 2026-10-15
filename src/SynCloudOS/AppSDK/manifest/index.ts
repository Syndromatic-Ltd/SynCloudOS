/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export { validateSynWareManifest } from "./validateManifest";
export { captureSynWareManifest, isCanonicalSynWareManifest } from "./canonicalManifest";
export { findSynWareManifestDifference } from "./compareCanonicalManifests";
export type { SynWareManifestDifference } from "./compareCanonicalManifests";
export type {
  SynWareAppearanceManifest,
  SynWareApplicationMenuManifest,
  SynWareBackgroundManifest,
  SynWareCommandManifest,
  SynWareDocumentTypeManifest,
  SynWareLifecycleManifest,
  SynWareLocaleBundleManifest,
  SynWareLocaleResourcesManifest,
  SynWareLocalisedText,
  SynWareManifestIssue,
  SynWareManifestValidation,
  SynWareManifestValidationFailure,
  SynWareManifestValidationSuccess,
  SynWareManifestV1,
  SynWareMenuManifest,
  SynWareMinimumViewportManifest,
  SynWarePresentation,
  SynWareRuntimeManifestContext,
  SynWareRouteManifest,
  SynWareFrameManifest,
  SynWareServiceManifest,
  SynWareWebspringFolderManifest,
  SynWareWebspringFoldersManifest,
  SynWareWebspringManifest,
  SynWareWebspringShellManifest,
  SynWareWebspringViewManifest,
  SynWareResourceReference,
  SynWareWindowDefaultsManifest,
  SynCloudOSAppFrameSmoothSurfaceCurve,
  SynCloudOSAppFrameSmoothSurfaceManifest,
  SynCloudOSAppFrameSmoothSurfacePhysicality,
} from "./manifestTypes";
