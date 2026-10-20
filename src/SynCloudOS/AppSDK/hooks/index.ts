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

export { useLifecycle } from "./useLifecycle";
export { useCommands } from "./useCommands";
export type { SynWareCommandDefinition } from "./useCommands";
export { useDocument } from "./useDocument";
export { useWindow } from "./useWindow";
export type { SynWareWindowState } from "./useWindow";
export { useService } from "./useService";
export { usePasteboard } from "./usePasteboard";
export { useDrag } from "./useDrag";
export { useColourPanel } from "./useColourPanel";
export type { SynWareColourPanelState } from "./useColourPanel";
export { useAudio } from "./useAudio";
export { useTrustedClient } from "./useTrustedClient";
export { useAppearance } from "./useAppearance";
export type { SynWareAppearanceState } from "./useAppearance";
export {
  useAnimations,
  useConnectivity,
  useErrors,
  useEvents,
  useExternalActions,
  useIdentity,
  useIdentitySnapshot,
  useFilePanels,
  useImages,
  useMediaQueries,
  useMediaQuery,
  useNotifications,
  usePersistence,
  useScheduler,
  useSettingsAvailability,
  useSettingsAvailabilitySnapshot,
  useShare,
  useTextLayout,
  useTracking,
  useWebContent,
  useWorkArea,
  useWorkAreaSnapshot,
} from "./environmentHooks";

export { useMotion } from "./useMotion";

export { useMedia } from "./useMedia";

export { useVideo } from "./useVideo";

export { useLocation } from "./useLocation";

export { useMIDI } from "./useMIDI";

export { useLumina } from "./useLumina";

export { useHaptics } from "./useHaptics";
export { useRouteData } from "./useRouteData";
export { useRouter } from "./useRouter";
export { useRouteState } from "./useRouteState";
export type { SynWareRouteStateClient } from "./useRouteState";
export type { SynWareRouter, SynWareRouterPreloadOptions, SynWareRouterSnapshot } from "./useRouter";
