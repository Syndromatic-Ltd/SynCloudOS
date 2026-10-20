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

import type { HFXHapticClient } from "../../FX/HapticsFX/HFXHapticClient";
import type { MFXMotionClient } from "../../FX/MotionFX/public";
import type { LFXLocationClient } from "../../FX/LocationFX/public";
import type { MIFXClient } from "../../FX/MIDIFX/public";
import type { MEFXMediaClient } from "../../FX/MediaFX/MEFXMediaClient";
import type { VFXVideoClient } from "../../FX/VideoFX/public";
import type { LUFXIndexClient } from "../../FX/LuminaFX/public";
import type {
  AppAppearanceClient,
  AppColourPanelClient,
  AppCommandClient,
  AppDocumentClient,
  AppDragClient,
  AppLifecycleClient,
  AppLocaleClient,
  AppNavigationClient,
  AppPasteboardClient,
  AppPresentationClient,
  AppResponderClient,
  AppServiceClient,
  AUFXAudioClient,
  AppUndoClient,
  AppWindowClient,
} from "./appClientTypes";
import type {
  AppAlertClient,
  AppAnimationClient,
  AppConnectivityClient,
  AppErrorClient,
  AppEventClient,
  AppExternalActionClient,
  AppIdentityClient,
  AppFilePanelClient,
  AppImageClient,
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

export interface SynWareRuntimeInfo {
  readonly id: string;
  readonly version: string;
  readonly online: boolean;
  readonly locale: string;
  readonly timeZone: string;
}
export interface SynWareSiteBranding {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly lightLogoUrl: string | null;
  readonly darkLogoUrl: string | null;
  readonly compactLogoUrl: string | null;
  readonly logoAlt: string;
}

/** The only context supplied to a mounted SynWare.  It is deliberately an
 * explicit list: kernel APIs cannot become app capabilities by structural
 * coincidence. */
export interface SynWareContextValue {
  readonly runtimeInfo: SynWareRuntimeInfo;
  readonly branding: SynWareSiteBranding;
  readonly appId: string;
  /** Static identity beyond the ID: the version the app declared and the
   * display title error messages and `SCOS.app` use. */
  readonly appInfo: Readonly<{ readonly id: string; readonly version: string; readonly title: string }>;
  /** Catalogue lookups for `SCOS.open` when the caller names an app ID. */
  readonly launcher: AppLauncherClient;
  /** The mount's own responder identity; no foreign responder lookup is
   * exposed through this presentation-scoped value. */
  readonly responderId: string;
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly presentation: AppPresentationClient;
  readonly lifecycle: AppLifecycleClient;
  readonly commands: AppCommandClient;
  readonly responders: AppResponderClient;
  readonly undo: AppUndoClient;
  readonly documents: AppDocumentClient;
  readonly windows: AppWindowClient;
  readonly pasteboards: AppPasteboardClient;
  readonly drag: AppDragClient;
  readonly colourPanel: AppColourPanelClient;
  readonly audio: AUFXAudioClient;
  readonly services: AppServiceClient;
  readonly navigation: AppNavigationClient;
  readonly locale: AppLocaleClient;
  readonly appearance: AppAppearanceClient;
  readonly persistence: AppPersistenceClient;
  readonly scheduler: AppSchedulerClient;
  readonly mediaQueries: AppMediaQueryClient;
  readonly identity: AppIdentityClient;
  readonly notifications: AppNotificationClient;
  readonly errors: AppErrorClient;
  readonly alerts: AppAlertClient;
  readonly externalActions: AppExternalActionClient;
  readonly share: AppShareClient;
  readonly workArea: AppWorkAreaClient;
  readonly settingsAvailability: AppSettingsAvailabilityClient;
  readonly connectivity: AppConnectivityClient;
  readonly events: AppEventClient;
  readonly tracking: AppTrackingClient;
  readonly textLayout: AppTextLayoutClient;
  readonly animations: AppAnimationClient;
  readonly images: AppImageClient;
  /** The application's Open panel; see AppFilePanelClient. */
  readonly filePanels: AppFilePanelClient;
  readonly motion: MFXMotionClient;
  readonly media: MEFXMediaClient;
  readonly video: VFXVideoClient;
  readonly location: LFXLocationClient;
  readonly midi: MIFXClient;
  readonly lumina: LUFXIndexClient;
  readonly haptics: HFXHapticClient;
  readonly webContent: AppWebContentClient;
  readonly trusted: AppTrustedClient;
}
