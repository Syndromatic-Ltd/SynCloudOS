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

export const defaultSynCloudOSLocale = "en-GB" as const;

export const synCloudOSSupportedLocaleCodes = [
  "en-GB",
  "fr-FR",
  "es-ES",
  "pt-PT",
  "de-DE",
  "it-IT",
  "nl-NL",
  "pl-PL",
  "tr-TR",
  "ru-RU",
  "id-ID",
  "vi-VN",
  "hi-IN",
  "mr-IN",
  "ta-IN",
  "zh-Hans",
  "zh-TW",
  "ja-JP",
  "ko-KR"
] as const;

export type SynCloudOSLocaleCode = typeof synCloudOSSupportedLocaleCodes[number];
export type SynCloudOSLocaleDirection = "ltr" | "rtl";
export type SynCloudOSTranslationCompleteness = "stub" | "partial" | "complete";
export type SynCloudOSLocaleSource = "stored" | "url" | "browser" | "default";

export interface SynCloudOSLocaleMetadata {
  code: SynCloudOSLocaleCode;
  englishName: string;
  nativeName: string;
  direction: SynCloudOSLocaleDirection;
  translationCompleteness: SynCloudOSTranslationCompleteness;
}

export interface SynCloudOSLocaleServicesSnapshot {
  activeLocale: SynCloudOSLocaleCode;
  requestedLocale: SynCloudOSLocaleCode | null;
  detectedLocale: SynCloudOSLocaleCode | null;
  source: SynCloudOSLocaleSource;
  supportedLocales: SynCloudOSLocaleMetadata[];
  direction: SynCloudOSLocaleDirection;
  timeZone: string | null;
  resolvedAt: number;
  dictionaryVersion: number;
  serviceAvailable: boolean;
}

export interface SynCloudOSLocaleResolution {
  activeLocale: SynCloudOSLocaleCode;
  requestedLocale: SynCloudOSLocaleCode | null;
  source: SynCloudOSLocaleSource;
  direction: SynCloudOSLocaleDirection;
  timeZone: string | null;
  resolvedAt: number;
}

export type SynCloudOSLocaleResolutionInput =
  | string
  | readonly string[]
  | null
  | undefined;

export type SynCloudOSTranslationPrimitive = string | number | boolean | null | undefined;
export type SynCloudOSTranslationParams = Record<string, SynCloudOSTranslationPrimitive>;
export type SynCloudOSTranslationMessages = Record<string, string>;

export interface SynCloudOSLocaleFormatFileSizeOptions {
  base?: 1000 | 1024;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

export type SynCloudOSLocaleBundleResourceFiles = Record<string, string | SynCloudOSTranslationMessages>;
export type SynCloudOSLocaleBundleResourceInput = Record<string, SynCloudOSLocaleBundleResourceFiles>;
export type SynCloudOSLocaleBundleResourceLoader = () => Promise<SynCloudOSLocaleBundleResourceInput | undefined>;
