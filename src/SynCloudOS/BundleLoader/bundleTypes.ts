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

import type { SynCloudOSAppManifest } from "../AppRegistry/appRegistryTypes";
import type { SynWareManifestV1 } from "../AppSDK/manifest/manifestTypes";
import type { SynCloudOSAppModule, SynWareDefinition } from "../AppSDK/runtimeContracts";
export type { SynCloudOSAppModule } from "../AppSDK/runtimeContracts";
import type {
  SynCloudOSLocaleBundleResourceInput,
  SynCloudOSLocaleBundleResourceLoader
} from "../LocaleServices/localeTypes";
import type {
  SynCloudOSLifecycleHookMap,
  SynCloudOSLifecycleStage,
  SynCloudOSLifecycleStageHooks,
} from "../Lifecycle/lifecycleTypes";
import type { TFXPackagedFontResourceLoader } from "../../FX/TextFX/textLayoutTypes";

export type SynCloudOSBundleLifecycleHookName =
  | "applicationWillRegister"
  | "applicationDidRegister"
  | "applicationDidUpdate"
  | "applicationWillUnregister"
  | "applicationDidUnregister"
  | "applicationWillLaunch"
  | "applicationDidLaunch"
  | "applicationWillBecomeActive"
  | "applicationDidBecomeActive"
  | "applicationWillSuspend"
  | "applicationDidSuspend"
  | "applicationDidFail"
  | "applicationWillClose"
  | "applicationDidClose";

export type SynCloudOSBundleLifecycleHook = (context: {
  appId: string;
  packageName: string;
  reason?: string;
  error?: unknown;
}) => void | Promise<void>;

export type SynCloudOSBundleLifecycleHooks = SynCloudOSLifecycleHookMap &
  Partial<Record<SynCloudOSBundleLifecycleHookName, SynCloudOSBundleLifecycleHook>> &
  Partial<Record<SynCloudOSLifecycleStage, SynCloudOSLifecycleStageHooks>>;

export type SynCloudOSBundleLoadState = "unloaded" | "loading" | "ready" | "failed";

export type SynCloudOSBundleModuleLoader = () => Promise<SynCloudOSAppModule>;

export interface TrustedSynWareBundle {
  manifest: SynCloudOSAppManifest;
  /** The immutable V1 declaration is retained beside the runtime registry
   * projection. Runtime code uses this value for app-facing manifest
   * capabilities. */
  synWareManifest?: Readonly<SynWareManifestV1>;
  /** The exact captured definition retains migrations and background handlers
   * without asking legacy registry types to reinterpret V1 declarations. */
  synWareDefinition?: Readonly<SynWareDefinition>;
  componentKey?: string;
  modulePath?: string;
  loadModule?: SynCloudOSBundleModuleLoader;
  content?: unknown;
  assets?: string[] | Record<string, string>;
  localeResources?: SynCloudOSLocaleBundleResourceInput;
  localeResourceLoader?: SynCloudOSLocaleBundleResourceLoader;
  /** Host-supplied, exact-map loader for this bundle's packaged fonts. */
  fontResourceLoader?: TFXPackagedFontResourceLoader;
  permissions?: string[];
  services?: string[];
  optionalServices?: string[];
  lifecycleHooks?: SynCloudOSBundleLifecycleHooks;
}

export interface SynCloudOSLoadedBundle {
  readonly appId: string;
  readonly packageName: string;
  readonly modulePath: string;
  readonly definition: Readonly<SynWareDefinition>;
  readonly loadedAt: number;
}

export type SynCloudOSBundleLoadErrorCode =
  | "BUNDLE_NOT_REGISTERED"
  | "BUNDLE_LOADER_MISSING"
  | "BUNDLE_IMPORT_FAILED"
  | "BUNDLE_INVALID_MODULE";
