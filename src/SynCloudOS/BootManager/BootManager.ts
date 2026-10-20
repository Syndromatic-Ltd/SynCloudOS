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

import type { TrustedSynWareBundle } from "../BundleLoader/bundleTypes";
import type { SynCloudOSServiceProvider } from "../ServiceRegistry/serviceTypes";
import type { SynCloudOSBootReport, SynCloudOSBootStageReport } from "./bootTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

export interface SynCloudOSBootOptions {
  appBundles?: TrustedSynWareBundle[];
  serviceProviders?: SynCloudOSServiceProvider[];
  initialPathname?: string;
}

type SynCloudOSBootManagerHotData = {
  didBoot?: boolean;
  lastBootReport?: SynCloudOSBootReport | null;
};

export function createBootManager(runtime: SynCloudOSRuntime, dependencies: {
  appRegistry: any; policyKit: any; responsiveModeManager: any;
  routeManager: any; runtimeController: any; serviceRegistry: any; statechart: any;
  loginServices: any; localeServices: any;
}) {
const AppRegistry = dependencies.appRegistry;
const EventBus = runtime.events;
const PolicyKit = dependencies.policyKit;
const ResponsiveModeManager = dependencies.responsiveModeManager;
const RouteManager = dependencies.routeManager;
const RuntimeController = dependencies.runtimeController;
const ServiceRegistry = dependencies.serviceRegistry;
const Statechart = dependencies.statechart;
const LoginServices = dependencies.loginServices;
const LocaleServices = dependencies.localeServices;
const bootManagerHotData = undefined as SynCloudOSBootManagerHotData | undefined;

let didBoot = bootManagerHotData?.didBoot ?? RuntimeController.getSnapshot().booted;
let lastBootReport: SynCloudOSBootReport | null = bootManagerHotData?.lastBootReport ?? null;

function completeStage(id: string, label: string, startedAt: number, detail?: unknown): SynCloudOSBootStageReport {
  const completedAt = runtime.environment.now();
  return {
    id,
    label,
    status: "complete",
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    detail
  };
}

function skippedStage(id: string, label: string, at: number, detail?: unknown): SynCloudOSBootStageReport {
  return {
    id,
    label,
    status: "skipped",
    startedAt: at,
    completedAt: at,
    durationMs: 0,
    detail
  };
}

function runStage<T>(stages: SynCloudOSBootStageReport[], id: string, label: string, operation: () => T) {
  const startedAt = runtime.environment.now();
  EventBus.publish("boot.phase.begin", { id, label }, label);
  try {
    const detail = operation();
    const stage = completeStage(id, label, startedAt, detail);
    stages.push(stage);
    EventBus.publish("boot.phase.complete", stage, label);
    return detail;
  } catch (error) {
    const completedAt = runtime.environment.now();
    const stage: SynCloudOSBootStageReport = {
      id,
      label,
      status: "failed",
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
    stages.push(stage);
    EventBus.publish("boot.phase.failed", stage, label);
    throw error;
  }
}

function registerBundleLocaleResources(appBundles: TrustedSynWareBundle[]) {
  let bundleCount = 0;
  let registered = 0;
  let lazyLoaders = 0;
  const failures: Array<{ appId: string; error: string }> = [];

  for (const bundle of appBundles) {
    if (!bundle.localeResources && !bundle.localeResourceLoader) continue;
    try {
      bundleCount += 1;
      if (bundle.localeResources) {
        const result = LocaleServices.registerBundleLocaleResources(bundle.manifest.bundleIdentifier, bundle.localeResources);
        registered += result.registered;
      }
      if (bundle.localeResourceLoader) {
        LocaleServices.registerBundleLocaleResourceLoader(bundle.manifest.bundleIdentifier, bundle.localeResourceLoader);
        lazyLoaders += 1;
      }
    } catch (error) {
      failures.push({
        appId: bundle.manifest.bundleIdentifier,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (lazyLoaders > 0) {
    void LocaleServices.loadBundleLocaleResources().catch((error: unknown) => {
      EventBus.publish("locale.bundleResources.failed", {
        error: error instanceof Error ? error.message : String(error)
      }, "SynCloudOS Boot");
    });
  }

  return { bundleCount, registered, lazyLoaders, failures };
}


function createReport(reused: boolean, initialState: string, startedAt: number, stages: SynCloudOSBootStageReport[]): SynCloudOSBootReport {
  const completedAt = runtime.environment.now();
  const snapshot = RuntimeController.getSnapshot();
  const serviceHealth = ServiceRegistry.getHealthReport();

  return {
    booted: true,
    reused,
    appCount: Object.keys(snapshot.appInfo).length,
    displayAppCount: AppRegistry.getDisplayApps().length,
    serviceCount: Object.keys(snapshot.services).length,
    routeCount: RouteManager.getRouteTable().length,
    windowCount: runtime.windows.list().length,
    initialState,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    at: completedAt,
    stages,
    serviceHealth
  };
}

const bootManager = {
  runtimeId: runtime.runtimeId,
  boot(options: SynCloudOSBootOptions = {}): SynCloudOSBootReport {
    const startedAt = runtime.environment.now();
    const initialState = Statechart.getCurrentState();
    const appBundles = options.appBundles ?? [];
    const location = runtime.environment.browser.getLocation();
    const initialPathname = options.initialPathname ?? `${location.pathname}${location.search}${location.hash}`;
    const serviceProviders: SynCloudOSServiceProvider[] = options.serviceProviders ?? ServiceRegistry.getDefaultServiceProviders();

    if (didBoot) {
      lastBootReport = createReport(true, initialState, startedAt, [
        skippedStage("boot.reuse", "Reuse existing SynCloudOS boot", startedAt, { reason: "BootManager.boot was already completed." })
      ]);
      EventBus.publish("runtime.boot.skipped", lastBootReport, "SynCloudOS Boot");
      return lastBootReport;
    }

    return RuntimeController.batch(() => {
      const stages: SynCloudOSBootStageReport[] = [];
      EventBus.publish("runtime.boot.begin", { appCount: appBundles.length }, "SynCloudOS Boot");
      runStage(stages, "services.providers", "Register service providers", () => {
        ServiceRegistry.ensureDefaults(serviceProviders);
        return { serviceCount: ServiceRegistry.getServices().length };
      });
      runStage(stages, "services.hydrate", "Hydrate service providers", () => {
        const hydrated = serviceProviders
          .filter((provider) => provider.hydrate)
          .map((provider) => ({
            providerId: provider.id,
            detail: provider.hydrate?.()
          }));
        return { hydrated };
      });
      runStage(stages, "locale.hydrate", "Hydrate LocaleServices", () => {
        try {
          return LocaleServices.hydrate();
        } catch (error) {
          return LocaleServices.markUnavailable(error);
        }
      });
      runStage(stages, "locale.bundleResources", "Register SynWare locale resources", () => registerBundleLocaleResources(appBundles));
      const registeredApps = runStage(stages, "apps.register", "Register trusted SynWare", () => AppRegistry.registerMany(appBundles));
      runStage(stages, "responsive.observe", "Observe responsive mode", () => {
        ResponsiveModeManager.observe();
        return RuntimeController.getSnapshot().responsive;
      });
      runStage(stages, "notifications.seed", "Seed optional notifications", () => {
        const seeded = serviceProviders
          .filter((provider) => provider.seedNotifications)
          .map((provider) => ({
            providerId: provider.id,
            detail: provider.seedNotifications?.()
          }));
        return { seeded };
      });
      runStage(stages, "login.hydrate", "Hydrate LoginServices session", () => {
        return LoginServices.getSnapshot();
      });
      runStage(stages, "runtime.markBooted", "Mark runtime booted", () => RuntimeController.markBooted());
      runStage(stages, "statechart.initial", "Enter initial workspace route", () => {
        const webspringPolicy = PolicyKit.authorise({
          action: "webspring.enter",
          source: "SynCloudOS.BootManager.boot",
          origin: "runtime"
        });
        if (!webspringPolicy.allowed) {
          return Statechart.gotoState("locked.loginWindow", {
            source: "BootManager.boot",
            closeWindows: false,
            syncRoute: false,
            context: { webspringPolicy, initialPathname }
          });
        }
        return RouteManager.openRoute(initialPathname, {
          source: "boot",
          syncRoute: false,
          context: { initialRoute: true }
        });
      });
      didBoot = true;

      const report = createReport(false, initialState, startedAt, stages);
      lastBootReport = report;
      EventBus.publish("runtime.boot.complete", {
        appCount: registeredApps.length,
        displayAppCount: report.displayAppCount,
        serviceHealth: report.serviceHealth
      }, "SynCloudOS Boot");
      return report;
    });
  },
  getLastBootReport() {
    return lastBootReport;
  },

  dispose() {
    lastBootReport = null;
    didBoot = false;
  }
};

return bootManager;
}
