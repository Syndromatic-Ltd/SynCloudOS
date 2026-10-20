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

import { useMemo, useSyncExternalStore } from "react";
import type { AppLocaleClient } from "./appClientTypes";
import type { SynCloudOSTranslationParams, SynCloudOSTranslationPrimitive } from "../LocaleServices/localeTypes";
import { useSynWareContext } from "./SynWareContext";
import { scosUnboundError } from "./scos/scosErrors";

function interpolateFallback(message: string, params?: SynCloudOSTranslationParams) {
  if (!params) return message;
  return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) => {
    const value: SynCloudOSTranslationPrimitive = params[key];
    return value === null || typeof value === "undefined" ? match : String(value);
  });
}

export function getSynWareNamespace(appId: string, segment?: string) {
  return segment ? `synapps.${appId}.${segment}` : `synapps.${appId}`;
}

export function translateSynWareText(
  appId: string,
  key: string,
  fallback: string,
  params?: SynCloudOSTranslationParams,
  namespaceSegment?: string,
  services?: Pick<AppLocaleClient, "t">
) {
  const namespace = getSynWareNamespace(appId, namespaceSegment);
  const translated = services?.t(key, params, namespace) ?? key;
  return translated === key ? interpolateFallback(fallback, params) : translated;
}

/** Localised strings for the mounted app. Values are read when asked, so the
 * object stays valid across a locale change; `useStrings()` re-renders. */
export interface SynWareStrings {
  readonly locale: string;
  readonly dictionaryVersion: number;
  t(key: string, fallback: string, params?: SynCloudOSTranslationParams): string;
  /** Keys under the app's `mainMenu` namespace. */
  menuT(key: string, fallback: string, params?: SynCloudOSTranslationParams): string;
}

/** A read-through catalogue for callers outside React (`SCOS.strings`). The
 * values are resolved per call, so a locale change needs no rebuild. */
export function createSynWareStrings(appId: string, services: AppLocaleClient): SynWareStrings {
  return Object.freeze({
    get locale() { return services.getSnapshot().locale; },
    get dictionaryVersion() { return services.getSnapshot().dictionaryVersion ?? 0; },
    t: (key: string, fallback: string, params?: SynCloudOSTranslationParams) =>
      translateSynWareText(appId, key, fallback, params, undefined, services),
    menuT: (key: string, fallback: string, params?: SynCloudOSTranslationParams) =>
      translateSynWareText(appId, key, fallback, params, "mainMenu", services),
  });
}

/** The mounted app's strings, re-rendered when the locale or its dictionary
 * changes. No app ID is needed: the app comes from context. */
export function useStrings(): SynWareStrings {
  const context = useSynWareContext();
  if (!context) throw scosUnboundError("useStrings()");
  const services = context.locale;
  const snapshot = useSyncExternalStore(services.subscribe, services.getSnapshot, services.getSnapshot);
  const locale = snapshot.locale;
  const dictionaryVersion = snapshot.dictionaryVersion ?? 0;
  return useMemo(
    () => createSynWareStrings(context.appId, services),
    // The snapshot values are the change signal; the catalogue reads them per call.
    [context.appId, dictionaryVersion, locale, services],
  );
}
