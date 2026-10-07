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

export function useSynWareLocalisedStrings(appId: string, services: AppLocaleClient) {
  const localeSnapshot = useSyncExternalStore(
    services.subscribe,
    services.getSnapshot,
    services.getSnapshot,
  );
  const locale = localeSnapshot.locale;
  const dictionaryVersion = localeSnapshot.dictionaryVersion ?? 0;

  return useMemo(() => ({
    locale,
    dictionaryVersion,
    t: (key: string, fallback: string, params?: SynCloudOSTranslationParams) =>
      translateSynWareText(appId, key, fallback, params, undefined, services),
    menuT: (key: string, fallback: string, params?: SynCloudOSTranslationParams) =>
      translateSynWareText(appId, key, fallback, params, "mainMenu", services)
  }), [locale, appId, dictionaryVersion, services]);
}
