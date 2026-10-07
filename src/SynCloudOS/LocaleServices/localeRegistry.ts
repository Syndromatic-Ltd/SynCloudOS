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

import {
  defaultSynCloudOSLocale,
  synCloudOSSupportedLocaleCodes,
  type SynCloudOSLocaleCode,
  type SynCloudOSLocaleDirection,
  type SynCloudOSLocaleMetadata,
  type SynCloudOSLocaleResolution,
  type SynCloudOSLocaleResolutionInput,
  type SynCloudOSTranslationMessages
} from "./localeTypes";
import { systemTranslationsByLocale } from "./translations";

const supportedLocaleSet = new Set<string>(synCloudOSSupportedLocaleCodes);
const defaultNamespace = "syncloudos.core";

export const synCloudOSSupportedLocales: SynCloudOSLocaleMetadata[] = [
  { code: "en-GB", englishName: "British English", nativeName: "British English", direction: "ltr", translationCompleteness: "complete" },
  { code: "fr-FR", englishName: "French", nativeName: "Français", direction: "ltr", translationCompleteness: "complete" },
  { code: "es-ES", englishName: "Spanish", nativeName: "Español", direction: "ltr", translationCompleteness: "complete" },
  { code: "pt-PT", englishName: "Portuguese, Portugal", nativeName: "Português", direction: "ltr", translationCompleteness: "complete" },
  { code: "de-DE", englishName: "German", nativeName: "Deutsch", direction: "ltr", translationCompleteness: "complete" },
  { code: "it-IT", englishName: "Italian", nativeName: "Italiano", direction: "ltr", translationCompleteness: "complete" },
  { code: "nl-NL", englishName: "Dutch", nativeName: "Nederlands", direction: "ltr", translationCompleteness: "complete" },
  { code: "pl-PL", englishName: "Polish", nativeName: "Polski", direction: "ltr", translationCompleteness: "complete" },
  { code: "tr-TR", englishName: "Turkish", nativeName: "Türkçe", direction: "ltr", translationCompleteness: "complete" },
  { code: "ru-RU", englishName: "Russian", nativeName: "Русский", direction: "ltr", translationCompleteness: "complete" },
  { code: "id-ID", englishName: "Indonesian", nativeName: "Bahasa Indonesia", direction: "ltr", translationCompleteness: "complete" },
  { code: "vi-VN", englishName: "Vietnamese", nativeName: "Tiếng Việt", direction: "ltr", translationCompleteness: "complete" },
  { code: "hi-IN", englishName: "Hindi", nativeName: "हिन्दी", direction: "ltr", translationCompleteness: "complete" },
  { code: "mr-IN", englishName: "Marathi", nativeName: "मराठी", direction: "ltr", translationCompleteness: "complete" },
  { code: "ta-IN", englishName: "Tamil", nativeName: "தமிழ்", direction: "ltr", translationCompleteness: "complete" },
  { code: "zh-Hans", englishName: "Simplified Chinese", nativeName: "简体中文", direction: "ltr", translationCompleteness: "complete" },
  { code: "zh-TW", englishName: "Traditional Chinese, Taiwan", nativeName: "繁體中文", direction: "ltr", translationCompleteness: "complete" },
  { code: "ja-JP", englishName: "Japanese", nativeName: "日本語", direction: "ltr", translationCompleteness: "complete" },
  { code: "ko-KR", englishName: "Korean", nativeName: "한국어", direction: "ltr", translationCompleteness: "complete" }
];

const localeAliases: Record<string, SynCloudOSLocaleCode> = {
  en: "en-GB",
  "en-gb": "en-GB",
  "en-us": "en-GB",
  fr: "fr-FR",
  "fr-fr": "fr-FR",
  es: "es-ES",
  "es-es": "es-ES",
  pt: "pt-PT",
  "pt-pt": "pt-PT",
  "pt-br": "pt-PT",
  de: "de-DE",
  "de-de": "de-DE",
  it: "it-IT",
  "it-it": "it-IT",
  nl: "nl-NL",
  "nl-nl": "nl-NL",
  pl: "pl-PL",
  "pl-pl": "pl-PL",
  tr: "tr-TR",
  "tr-tr": "tr-TR",
  ru: "ru-RU",
  "ru-ru": "ru-RU",
  id: "id-ID",
  "id-id": "id-ID",
  vi: "vi-VN",
  "vi-vn": "vi-VN",
  hi: "hi-IN",
  "hi-in": "hi-IN",
  mr: "mr-IN",
  "mr-in": "mr-IN",
  ta: "ta-IN",
  "ta-in": "ta-IN",
  ja: "ja-JP",
  "ja-jp": "ja-JP",
  ko: "ko-KR",
  "ko-kr": "ko-KR"
};

const metadataByCode = new Map<SynCloudOSLocaleCode, SynCloudOSLocaleMetadata>(
  synCloudOSSupportedLocales.map((locale) => [locale.code, locale])
);
export interface SynCloudOSLocaleRegistry {
  registerTranslations(namespace: string, locale: SynCloudOSLocaleCode, messages: SynCloudOSTranslationMessages): void;
  registerBaseTranslations(namespace: string, messages: SynCloudOSTranslationMessages): void;
  lookup(namespace: string, key: string, locale: SynCloudOSLocaleCode, fallbackLocale?: SynCloudOSLocaleCode): string | null;
  dispose(): void;
}

function normalizeLocaleInput(value: string) {
  return value.trim().replace(/_/g, "-");
}

function normalizeAliasKey(value: string) {
  return normalizeLocaleInput(value).toLowerCase();
}

function directSupportedCode(value: string): SynCloudOSLocaleCode | null {
  if (supportedLocaleSet.has(value)) return value as SynCloudOSLocaleCode;
  const match = synCloudOSSupportedLocaleCodes.find((code) => code.toLowerCase() === value.toLowerCase());
  return match ?? null;
}

export function resolveSynCloudOSLocaleCode(input: string | null | undefined): SynCloudOSLocaleCode | null {
  if (!input) return null;
  const normalized = normalizeLocaleInput(input);
  const direct = directSupportedCode(normalized);
  if (direct) return direct;

  const alias = localeAliases[normalizeAliasKey(normalized)];
  if (alias) return alias;

  const parts = normalizeAliasKey(normalized).split("-");
  const language = parts[0] ?? "";
  const regionOrScript = parts.slice(1);

  if (language === "zh") {
    if (regionOrScript.includes("hant") || regionOrScript.includes("tw") || regionOrScript.includes("hk") || regionOrScript.includes("mo")) {
      return "zh-TW";
    }
    if (regionOrScript.includes("hans") || regionOrScript.includes("cn") || regionOrScript.includes("sg") || regionOrScript.length === 0) {
      return "zh-Hans";
    }
  }

  return null;
}

export function getSynCloudOSLocaleMetadata(locale: SynCloudOSLocaleCode): SynCloudOSLocaleMetadata {
  return metadataByCode.get(locale) ?? metadataByCode.get(defaultSynCloudOSLocale) as SynCloudOSLocaleMetadata;
}

export function getSynCloudOSLocaleDirection(locale: SynCloudOSLocaleCode): SynCloudOSLocaleDirection {
  return getSynCloudOSLocaleMetadata(locale).direction;
}

export function getSynCloudOSSupportedLocales() {
  return synCloudOSSupportedLocales.map((locale) => ({ ...locale }));
}

export function createSynCloudOSLocaleResolution(
  input: SynCloudOSLocaleResolutionInput,
  source: SynCloudOSLocaleResolution["source"] = "default",
  timeZone: string | null = null
): SynCloudOSLocaleResolution {
  const candidates = Array.isArray(input) ? input : [input];
  const resolved = candidates.map((candidate) => resolveSynCloudOSLocaleCode(candidate)).find(Boolean) ?? defaultSynCloudOSLocale;
  const resolvedSource = resolved === defaultSynCloudOSLocale && !candidates.some((candidate) => resolveSynCloudOSLocaleCode(candidate))
    ? "default"
    : source;

  return {
    activeLocale: resolved,
    requestedLocale: resolvedSource === "default" ? null : resolved,
    source: resolvedSource,
    direction: getSynCloudOSLocaleDirection(resolved),
    timeZone,
    resolvedAt: Date.now()
  };
}

export function createSynCloudOSLocaleRegistry(): SynCloudOSLocaleRegistry {
  const translations = new Map<string, Map<SynCloudOSLocaleCode, SynCloudOSTranslationMessages>>();
  const baseTranslations = new Map<string, SynCloudOSTranslationMessages>();
  let disposed = false;
  const registerTranslations = (
    namespace: string,
    locale: SynCloudOSLocaleCode,
    messages: SynCloudOSTranslationMessages,
  ) => {
    if (disposed) return;
    const namespaced = translations.get(namespace) ?? new Map<SynCloudOSLocaleCode, SynCloudOSTranslationMessages>();
    const previous = namespaced.get(locale) ?? {};
    namespaced.set(locale, { ...previous, ...messages });
    translations.set(namespace, namespaced);
  };
  const registerBaseTranslations = (namespace: string, messages: SynCloudOSTranslationMessages) => {
    if (disposed) return;
    baseTranslations.set(namespace, {
      ...(baseTranslations.get(namespace) ?? {}),
      ...messages,
    });
  };
  for (const [locale, messages] of Object.entries(systemTranslationsByLocale)) {
    registerTranslations(defaultNamespace, locale as SynCloudOSLocaleCode, messages);
  }
  return {
    registerTranslations,
    registerBaseTranslations,
    lookup(namespace, key, locale, fallbackLocale = defaultSynCloudOSLocale) {
      const namespaced = translations.get(namespace);
      return (
        namespaced?.get(locale)?.[key] ??
        namespaced?.get(fallbackLocale)?.[key] ??
        baseTranslations.get(namespace)?.[key] ??
        null
      );
    },
    dispose() {
      disposed = true;
      translations.clear();
      baseTranslations.clear();
    },
  };
}

export function getDefaultSynCloudOSTranslationNamespace() {
  return defaultNamespace;
}

export function getInitialLocaleServicesSnapshot(): import("./localeTypes").SynCloudOSLocaleServicesSnapshot {
  return {
    activeLocale: defaultSynCloudOSLocale,
    requestedLocale: null,
    detectedLocale: null,
    source: "default",
    supportedLocales: getSynCloudOSSupportedLocales(),
    direction: "ltr",
    timeZone: null,
    resolvedAt: Date.now(),
    dictionaryVersion: 1,
    serviceAvailable: false
  };
}
