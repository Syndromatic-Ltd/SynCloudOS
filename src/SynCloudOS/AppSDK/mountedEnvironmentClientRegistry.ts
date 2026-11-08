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

import type { AudioGraphHostService } from "../HostServices/AppSDKHostServiceTypes";
import type { MountedAudioSessionFactory } from "./mountedAudioSessions";
import type { createMountedAudioFiles } from "./mountedAudioFiles";
import type { HFXHapticClient } from "../../FX/HapticsFX/HFXHapticClient";
import type { MFXMotionClient } from "../../FX/MotionFX/public";
import type { LFXLocationClient } from "../../FX/LocationFX/public";
import type { MIFXClient } from "../../FX/MIDIFX/public";
import type { MEFXMediaClient } from "../../FX/MediaFX/MEFXMediaClient";
import type { AppVideoClient } from "./appClientTypes";
import type { LUFXIndexClient } from "../../FX/LuminaFX/public";
import type { SynWareRuntime } from "./appRuntimeTypes";
import type {
  AppAlertClient,
  AppAnimationClient,
  AppConnectivityClient,
  AppErrorClient,
  AppEventClient,
  AppExternalActionClient,
  AppIdentityClient,
  AppFilePanelClient, AppImageClient,
  AppLauncherClient,
  AppMediaQueryClient,
  AppNotificationClient,
  AppPersistenceClient,
  AppSchedulerClient,
  AppSettingsAvailabilityClient,
  AppShareClient,
  AppTextLayoutClient,
  AppTrackingClient,
  AppWebContentClient,
  AppWorkAreaClient,
} from "./appEnvironmentClientTypes";
import type { AppTrustedClient } from "./appTrustedClientTypes";

/** This host-private association prevents the public context from retaining a
 * façade object. The context receives only already-projected client values. */
export interface MountedAppEnvironmentClients {
  readonly persistence: AppPersistenceClient;
  readonly scheduler: AppSchedulerClient;
  readonly mediaQueries: AppMediaQueryClient;
  readonly identity: AppIdentityClient;
  readonly notifications: AppNotificationClient;
  readonly errors: AppErrorClient;
  readonly alerts: AppAlertClient;
  readonly launcher: AppLauncherClient;
  readonly externalActions: AppExternalActionClient;
  readonly share: AppShareClient;
  readonly storageDiagnostics: import("./storageDiagnosticsTypes").AppStorageDiagnosticsClient;
  readonly screenWakeLock: import("./playbackPresentationTypes").AppScreenWakeClient;
  readonly workArea: AppWorkAreaClient;
  readonly settingsAvailability: AppSettingsAvailabilityClient;
  readonly connectivity: AppConnectivityClient;
  readonly events: AppEventClient;
  readonly tracking: AppTrackingClient;
  readonly textLayout: AppTextLayoutClient;
  readonly animations: AppAnimationClient;
  readonly images: AppImageClient;
  readonly filePanels: AppFilePanelClient;
  readonly motion: MFXMotionClient;
  readonly media: MEFXMediaClient;
  readonly video: AppVideoClient;
  readonly location: LFXLocationClient;
  readonly network: import("../../FX/NetworkFX/internal/networkPort").NetworkPort;
  readonly speechSynthesis: import("../../FX/AudioFX/AUFXSpeechSynthesizer").AUFXSpeechClient;
  readonly videoPresentation: import("../../FX/VideoFX/VFXPictureInPictureController").VFXVideoPresentationClient;
  readonly bluetooth: import("../../FX/BluetoothFX/public").BTFXBluetoothClient;
  readonly nfc: import("../../FX/NFCFX/public").NFXNFCClient;
  readonly speech: import("../../FX/SpeechFX/internal/speechPort").SpeechPort;
  readonly contacts: import("../../FX/ContactsFX/public").CNFXContactsClient;
  readonly payment: import("../../FX/PassFX/public").PKFXPaymentClient;
  readonly xr: import("../../FX/XRFX/public").XRFXClient;
  readonly midi: MIFXClient;
  readonly lumina: LUFXIndexClient;
  readonly haptics: HFXHapticClient;
  readonly audioSessions: MountedAudioSessionFactory;
  readonly audioGraphs: Pick<AudioGraphHostService, "createEngine">;
  readonly audioFiles: ReturnType<typeof createMountedAudioFiles>;
  readonly webContent: AppWebContentClient;
  readonly trusted: AppTrustedClient;
}

const mountedClients = new WeakMap<SynWareRuntime, MountedAppEnvironmentClients>();

export function registerMountedAppEnvironmentClients(runtime: SynWareRuntime, clients: MountedAppEnvironmentClients): void {
  mountedClients.set(runtime, clients);
}

export function clearMountedAppEnvironmentClients(runtime: SynWareRuntime): void {
  mountedClients.delete(runtime);
}

export function getMountedAppEnvironmentClients(runtime: SynWareRuntime): MountedAppEnvironmentClients {
  const clients = mountedClients.get(runtime);
  if (!clients) throw new DOMException("Mounted SynWare environment clients are unavailable.", "AbortError");
  return clients;
}
