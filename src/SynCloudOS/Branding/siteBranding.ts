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

import type { RuntimeLocaleServices } from "../LocaleServices/LocaleServices";
import type { SynWareLocalisedText, SynWareWebspringShellManifest } from "../AppSDK/manifest/manifestTypes";

export interface ResolvedSiteBranding {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly logoAlt: string;
  readonly lightLogoUrl: string | null;
  readonly darkLogoUrl: string | null;
  readonly compactLogoUrl: string | null;
}

function localise(text: SynWareLocalisedText, locale: Pick<RuntimeLocaleServices, "t">, namespace: string) {
  const translated = locale.t(text.key, undefined, namespace);
  return translated === text.key ? text.fallback ?? text.key : translated;
}

export function resolveSiteBranding(
  declaration: SynWareWebspringShellManifest["branding"],
  resourceUrls: Readonly<Record<string, string>>,
  locale: Pick<RuntimeLocaleServices, "t">,
  namespace: string,
): ResolvedSiteBranding {
  const name = localise(declaration.name, locale, namespace);
  const resolveLogo = (reference: typeof declaration.logo) => {
    if (!reference) return null;
    const resolved = resourceUrls[reference.resource];
    if (!resolved) throw new TypeError(`Site branding resource ${reference.resource} is not registered.`);
    return resolved;
  };
  const fallbackReference = [declaration.logo, declaration.lightLogo, declaration.darkLogo, declaration.compactLogo].find(Boolean);
  const primary = resolveLogo(declaration.logo) ?? resolveLogo(fallbackReference);
  return Object.freeze({
    name,
    logoUrl: primary,
    logoAlt: fallbackReference ? localise(fallbackReference.alternativeText, locale, namespace) : name,
    lightLogoUrl: resolveLogo(declaration.lightLogo) ?? primary,
    darkLogoUrl: resolveLogo(declaration.darkLogo) ?? primary,
    compactLogoUrl: resolveLogo(declaration.compactLogo) ?? primary,
  });
}
