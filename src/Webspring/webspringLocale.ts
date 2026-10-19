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

import { useMemo } from "react";
import type { SynCloudOSAppInfo } from "../SynCloudOS/SynCloudOS";
import { createLocaleServicesFacade } from "../SynCloudOS/LocaleServices";
import type {
  SynCloudOSLocaleBundleResourceInput,
  SynCloudOSTranslationParams,
  SynCloudOSLocaleCode,
} from "../SynCloudOS/LocaleServices";
import { useLocaleServicesSnapshot, useKernelSynCloudOS } from "../SynCloudOSReact";

export const webspringLocaleNamespace = "synapps.webspring";
export const webspringMainMenuNamespace = "synapps.webspring.mainMenu";

const webspringLocalisedResources = import.meta.glob<string>("./Contents/Resources/Localised/*.locale/*.strings", {
  query: "?raw",
  import: "default"
});
async function collectWebspringLocaleResources(
  modules: Record<string, () => Promise<string>>,
  prefix: string,
  locale: SynCloudOSLocaleCode,
) {
  const resources: SynCloudOSLocaleBundleResourceInput = {};

  for (const [resourcePath, loadSource] of Object.entries(modules)) {
    if (!resourcePath.startsWith(prefix)) continue;
    const [folderName, fileName] = resourcePath.slice(prefix.length).split("/");
    if (!folderName || !fileName) continue;
    if (!["Base.locale", "en-GB.locale", `${locale}.locale`].includes(folderName)) continue;
    const source = await loadSource();
    resources[folderName] = {
      ...resources[folderName],
      [fileName]: source
    };
  }

  return resources;
}

export function getWebspringLocaleResourceLoader() {
  const localisedPrefix = "./Contents/Resources/Localised/";
  const hasLocalisedResources = Object.keys(webspringLocalisedResources).some((resourcePath) => resourcePath.startsWith(localisedPrefix));

  return async (locale: SynCloudOSLocaleCode) => {
    const collectedLocalisedResources = hasLocalisedResources
      ? await collectWebspringLocaleResources(webspringLocalisedResources, localisedPrefix, locale)
      : undefined;
    return collectedLocalisedResources;
  };
}

function interpolateFallback(message: string, params?: SynCloudOSTranslationParams) {
  if (!params) return message;
  return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) => {
    const value = params[key];
    return value === null || typeof value === "undefined" ? match : String(value);
  });
}

export function getLocalizedWebspringText(
  key: string,
  fallback: string,
  params?: SynCloudOSTranslationParams,
  namespace = webspringLocaleNamespace,
  services?: ReturnType<typeof createLocaleServicesFacade>
) {
  const translated = services?.t(key, params, namespace) ?? key;
  return translated === key ? interpolateFallback(fallback, params) : translated;
}

function appNamespace(appId: string) {
  return `synapps.${appId}`;
}

function appMainMenuNamespace(appId: string) {
  return `synapps.${appId}.mainMenu`;
}

export function getLocalizedWebspringAppName(app: SynCloudOSAppInfo, variant: "display" | "short" | "window" = "display", services?: ReturnType<typeof createLocaleServicesFacade>) {
  const key = variant === "short" ? "app.shortName" : variant === "window" ? "app.windowTitle" : "app.title";
  const fallback = variant === "short" ? app.shortName : variant === "window" ? app.window.title : app.displayName;
  const translated = services?.t(key, undefined, appNamespace(app.id)) ?? key;
  return translated === key ? fallback : translated;
}

export function getLocalizedWebspringAppAction(app: SynCloudOSAppInfo, action: "open" | "close", services?: ReturnType<typeof createLocaleServicesFacade>) {
  const appName = getLocalizedWebspringAppName(app, "display", services);
  const fallback = action === "open" ? `Open ${appName}` : `Close ${appName}`;
  const key = action === "open" ? "actions.open" : "actions.close";
  const translated = services?.t(key, undefined, appMainMenuNamespace(app.id)) ?? key;
  return translated === key ? fallback : translated;
}

export function useWebspringLocale() {
  const runtime = useKernelSynCloudOS();
  const services = useMemo(() => createLocaleServicesFacade(runtime), [runtime]);
  const localeSnapshot = useLocaleServicesSnapshot();
  return useMemo(() => ({
    activeLocale: localeSnapshot.activeLocale,
    appAction: (app: SynCloudOSAppInfo, action: "open" | "close") => getLocalizedWebspringAppAction(app, action, services),
    appName: (app: SynCloudOSAppInfo, variant: "display" | "short" | "window" = "display") => getLocalizedWebspringAppName(app, variant, services),
    /** Text the app declares for itself (such as its right-slot label), from the app's own strings. */
    appText: (app: SynCloudOSAppInfo, key: string, fallback: string) => getLocalizedWebspringText(key, fallback, undefined, appNamespace(app.id), services),
    t: (key: string, fallback: string, params?: SynCloudOSTranslationParams) => getLocalizedWebspringText(key, fallback, params, webspringLocaleNamespace, services),
    tMenu: (key: string, fallback: string, params?: SynCloudOSTranslationParams) =>
      getLocalizedWebspringText(key, fallback, params, webspringMainMenuNamespace, services)
  }), [localeSnapshot.activeLocale, localeSnapshot.dictionaryVersion, services]);
}
