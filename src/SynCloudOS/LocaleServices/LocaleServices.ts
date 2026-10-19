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
  RuntimeBrowserPort,
  RuntimeOwnedService,
  SynCloudOSEventBus,
  SynCloudOSPersistence,
  SynCloudOSRuntime,
  SynCloudOSRuntimeId,
  SynCloudOSRuntimeStore,
  SynCloudOSServiceRegistry,
} from "../Runtime/runtimeInstanceTypes";
import {
  defaultSynCloudOSLocale,
  type SynCloudOSLocaleBundleResourceInput,
  type SynCloudOSLocaleBundleResourceLoader,
  type SynCloudOSLocaleCode,
  type SynCloudOSLocaleFormatFileSizeOptions,
  type SynCloudOSLocaleResolutionInput,
  type SynCloudOSTranslationMessages,
  type SynCloudOSTranslationParams,
  type SynCloudOSTranslationPrimitive,
} from "./localeTypes";
import {
  createSynCloudOSLocaleRegistry,
  createSynCloudOSLocaleResolution,
  getDefaultSynCloudOSTranslationNamespace,
  getInitialLocaleServicesSnapshot,
  getSynCloudOSLocaleDirection,
  getSynCloudOSSupportedLocales,
  resolveSynCloudOSLocaleCode,
} from "./localeRegistry";
import { localePreferenceKey } from "./localeStorage";
import {
  formatSynCloudOSDate,
  formatSynCloudOSFileSize,
  formatSynCloudOSList,
  formatSynCloudOSNumber,
  formatSynCloudOSRelativeTime,
  formatSynCloudOSTime,
} from "./localeFormatting";
import { registerSynCloudOSBundleLocaleResources } from "./localeBundleResources";

export interface RuntimeLocaleServices extends RuntimeOwnedService {
  hydrate(): ReturnType<SynCloudOSRuntimeStore["getSnapshot"]>["localeServices"];
  markUnavailable(error?: unknown): ReturnType<SynCloudOSRuntimeStore["getSnapshot"]>["localeServices"];
  isAvailable(): boolean;
  getSnapshot(): ReturnType<SynCloudOSRuntimeStore["getSnapshot"]>["localeServices"];
  getActiveLocale(): SynCloudOSLocaleCode;
  getSupportedLocales(): ReturnType<typeof getSynCloudOSSupportedLocales>;
  resolveLocale(input: SynCloudOSLocaleResolutionInput): ReturnType<typeof createSynCloudOSLocaleResolution>;
  detectLocale(): ReturnType<typeof createSynCloudOSLocaleResolution>;
  setLocale(locale: string): ReturnType<SynCloudOSRuntimeStore["getSnapshot"]>["localeServices"];
  clearLocale(): ReturnType<SynCloudOSRuntimeStore["getSnapshot"]>["localeServices"];
  formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  formatTime(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatFileSize(bytes: number, options?: SynCloudOSLocaleFormatFileSizeOptions): string;
  formatRelativeTime(value: number, unit?: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
  formatList(values: string[], options?: Intl.ListFormatOptions): string;
  registerTranslations(namespace: string, locale: SynCloudOSLocaleCode | string, messages: SynCloudOSTranslationMessages): boolean;
  registerBundleLocaleResources(appId: string, resources: SynCloudOSLocaleBundleResourceInput): { appId: string; registered: number };
  registerBundleLocaleResourceLoader(appId: string, loader: SynCloudOSLocaleBundleResourceLoader): { appId: string; registered: boolean };
  loadBundleLocaleResources(appIds?: string[]): Promise<Array<{ appId: string; registered: number }>>;
  t(key: string, params?: SynCloudOSTranslationParams | string, namespace?: string): string;
}

export interface RuntimeLocaleServiceDependencies {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly store: SynCloudOSRuntimeStore;
  readonly events: SynCloudOSEventBus;
  readonly services: SynCloudOSServiceRegistry;
  readonly persistence: SynCloudOSPersistence;
  readonly browser: RuntimeBrowserPort;
  now(): number;
}

function interpolate(message: string, params?: SynCloudOSTranslationParams) {
  if (!params) return message;
  return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) => {
    const value: SynCloudOSTranslationPrimitive = params[key];
    return value === null || typeof value === "undefined" ? match : String(value);
  });
}

export function createRuntimeLocaleServices(dependencies: RuntimeLocaleServiceDependencies): RuntimeLocaleServices {
  const { runtimeId, store, events, services, persistence, browser, now } = dependencies;
  const registry = createSynCloudOSLocaleRegistry();
  const loaders = new Map<string, SynCloudOSLocaleBundleResourceLoader>();
  const loading = new Map<string, Promise<{ appId: string; registered: number }>>();
  let hydrated = false;
  let disposed = false;

  const readTimeZone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  };
  const readBrowserLanguages = () => {
    const navigator = browser.getNavigator();
    if (!navigator) return [];
    const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
    return [...languages, ...(navigator.language ? [navigator.language] : [])];
  };
  const detectBrowserLocale = (timeZone = readTimeZone()) => {
    const languages = readBrowserLanguages();
    const detectedLocale = languages.map((language) => resolveSynCloudOSLocaleCode(language)).find(Boolean) ?? null;
    return {
      detectedLocale,
      resolution: createSynCloudOSLocaleResolution(languages, "browser", timeZone),
    };
  };
  const readUrlLocale = () => {
    try {
      const params = new URLSearchParams(browser.getLocation().search);
      return params.get("locale") ?? params.get("lang");
    } catch {
      return null;
    }
  };
  const resolveActiveLocale = () => {
    const timeZone = readTimeZone();
    const detection = detectBrowserLocale(timeZone);
    const stored = resolveSynCloudOSLocaleCode(persistence.getPreference<string | null>(localePreferenceKey, null));
    if (stored) return { ...createSynCloudOSLocaleResolution(stored, "stored", timeZone), detectedLocale: detection.detectedLocale };
    const url = resolveSynCloudOSLocaleCode(readUrlLocale());
    if (url) return { ...createSynCloudOSLocaleResolution(url, "url", timeZone), detectedLocale: detection.detectedLocale };
    return { ...detection.resolution, detectedLocale: detection.detectedLocale };
  };
  const applyDocumentLocale = (locale: SynCloudOSLocaleCode) => {
    const document = browser.getDocument();
    if (!document) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = getSynCloudOSLocaleDirection(locale);
  };
  const commitSnapshot = (
    resolution: ReturnType<typeof resolveActiveLocale>,
    serviceAvailable: boolean,
    dictionaryVersion?: number,
  ) => {
    store.mutate((draft) => {
      const previous = draft.localeServices ?? getInitialLocaleServicesSnapshot();
      draft.localeServices = {
        ...previous,
        activeLocale: resolution.activeLocale,
        requestedLocale: resolution.requestedLocale,
        detectedLocale: resolution.detectedLocale,
        source: resolution.source,
        supportedLocales: getSynCloudOSSupportedLocales(),
        direction: resolution.direction,
        timeZone: resolution.timeZone,
        resolvedAt: now(),
        dictionaryVersion: dictionaryVersion ?? previous.dictionaryVersion,
        serviceAvailable,
      };
    });
    applyDocumentLocale(resolution.activeLocale);
  };
  const incrementDictionaryVersion = () => store.mutate((draft) => {
    draft.localeServices = {
      ...draft.localeServices,
      dictionaryVersion: draft.localeServices.dictionaryVersion + 1,
    };
  });
  const registerService = (availability: "available" | "unavailable") => services.register({
    id: "locale",
    displayName: "Locale",
    description: "Runtime-owned locale detection, formatting, and translation service.",
    availability,
    providedCapabilities: ["locale.detect", "locale.format", "locale.translate", "locale.bundleResources"],
    capabilityMetadata: { tier: "core", tags: ["locale", "optional"] },
    metadata: { optional: true, defaultLocale: defaultSynCloudOSLocale },
  });

  const locale: RuntimeLocaleServices = {
    runtimeId,
    hydrate() {
      if (disposed) return this.getSnapshot();
      try {
        registerService("available");
        const resolution = resolveActiveLocale();
        commitSnapshot(resolution, true);
        hydrated = true;
        events.publish("locale.changed", { activeLocale: resolution.activeLocale, source: resolution.source, serviceAvailable: true }, "LocaleServices");
      } catch (error) {
        return this.markUnavailable(error);
      }
      return this.getSnapshot();
    },
    markUnavailable(error) {
      if (disposed) return this.getSnapshot();
      const resolution = { ...createSynCloudOSLocaleResolution(defaultSynCloudOSLocale, "default", readTimeZone()), detectedLocale: detectBrowserLocale().detectedLocale };
      registerService("unavailable");
      commitSnapshot(resolution, false);
      events.publish("locale.hydrate.failed", { error: error instanceof Error ? error.message : error ? String(error) : "LocaleServices unavailable" }, "LocaleServices");
      return this.getSnapshot();
    },
    isAvailable() { return this.getSnapshot().serviceAvailable; },
    getSnapshot() { return store.getSnapshot().localeServices; },
    getActiveLocale() { return this.getSnapshot().activeLocale; },
    getSupportedLocales() { return getSynCloudOSSupportedLocales(); },
    resolveLocale(input) { return createSynCloudOSLocaleResolution(input, "default", readTimeZone()); },
    detectLocale() { return detectBrowserLocale().resolution; },
    setLocale(localeCode) {
      if (disposed) return this.getSnapshot();
      const localeCodeResolved = resolveSynCloudOSLocaleCode(localeCode) ?? defaultSynCloudOSLocale;
      persistence.setPreference(localePreferenceKey, localeCodeResolved);
      const resolution = { ...createSynCloudOSLocaleResolution(localeCodeResolved, "stored", readTimeZone()), detectedLocale: detectBrowserLocale().detectedLocale };
      commitSnapshot(resolution, hydrated || this.isAvailable());
      events.publish("locale.changed", { activeLocale: resolution.activeLocale, requestedLocale: resolution.requestedLocale, source: resolution.source, serviceAvailable: this.isAvailable() }, "LocaleServices");
      void this.loadBundleLocaleResources();
      return this.getSnapshot();
    },
    clearLocale() {
      if (disposed) return this.getSnapshot();
      persistence.removePreference(localePreferenceKey);
      const resolution = resolveActiveLocale();
      commitSnapshot(resolution, hydrated || this.isAvailable());
      events.publish("locale.changed", { activeLocale: resolution.activeLocale, requestedLocale: resolution.requestedLocale, source: resolution.source, serviceAvailable: this.isAvailable() }, "LocaleServices");
      void this.loadBundleLocaleResources();
      return this.getSnapshot();
    },
    formatDate(value, options) { return formatSynCloudOSDate(this.getActiveLocale(), value, options); },
    formatTime(value, options) { return formatSynCloudOSTime(this.getActiveLocale(), value, options); },
    formatNumber(value, options) { return formatSynCloudOSNumber(this.getActiveLocale(), value, options); },
    formatFileSize(bytes, options) { return formatSynCloudOSFileSize(this.getActiveLocale(), bytes, options); },
    formatRelativeTime(value, unit, options) { return formatSynCloudOSRelativeTime(this.getActiveLocale(), value, unit, options); },
    formatList(values, options) { return formatSynCloudOSList(this.getActiveLocale(), values, options); },
    registerTranslations(namespace, localeCode, messages) {
      if (disposed) return false;
      const resolved = resolveSynCloudOSLocaleCode(localeCode);
      if (!resolved) return false;
      registry.registerTranslations(namespace, resolved, messages);
      incrementDictionaryVersion();
      return true;
    },
    registerBundleLocaleResources(appId, resources) {
      if (disposed) return { appId, registered: 0 };
      const result = registerSynCloudOSBundleLocaleResources(appId, resources, registry);
      if (result.registered > 0) incrementDictionaryVersion();
      return result;
    },
    registerBundleLocaleResourceLoader(appId, loader) {
      if (disposed) return { appId, registered: false };
      loaders.set(appId, loader);
      for (const key of loading.keys()) if (key.startsWith(`${appId}:`)) loading.delete(key);
      return { appId, registered: true };
    },
    loadBundleLocaleResources(appIds) {
      const ids = appIds ?? [...loaders.keys()];
      const activeLocale = locale.getActiveLocale();
      return Promise.all(ids.map((appId) => {
        const loader = loaders.get(appId);
        if (!loader || disposed) return Promise.resolve({ appId, registered: 0 });
        const key = `${appId}:${activeLocale}`;
        const existing = loading.get(key);
        if (existing) return existing;
        const promise = Promise.resolve(loader(activeLocale))
          .then((resources) => disposed || !resources ? { appId, registered: 0 } : locale.registerBundleLocaleResources(appId, resources))
          .catch((error) => {
            events.publish("locale.bundleResources.failed", { appId, error: error instanceof Error ? error.message : String(error) }, "LocaleServices");
            return { appId, registered: 0 };
          })
          .finally(() => loading.delete(key));
        loading.set(key, promise);
        return promise;
      }));
    },
    t(key, params, namespace) {
      const resolvedNamespace = typeof params === "string" ? params : namespace ?? getDefaultSynCloudOSTranslationNamespace();
      const resolvedParams = typeof params === "string" ? undefined : params;
      return interpolate(registry.lookup(resolvedNamespace, key, this.getActiveLocale() as SynCloudOSLocaleCode, defaultSynCloudOSLocale) ?? key, resolvedParams);
    },
    dispose() {
      disposed = true;
      loaders.clear();
      loading.clear();
      registry.dispose();
    },
  };
  return locale;
}

/** There is one locale service per runtime; callers use the runtime-owned service directly. */
export function createLocaleServices(runtime: SynCloudOSRuntime, _dependencies?: { serviceRegistry: unknown }): RuntimeLocaleServices {
  return runtime.locale as RuntimeLocaleServices;
}

/** There is one locale service per runtime; no facade may manufacture another. */
export function createLocaleServicesFacade(runtime: SynCloudOSRuntime): RuntimeLocaleServices {
  return runtime.locale as RuntimeLocaleServices;
}
