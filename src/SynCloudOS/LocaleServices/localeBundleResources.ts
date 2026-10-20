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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import {
  type SynCloudOSLocaleBundleResourceInput,
  type SynCloudOSTranslationMessages
} from "./localeTypes";
import {
  type SynCloudOSLocaleRegistry,
  resolveSynCloudOSLocaleCode
} from "./localeRegistry";

function unescapeStringsValue(value: string) {
  return value
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

export function parseSynCloudOSStringsFile(source: string): SynCloudOSTranslationMessages {
  const messages: SynCloudOSTranslationMessages = {};
  const pattern = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    messages[unescapeStringsValue(match[1])] = unescapeStringsValue(match[2]);
  }

  return messages;
}

function fileMessages(input: string | SynCloudOSTranslationMessages): SynCloudOSTranslationMessages {
  return typeof input === "string" ? parseSynCloudOSStringsFile(input) : { ...input };
}

function namespaceSegmentFromFile(fileName: string) {
  const baseName = fileName.replace(/\.strings$/i, "");
  if (/^locali[sz]able$/i.test(baseName)) return "";
  const words = baseName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((word, index) => index === 0
      ? word.charAt(0).toLowerCase() + word.slice(1)
      : word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function namespaceForFile(appId: string, fileName: string) {
  const segment = namespaceSegmentFromFile(fileName);
  const identifier = normalizeBundleIdentifier(appId);
  return segment ? `synapps.${identifier}.${segment}` : `synapps.${identifier}`;
}

function folderLocale(folderName: string) {
  const match = folderName.match(/^(.+)\.locale$/i);
  if (!match) return { kind: "ignored" as const };
  if (match[1].toLowerCase() === "base") return { kind: "base" as const };
  const locale = resolveSynCloudOSLocaleCode(match[1]);
  return locale ? { kind: "locale" as const, locale } : { kind: "ignored" as const };
}

export function registerSynCloudOSBundleLocaleResources(
  appId: string,
  resources: SynCloudOSLocaleBundleResourceInput,
  registry: SynCloudOSLocaleRegistry,
) {
  let registered = 0;

  for (const [folderName, files] of Object.entries(resources)) {
    const localeInfo = folderLocale(folderName);
    if (localeInfo.kind === "ignored") continue;

    for (const [fileName, fileInput] of Object.entries(files)) {
      if (!/\.strings$/i.test(fileName)) continue;
      const namespace = namespaceForFile(appId, fileName);
      const messages = fileMessages(fileInput);
      if (Object.keys(messages).length === 0) continue;

      if (localeInfo.kind === "base") {
        registry.registerBaseTranslations(namespace, messages);
      } else {
        registry.registerTranslations(namespace, localeInfo.locale, messages);
      }
      registered += Object.keys(messages).length;
    }
  }

  return {
    appId,
    registered
  };
}
