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

/** Narrow host/runtime view of canonical mounted app and service contracts. */
export type {
  SynCloudOSAppModule,
  SynWareDefinition,
  SynWareOwnedDocumentRematerialiseContext,
  SynWareOwnedProjectionResult,
} from "./appDefinitionTypes";
export type { AppServiceClient, AppServiceResult, AppDocumentCloseOptions, AppDocumentResourcesClient, AppWorkspaceDocumentsClient } from "./appClientTypes";
export { isAuthenticSynWareServiceToken, SynWareServiceAcquisitionError } from "./serviceToken";
export type { SynWareServiceToken } from "./serviceToken";
