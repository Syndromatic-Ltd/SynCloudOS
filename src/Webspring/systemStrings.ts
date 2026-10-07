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
  type createLocaleServicesFacade,
  type SynCloudOSTranslationParams,
  type SynCloudOSTranslationPrimitive
} from "../SynCloudOS/LocaleServices";

/**
 * Translation for SYSTEM UI, in the root namespace.
 *
 * Apps go through translateSynWareText, which namespaces by app id and reads the
 * app bundle's own .strings. System surfaces have no bundle, so they read the
 * root dictionary in LocaleServices/translations/*.ts instead. Same fallback
 * contract: an untranslated key renders its English literal.
 */
function interpolate(message: string, params?: SynCloudOSTranslationParams) {
  if (!params) return message;
  return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) => {
    const value: SynCloudOSTranslationPrimitive = params[key];
    return value === null || typeof value === "undefined" ? match : String(value);
  });
}

export function systemT(key: string, fallback: string, params?: SynCloudOSTranslationParams, services?: ReturnType<typeof createLocaleServicesFacade>) {
  const translated = services?.t(key, params) ?? key;
  return translated === key ? interpolate(fallback, params) : translated;
}
