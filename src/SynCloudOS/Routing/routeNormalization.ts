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

import type {
  SynCloudOSRouteDiagnostics,
  SynCloudOSRouteInputKind,
  SynCloudOSRouteMatchMode,
  SynCloudOSRouteNormalization
} from "../RouteManager/routeTypes";

export interface SynCloudOSExternalRouteSafety {
  route: string;
  safe: boolean;
  protocol: string | null;
  reason: string | null;
  canonicalHref: string | null;
}

export interface SynCloudOSNormalizedRouteKey {
  key: string | null;
  matchMode: SynCloudOSRouteMatchMode;
  pathname: string;
  canonicalHref: string | null;
  normalized: SynCloudOSRouteNormalization;
}

const routeSchemePattern = /^[a-z][a-z\d+\-.]*:/i;
const safeExternalProtocols = new Set(["http:", "https:"]);
const deterministicRuntimeOrigin = "http://syncloudos.invalid";

export interface SynCloudOSRouteNormalizationOptions {
  readonly baseOrigin?: string;
}

function coerceRouteInput(value: unknown) {
  try {
    return { value: String(value ?? ""), rejected: false };
  } catch {
    return { value: "", rejected: true };
  }
}

function getRuntimeBaseOrigin(baseOrigin?: string) {
  try {
    return new URL(baseOrigin ?? deterministicRuntimeOrigin).origin;
  } catch {
    return deterministicRuntimeOrigin;
  }
}

function canonicalizeHttpHref(url: URL) {
  const canonicalUrl = new URL(url.href);
  canonicalUrl.protocol = canonicalUrl.protocol.toLowerCase();
  canonicalUrl.hostname = canonicalUrl.hostname.toLowerCase();
  canonicalUrl.hash = "";
  if (
    (canonicalUrl.protocol === "http:" && canonicalUrl.port === "80") ||
    (canonicalUrl.protocol === "https:" && canonicalUrl.port === "443")
  ) {
    canonicalUrl.port = "";
  }
  if (canonicalUrl.pathname.length > 1) {
    canonicalUrl.pathname = canonicalUrl.pathname.replace(/\/+$/g, "");
  }
  return canonicalUrl.href;
}

export function getCanonicalExternalHref(href: unknown) {
  const coerced = coerceRouteInput(href);
  if (coerced.rejected) return null;
  const rawHref = coerced.value.trim();
  if (!rawHref || rawHref.startsWith("//") || !routeSchemePattern.test(rawHref)) return null;

  try {
    const parsedUrl = new URL(rawHref);
    if (!safeExternalProtocols.has(parsedUrl.protocol.toLowerCase())) return null;
    return canonicalizeHttpHref(parsedUrl);
  } catch {
    return null;
  }
}

export function normalizeRoutePath(pathname: unknown, options: SynCloudOSRouteNormalizationOptions = {}): SynCloudOSRouteNormalization {
  const coerced = coerceRouteInput(pathname);
  const requestedPath = coerced.value;
  const changes: string[] = [];
  let rawPath = requestedPath.trim();
  const baseOrigin = getRuntimeBaseOrigin(options.baseOrigin);
  const baseHref = `${baseOrigin}/`;

  if (rawPath !== requestedPath) changes.push("trimmedWhitespace");
  if (coerced.rejected) {
    rawPath = "/";
    changes.push("rejectedUncoercibleInput");
  } else if (!rawPath) {
    rawPath = "/";
    changes.push("defaultedEmptyPath");
  }

  if (rawPath.includes("\\")) {
    rawPath = rawPath.replace(/\\/g, "/");
    changes.push("normalizedBackslashes");
  }

  let parsedPath = rawPath;
  let search = "";
  let hash = "";
  const isProtocolRelative = rawPath.startsWith("//");
  const hasExplicitScheme = routeSchemePattern.test(rawPath);
  const isAbsoluteUrl = hasExplicitScheme || isProtocolRelative;
  let parsedUrl: URL | null = null;
  let protocol: string | null = null;
  let origin: string | null = null;
  let canonicalHref: string | null = null;

  try {
    parsedUrl = new URL(rawPath, baseHref);
    protocol = parsedUrl.protocol.toLowerCase();
    origin = parsedUrl.origin;
    if (safeExternalProtocols.has(protocol)) canonicalHref = canonicalizeHttpHref(parsedUrl);
    if (isAbsoluteUrl) {
      changes.push("parsedAbsoluteUrl");
    }
  } catch {
    const hashIndex = parsedPath.indexOf("#");
    if (hashIndex >= 0) {
      hash = parsedPath.slice(hashIndex);
      parsedPath = parsedPath.slice(0, hashIndex);
    }
    const searchIndex = parsedPath.indexOf("?");
    if (searchIndex >= 0) {
      search = parsedPath.slice(searchIndex);
      parsedPath = parsedPath.slice(0, searchIndex);
    }
  }

  const isSafeExternalProtocol = Boolean(protocol && safeExternalProtocols.has(protocol));
  const isUnsafeScheme = Boolean(hasExplicitScheme && protocol && !safeExternalProtocols.has(protocol));
  const isCrossOrigin = Boolean(isAbsoluteUrl && isSafeExternalProtocol && origin && origin !== baseOrigin);
  const isSameOrigin = Boolean(parsedUrl && (!isAbsoluteUrl || (isSafeExternalProtocol && origin === baseOrigin)));
  let matchMode: SynCloudOSRouteMatchMode = "path";
  let routeableInternally = true;
  let externalRouteCandidate = false;
  let rejectionReason: string | undefined;

  if (parsedUrl && !isUnsafeScheme) {
    parsedPath = parsedUrl.pathname || "/";
    search = parsedUrl.search;
    hash = parsedUrl.hash;
  }

  if (coerced.rejected) {
    matchMode = "none";
    routeableInternally = false;
    rejectionReason = "Route input could not be converted to a URL or pathname.";
  } else if (!parsedUrl && isAbsoluteUrl) {
    matchMode = "none";
    routeableInternally = false;
    rejectionReason = "Malformed absolute URLs are not routeable inside SynCloudOS.";
    parsedPath = "/";
    search = "";
    hash = "";
    changes.push("rejectedMalformedAbsoluteUrl");
  } else if (isUnsafeScheme) {
    matchMode = "none";
    routeableInternally = false;
    rejectionReason = `Scheme "${protocol}" is not routeable inside SynCloudOS.`;
    parsedPath = "/";
    search = "";
    hash = "";
    changes.push("rejectedUnsafeScheme");
  } else if (isProtocolRelative) {
    matchMode = "none";
    routeableInternally = false;
    rejectionReason = "Protocol-relative URLs are not routeable inside SynCloudOS.";
    changes.push("rejectedProtocolRelativeUrl");
  } else if (isCrossOrigin) {
    matchMode = "href";
    routeableInternally = false;
    externalRouteCandidate = true;
    changes.push("matchedByCanonicalHref");
  }

  if (search) changes.push("ignoredSearchForRouteMatch");
  if (hash) changes.push("ignoredHashForRouteMatch");

  if (!parsedPath.startsWith("/") && routeableInternally) {
    parsedPath = `/${parsedPath}`;
    changes.push("addedLeadingSlash");
  }

  const collapsedPath = parsedPath.replace(/\/{2,}/g, "/");
  if (collapsedPath !== parsedPath) changes.push("collapsedDuplicateSlashes");

  const withoutTrailingSlash = collapsedPath.length > 1 ? collapsedPath.replace(/\/+$/g, "") : collapsedPath;
  if (withoutTrailingSlash !== collapsedPath) changes.push("removedTrailingSlash");

  const lowerCasePath = withoutTrailingSlash.toLowerCase();
  if (lowerCasePath !== withoutTrailingSlash) changes.push("lowerCasedPath");

  const normalizedPathname = lowerCasePath || "/";
  const href = coerced.rejected
    ? ""
    : matchMode === "href"
      ? canonicalHref ?? rawPath
      : isUnsafeScheme
        ? rawPath
        : `${normalizedPathname}${search}${hash}`;
  const inputKind: SynCloudOSRouteInputKind =
    coerced.rejected || (!parsedUrl && isAbsoluteUrl)
      ? "invalidInput"
      : changes.includes("defaultedEmptyPath")
      ? "empty"
      : isUnsafeScheme
        ? "unsafeScheme"
        : isProtocolRelative
          ? "protocolRelativeUrl"
          : isCrossOrigin
            ? "crossOriginUrl"
            : isAbsoluteUrl
              ? "sameOriginUrl"
              : rawPath.startsWith("/")
                ? "path"
                : "relative";
  const diagnostics: SynCloudOSRouteDiagnostics = {
    inputKind,
    matchMode,
    routeableInternally,
    externalRouteCandidate,
    isAbsoluteUrl,
    isProtocolRelative,
    isSameOrigin,
    isCrossOrigin,
    isSafeExternalProtocol,
    isUnsafeScheme,
    protocol,
    origin,
    baseOrigin,
    canonicalHref,
    rejectionReason,
    notes: [
      ...(isCrossOrigin ? ["Cross-origin absolute URLs are matched only against external app canonical hrefs."] : []),
      ...(isUnsafeScheme ? [rejectionReason ?? "Unsafe scheme rejected."] : []),
      ...(routeableInternally ? ["Route can participate in internal pathname matching."] : [])
    ]
  };

  return {
    requestedPath,
    pathname: normalizedPathname,
    search,
    hash,
    href,
    changed: changes.length > 0 || requestedPath !== href,
    changes,
    inputKind,
    matchMode,
    routeableInternally,
    externalRouteCandidate,
    isAbsoluteUrl,
    isProtocolRelative,
    isSameOrigin,
    isCrossOrigin,
    isSafeExternalProtocol,
    isUnsafeScheme,
    protocol,
    origin,
    baseOrigin,
    canonicalHref,
    rejectionReason,
    diagnostics
  };
}

export function getNormalizedRouteKey(route: unknown, options: SynCloudOSRouteNormalizationOptions = {}): SynCloudOSNormalizedRouteKey {
  const normalized = normalizeRoutePath(route, options);
  const key =
    normalized.matchMode === "href"
      ? normalized.canonicalHref
      : normalized.matchMode === "path"
        ? normalized.pathname
        : null;

  return {
    key,
    matchMode: normalized.matchMode,
    pathname: normalized.pathname,
    canonicalHref: normalized.canonicalHref,
    normalized
  };
}

export function inspectExternalRouteSafety(route: unknown): SynCloudOSExternalRouteSafety {
  const coerced = coerceRouteInput(route);
  if (coerced.rejected) {
    return {
      route: "",
      safe: false,
      protocol: null,
      reason: "External routes must be coercible absolute http or https URLs.",
      canonicalHref: null,
    };
  }
  const requestedRoute = coerced.value.trim();

  if (!requestedRoute) {
    return {
      route: requestedRoute,
      safe: false,
      protocol: null,
      reason: "External routes must use absolute http or https URLs.",
      canonicalHref: null
    };
  }

  if (requestedRoute.startsWith("//") || !routeSchemePattern.test(requestedRoute)) {
    return {
      route: requestedRoute,
      safe: false,
      protocol: null,
      reason: "External routes must use absolute http or https URLs.",
      canonicalHref: null
    };
  }

  try {
    const parsedUrl = new URL(requestedRoute);
    const protocol = parsedUrl.protocol.toLowerCase();
    if (safeExternalProtocols.has(protocol)) {
      return {
        route: requestedRoute,
        safe: true,
        protocol,
        reason: null,
        canonicalHref: canonicalizeHttpHref(parsedUrl)
      };
    }

    return {
      route: requestedRoute,
      safe: false,
      protocol,
      reason: "External routes must use http or https.",
      canonicalHref: null
    };
  } catch {
    return {
      route: requestedRoute,
      safe: false,
      protocol: null,
      reason: "External routes must use absolute http or https URLs.",
      canonicalHref: null
    };
  }
}

export function hasSafeExternalRouteProtocol(route: unknown) {
  return inspectExternalRouteSafety(route).safe;
}
