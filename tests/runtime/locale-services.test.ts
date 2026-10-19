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

import { describe, expect, it, vi } from "vitest";
import { parseSynCloudOSStringsFile } from "../../src/SynCloudOS/LocaleServices";
import { createTestRuntime, createTestRuntimeEnvironment, createTestManifest, createRuntimeHarness } from "./helpers";
import { resolveSiteBranding } from "../../src/SynCloudOS/Branding/siteBranding";

function setNavigatorLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true
  });
}

async function loadLocaleRuntime() {
  const environment = createTestRuntimeEnvironment();
  const runtime = createRuntimeHarness(createTestRuntime({
    environment: {
      ...environment,
      localStorage: window.localStorage,
      browser: {
        ...environment.browser,
        getLocation: () => ({
          href: window.location.href,
          origin: window.location.origin,
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
        }),
        getNavigator: () => typeof navigator === "undefined" ? null : navigator,
        getDocument: () => typeof document === "undefined" ? null : document,
        getWindow: () => window,
      },
    },
    persistenceNamespace: "SynCloudOS4",
  }));
  return runtime;
}

describe("LocaleServices runtime infrastructure", () => {
  it("loads only the requested shell locale and British English fallback", async () => {
    const { getWebspringLocaleResourceLoader } = await import("../../src/Webspring/webspringLocale");
    const load = getWebspringLocaleResourceLoader();
    const english = await load("en-GB");
    expect(Object.keys(english ?? {}).sort()).toEqual(["Base.locale", "en-GB.locale"]);
    const french = await load("fr-FR");
    expect(Object.keys(french ?? {}).sort()).toEqual(["Base.locale", "en-GB.locale", "fr-FR.locale"]);
  });

  it("passes the active locale to bundle loaders and reloads when it changes", async () => {
    setNavigatorLanguages(["en-GB"]);
    const { LocaleServices } = await loadLocaleRuntime();
    LocaleServices.hydrate();
    const loader = vi.fn(async (_locale: string) => ({}));
    LocaleServices.registerBundleLocaleResourceLoader("localised", loader);
    await LocaleServices.loadBundleLocaleResources();
    expect(loader).toHaveBeenLastCalledWith("en-GB");
    LocaleServices.setLocale("fr-FR");
    await LocaleServices.loadBundleLocaleResources();
    expect(loader).toHaveBeenLastCalledWith("fr-FR");
  });

  it("resolves localised site branding and registered logo variants without a product fallback", () => {
    const locale = { t: (key: string) => key === "site.name" ? "Example Site" : key };
    expect(resolveSiteBranding({
      name: { key: "site.name", fallback: "Example" },
      logo: { resource: "./Resources/logo.svg", alternativeText: { key: "site.logoAlt", fallback: "Example mark" } },
      darkLogo: { resource: "./Resources/logo-dark.svg", alternativeText: { key: "site.logoAlt", fallback: "Example mark" } },
    }, {
      "./Resources/logo.svg": "/assets/logo.svg",
      "./Resources/logo-dark.svg": "/assets/logo-dark.svg",
    }, locale as never, "com.example.shell")).toEqual({
      name: "Example Site",
      logoUrl: "/assets/logo.svg",
      logoAlt: "Example mark",
      lightLogoUrl: "/assets/logo.svg",
      darkLogoUrl: "/assets/logo-dark.svg",
      compactLogoUrl: "/assets/logo.svg",
      homeIconUrl: null,
    });
    expect(() => resolveSiteBranding({
      name: { key: "site.name", fallback: "Example" },
      logo: { resource: "./Resources/missing.svg", alternativeText: { key: "site.logoAlt", fallback: "Example" } },
    }, {}, locale as never, "com.example.shell")).toThrow(/not registered/iu);
  });
  it("defaults safely to canonical British English", async () => {
    setNavigatorLanguages([]);
    const { LocaleServices, RuntimeController } = await loadLocaleRuntime();

    LocaleServices.hydrate();

    expect(LocaleServices.getActiveLocale()).toBe("en-GB");
    expect(RuntimeController.getSnapshot().localeServices).toMatchObject({
      activeLocale: "en-GB",
      source: "default",
      direction: "ltr",
      serviceAvailable: true
    });
  });

  it.each([
    [["fr-FR", "en-GB"], "fr-FR"],
    [["en-US"], "en-GB"],
    [["pt-BR"], "pt-PT"],
    [["pt-PT"], "pt-PT"],
    [["zh-CN"], "zh-Hans"],
    [["zh-SG"], "zh-Hans"],
    [["zh-TW"], "zh-TW"],
    [["zh-HK"], "zh-TW"],
    [["esperanto-EO"], "en-GB"]
  ])("resolves browser languages %j to %s", async (languages, expected) => {
    setNavigatorLanguages(languages);
    const { LocaleServices } = await loadLocaleRuntime();

    LocaleServices.hydrate();

    expect(LocaleServices.getActiveLocale()).toBe(expected);
  });

  it("lets saved explicit preference win over URL and browser preferences", async () => {
    setNavigatorLanguages(["zh-CN"]);
    window.history.replaceState({}, "", "/?locale=fr-FR");
    window.localStorage.setItem("SynCloudOS4:localeServices.explicitLocale", JSON.stringify("pt-PT"));
    const { LocaleServices, RuntimeController } = await loadLocaleRuntime();

    LocaleServices.hydrate();

    expect(LocaleServices.getActiveLocale()).toBe("pt-PT");
    expect(RuntimeController.getSnapshot().localeServices).toMatchObject({
      activeLocale: "pt-PT",
      source: "stored",
      detectedLocale: "zh-Hans"
    });
  });

  it("uses URL override only when no saved preference exists", async () => {
    setNavigatorLanguages(["zh-CN"]);
    window.history.replaceState({}, "", "/?lang=fr-FR");
    const { LocaleServices } = await loadLocaleRuntime();

    LocaleServices.hydrate();

    expect(LocaleServices.getSnapshot()).toMatchObject({
      activeLocale: "fr-FR",
      source: "url",
      detectedLocale: "zh-Hans"
    });
  });

  it("updates RuntimeStore, persists setLocale, and clears explicit locale", async () => {
    setNavigatorLanguages(["fr-FR"]);
    const { LocaleServices, RuntimeController } = await loadLocaleRuntime();
    LocaleServices.hydrate();
    const listener = vi.fn();
    const unsubscribe = RuntimeController.subscribe(listener);

    LocaleServices.setLocale("pt-BR");

    expect(RuntimeController.getSnapshot().localeServices).toMatchObject({
      activeLocale: "pt-PT",
      requestedLocale: "pt-PT",
      source: "stored"
    });
    expect(window.localStorage.getItem("SynCloudOS4:localeServices.explicitLocale")).toContain("pt-PT");
    expect(listener).toHaveBeenCalled();

    LocaleServices.clearLocale();
    unsubscribe();

    expect(window.localStorage.getItem("SynCloudOS4:localeServices.explicitLocale")).toBeNull();
    expect(LocaleServices.getSnapshot()).toMatchObject({
      activeLocale: "fr-FR",
      source: "browser"
    });
  });

  it("does not make locale a hard app service and survives hydrate failure during boot", async () => {
    const { AppRegistry, BootManager, LocaleServices, RuntimeController, ServiceRegistry } = await loadLocaleRuntime();
    AppRegistry.register(createTestManifest({ id: "locale-optional-app" }));
    const originalHydrate = LocaleServices.hydrate;
    LocaleServices.hydrate = (() => {
      throw new Error("locale offline");
    }) as typeof LocaleServices.hydrate;

    const report = BootManager.boot();
    LocaleServices.hydrate = originalHydrate;

    expect(report.booted).toBe(true);
    expect(RuntimeController.getSnapshot().localeServices).toMatchObject({
      activeLocale: "en-GB",
      serviceAvailable: false
    });
    expect(ServiceRegistry.getServiceReport(["webspring", "routing", "windowing"]).ok).toBe(true);
    expect(RuntimeController.getSnapshot().appInfo["locale-optional-app"].requiredServices).not.toContain("locale");
  });

  it("falls back through translations and interpolates parameters", async () => {
    setNavigatorLanguages(["fr-FR"]);
    const { LocaleServices } = await loadLocaleRuntime();
    LocaleServices.hydrate();

    expect(LocaleServices.t("common.open")).toBe("Ouvrir");
    expect(LocaleServices.t("system.software")).toBe("Logiciels");
    expect(LocaleServices.t("demo.hello", { name: "Kavish" })).toContain("Kavish");
    expect(LocaleServices.t("missing.key")).toBe("missing.key");
  });

  it("registers app bundle .locale resources and falls back through Base.locale", async () => {
    const { LocaleServices } = await loadLocaleRuntime();
    LocaleServices.hydrate();
    LocaleServices.registerBundleLocaleResources("example", {
      "Base.locale": {
        "Localisable.strings": "\"headline\" = \"Base headline\";",
        "MainMenu.strings": "\"file\" = \"Base File\";"
      },
      "en.locale": {
        "Localisable.strings": "\"headline\" = \"English headline\";"
      },
      "fr.locale": {
        "Localisable.strings": "\"headline\" = \"Titre francais\";"
      }
    });

    LocaleServices.setLocale("fr-FR");
    expect(LocaleServices.t("headline", undefined, "synapps.example")).toBe("Titre francais");
    expect(LocaleServices.t("file", undefined, "synapps.example.mainMenu")).toBe("Base File");

    LocaleServices.setLocale("de-DE");
    expect(LocaleServices.t("headline", undefined, "synapps.example")).toBe("English headline");
  });



  it("returns strings from formatting helpers without throwing", async () => {
    const { LocaleServices } = await loadLocaleRuntime();
    LocaleServices.hydrate();

    expect(typeof LocaleServices.formatDate(Date.now())).toBe("string");
    expect(typeof LocaleServices.formatTime(Date.now())).toBe("string");
    expect(typeof LocaleServices.formatNumber(1234.56)).toBe("string");
    expect(typeof LocaleServices.formatFileSize(1536)).toBe("string");
    expect(typeof LocaleServices.formatRelativeTime(-1, "day")).toBe("string");
    expect(typeof LocaleServices.formatList(["one", "two", "three"])).toBe("string");
  });

  it("represents complete v1 locale metadata honestly", async () => {
    const { LocaleServices } = await loadLocaleRuntime();

    const metadata = LocaleServices.getSupportedLocales();

    expect(metadata.find((locale) => locale.code === "en-GB")?.translationCompleteness).toBe("complete");
    expect(metadata.every((locale) => locale.translationCompleteness === "complete")).toBe(true);
    expect(metadata.every((locale) => locale.direction === "ltr")).toBe(true);
  });


});
