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

import type { SynCloudOSLocaleCode, SynCloudOSTranslationMessages } from "../localeTypes";
import { deDETranslations } from "./de-DE";
import { enGBTranslations } from "./en-GB";
import { esESTranslations } from "./es-ES";
import { frFRTranslations } from "./fr-FR";
import { hiINTranslations } from "./hi-IN";
import { idIDTranslations } from "./id-ID";
import { itITTranslations } from "./it-IT";
import { jaJPTranslations } from "./ja-JP";
import { koKRTranslations } from "./ko-KR";
import { mrINTranslations } from "./mr-IN";
import { nlNLTranslations } from "./nl-NL";
import { plPLTranslations } from "./pl-PL";
import { ptPTTranslations } from "./pt-PT";
import { ruRUTranslations } from "./ru-RU";
import { taINTranslations } from "./ta-IN";
import { trTRTranslations } from "./tr-TR";
import { viVNTranslations } from "./vi-VN";
import { zhHansTranslations } from "./zh-Hans";
import { zhTWTranslations } from "./zh-TW";

export const systemTranslationsByLocale: Record<SynCloudOSLocaleCode, SynCloudOSTranslationMessages> = {
  "en-GB": enGBTranslations,
  "fr-FR": frFRTranslations,
  "es-ES": esESTranslations,
  "pt-PT": ptPTTranslations,
  "de-DE": deDETranslations,
  "it-IT": itITTranslations,
  "nl-NL": nlNLTranslations,
  "pl-PL": plPLTranslations,
  "tr-TR": trTRTranslations,
  "ru-RU": ruRUTranslations,
  "id-ID": idIDTranslations,
  "vi-VN": viVNTranslations,
  "hi-IN": hiINTranslations,
  "mr-IN": mrINTranslations,
  "ta-IN": taINTranslations,
  "zh-Hans": zhHansTranslations,
  "zh-TW": zhTWTranslations,
  "ja-JP": jaJPTranslations,
  "ko-KR": koKRTranslations
};
