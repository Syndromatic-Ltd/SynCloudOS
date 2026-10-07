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

import type { ServiceTerminalOperations } from "../Documents/serviceTerminalOperations";
import type {
  SynCloudOSServiceDefinition,
  SynCloudOSServiceDependencyReport,
  SynCloudOSServiceExplanation,
  SynCloudOSServiceHealth,
  SynCloudOSServiceHealthReport,
  SynCloudOSServiceImpactApp,
  SynCloudOSServiceImpactReport,
  SynCloudOSServiceMissingDependency,
  SynCloudOSServiceProvider,
  SynCloudOSServiceProviderRef,
  SynCloudOSServiceReport,
  SynCloudOSServiceReportItem
} from "./serviceTypes";
import type {
  SynCloudOSRuntime,
  SynCloudOSServiceRegistry,
  SynCloudOSRuntimeId,
  SynCloudOSAppServiceDefinition,
  SynCloudOSAppServiceResolution,
} from "../Runtime/runtimeInstanceTypes";
import { serviceVersionAtLeast } from "../serviceVersion";
import { inspectExternalRouteSafety } from "../Routing/routeNormalization";

export function createServiceRegistry(runtime: SynCloudOSRuntime) {
const EventBus = runtime.events;
const RuntimeStore = runtime.store;
const appServices = new Map<string, SynCloudOSAppServiceDefinition<unknown>>();
const descriptorRegistrations = new Map<string, SynCloudOSServiceDefinition>();
let disposed = false;

const defaultCoreServices: SynCloudOSServiceDefinition[] = [
  {
    id: "webspring",
    displayName: "Webspring",
    description: "Public Webspring shell.",
    availability: "available",
    dependencies: ["assetLoading", "responsiveMode"],
    providedCapabilities: ["webspring.display"],
    capabilityMetadata: { tier: "core", tags: ["shell"] }
  },
  {
    id: "routing",
    displayName: "Routing",
    description: "Route-to-app resolution.",
    availability: "available",
    dependencies: ["internalContent"],
    providedCapabilities: ["route.resolve"],
    capabilityMetadata: { tier: "core", tags: ["navigation"] }
  },
  {
    id: "windowing",
    displayName: "Windowing",
    description: "Atmo app windows and focus.",
    availability: "available",
    providedCapabilities: ["window.open", "window.focus"],
    capabilityMetadata: { tier: "core", tags: ["workspace"] }
  },
  {
    id: "notifications",
    displayName: "Notifications",
    description: "Badges, news, and runtime notices.",
    availability: "available",
    providedCapabilities: ["notification.post"],
    capabilityMetadata: { tier: "core", tags: ["workspace"] }
  },
  {
    id: "internalContent",
    displayName: "Internal Content",
    description: "Trusted local SynWare content.",
    availability: "available",
    providedCapabilities: ["content.read.local"],
    capabilityMetadata: { tier: "content", tags: ["bundles"] }
  },
  {
    id: "externalLinking",
    displayName: "External Linking",
    description: "Safe external URL opening.",
    availability: "available",
    providedCapabilities: ["external.open"],
    capabilityMetadata: { tier: "core", tags: ["navigation"] }
  },
  { id: "assetLoading", displayName: "Asset Loading", description: "Local asset selection and DPI handling.", availability: "available", providedCapabilities: ["asset.load"], capabilityMetadata: { tier: "core", tags: ["assets"] } },
  { id: "responsiveMode", displayName: "Responsive Mode", description: "Viewport mode observation.", availability: "available", providedCapabilities: ["viewport.observe"], capabilityMetadata: { tier: "core", tags: ["responsive"] } },
  { id: "diagnostics", displayName: "Diagnostics", description: "Internal runtime diagnostics.", availability: "available", dependencies: ["routing", "windowing"], providedCapabilities: ["diagnostics.view"], capabilityMetadata: { tier: "diagnostic", tags: ["internal"] }, internal: true }
];

const defaultOptionalServices: SynCloudOSServiceDefinition[] = [
  {
    id: "contact",
    displayName: "Contact",
    description: "Generic mail composition with a mailto fallback.",
    availability: "available",
    dependencies: ["externalLinking"],
    providedCapabilities: ["contact.compose"],
    capabilityMetadata: { tier: "app", tags: ["contact"] }
  }
];

const defaultFutureServices: SynCloudOSServiceDefinition[] = [
  { id: "identity.future", displayName: "Identity", description: "Future authenticated identity service.", availability: "future", providedCapabilities: ["identity.session"], capabilityMetadata: { tier: "future", tags: ["identity"] } },
  { id: "storage.future", displayName: "Storage", description: "Future storage service.", availability: "future", providedCapabilities: ["storage.read", "storage.write"], capabilityMetadata: { tier: "future", tags: ["storage"] } },
  { id: "publishing.future", displayName: "Publishing", description: "Future publishing service.", availability: "future", providedCapabilities: ["publishing.write"], capabilityMetadata: { tier: "future", tags: ["publishing"] } }
];

const defaultServiceProviders: SynCloudOSServiceProvider[] = [
  {
    id: "syncloudos.core-runtime",
    displayName: "SynCloudOS Core Runtime",
    phase: "core",
    services: defaultCoreServices
  },
  {
    id: "syncloudos.optional-services",
    displayName: "SynCloudOS Optional Services",
    phase: "optional",
    services: defaultOptionalServices
  },
  {
    id: "syncloudos.future-services",
    displayName: "SynCloudOS Future Services",
    phase: "future",
    services: defaultFutureServices
  }
];

const registeredProviderIds = new Set<string>();
let activeDefaultServiceProviders = defaultServiceProviders;

function providerRef(provider: SynCloudOSServiceProvider): SynCloudOSServiceProviderRef {
  return {
    id: provider.id,
    displayName: provider.displayName,
    phase: provider.phase
  };
}

function serviceWithProvider(service: SynCloudOSServiceDefinition, provider: SynCloudOSServiceProvider) {
  return {
    ...service,
    provider: service.provider ?? providerRef(provider)
  };
}

function getProviderServices(provider: SynCloudOSServiceProvider) {
  const registered = provider.registerServices?.() ?? [];
  return [...(provider.services ?? []), ...(Array.isArray(registered) ? registered : [])].map((service) =>
    serviceWithProvider(service, provider)
  );
}

function cloneDefaultServiceProviders() {
  return defaultServiceProviders.map((provider) => ({
    ...provider,
    services: provider.services?.map((service) => ({ ...service }))
  }));
}

function ensureDefaults(providers?: SynCloudOSServiceProvider[]) {
  if (providers) activeDefaultServiceProviders = providers;
  const targetProviders = providers ?? activeDefaultServiceProviders;
  const pendingProviders = targetProviders.filter((provider) => !registeredProviderIds.has(provider.id));
  if (pendingProviders.length === 0) return;
  RuntimeStore.mutate((draft) => {
    for (const provider of pendingProviders) {
      for (const service of getProviderServices(provider)) {
        draft.services[service.id] = draft.services[service.id] ?? service;
      }
    }
  });
  pendingProviders.forEach((provider) => registeredProviderIds.add(provider.id));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getAggregateHealth(items: SynCloudOSServiceReportItem[]): SynCloudOSServiceHealth {
  if (items.some((item) => item.health === "unavailable")) return "unavailable";
  if (items.some((item) => item.health === "degraded")) return "degraded";
  if (items.length > 0 && items.every((item) => item.health === "future")) return "future";
  return "healthy";
}

function compareServiceHealth(left: SynCloudOSServiceHealth, right: SynCloudOSServiceHealth) {
  const order: Record<SynCloudOSServiceHealth, number> = {
    healthy: 0,
    future: 1,
    degraded: 2,
    unavailable: 3
  };
  return order[left] - order[right];
}

function getWorstHealth(values: SynCloudOSServiceHealth[]) {
  return values.reduce<SynCloudOSServiceHealth>(
    (worst, health) => (compareServiceHealth(health, worst) > 0 ? health : worst),
    "healthy"
  );
}

function canonicalizeCyclePath(path: string[]) {
  const cycle = path.slice(0, -1);
  if (cycle.length === 0) return path;
  const rotations: string[][] = [];
  const addRotations = (values: string[]) => {
    for (let index = 0; index < values.length; index += 1) {
      rotations.push([...values.slice(index), ...values.slice(0, index)]);
    }
  };

  addRotations(cycle);
  addRotations([...cycle].reverse());
  const best = rotations.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")))[0] ?? cycle;
  return [...best, best[0]];
}

function uniqueCyclePaths(paths: string[][]) {
  const cycles = new Map<string, string[]>();
  for (const path of paths) {
    const canonical = canonicalizeCyclePath(path);
    cycles.set(canonical.join("\u0000"), canonical);
  }
  return Array.from(cycles.values());
}

function serviceCapabilityFields(service: SynCloudOSServiceDefinition) {
  const providedCapabilities = unique([...(service.capabilities ?? []), ...(service.providedCapabilities ?? [])]);

  return {
    requiredPermission: service.requiredPermission,
    capabilities: service.capabilities,
    providedCapabilities: providedCapabilities.length > 0 ? providedCapabilities : undefined,
    requiredCapabilities: service.requiredCapabilities,
    optionalCapabilities: service.optionalCapabilities,
    capabilityMetadata: service.capabilityMetadata,
    metadata: service.metadata,
    provider: service.provider
  };
}

function evaluateService(serviceId: string, stack: string[] = []): SynCloudOSServiceReportItem {
  const snapshot = RuntimeStore.getSnapshot();
  const service = snapshot.services[serviceId];

  if (stack.includes(serviceId)) {
    const cyclePath = [...stack.slice(stack.indexOf(serviceId)), serviceId];
    return {
      serviceId,
      available: false,
      status: service?.availability ?? "unavailable",
      health: "degraded",
      displayName: service?.displayName,
      description: service?.description,
      internal: service?.internal,
      ...(service ? serviceCapabilityFields(service) : {}),
      dependencyIds: [],
      missingDependencyIds: [],
      blockingServiceIds: [serviceId],
      cyclePaths: [cyclePath],
      dependencies: [],
      reason: `Dependency cycle detected: ${cyclePath.join(" -> ")}.`
    };
  }

  if (!service) {
    return {
      serviceId,
      available: false,
      status: "unavailable",
      health: "unavailable",
      dependencyIds: [],
      missingDependencyIds: [],
      blockingServiceIds: [serviceId],
      cyclePaths: [],
      dependencies: [],
      reason: "Service is not registered."
    };
  }

  const dependencyIds = service.dependencies ?? [];
  const dependencies = dependencyIds.map((dependencyId) => evaluateService(dependencyId, [...stack, serviceId]));
  const directMissingDependencyIds = dependencyIds.filter((dependencyId) => !snapshot.services[dependencyId]);
  const missingDependencyIds = unique([
    ...directMissingDependencyIds,
    ...dependencies.flatMap((dependency) => dependency.missingDependencyIds)
  ]);
  const cyclePaths = uniqueCyclePaths(dependencies.flatMap((dependency) => dependency.cyclePaths));
  const blockingServiceIds = unique(
    dependencies.flatMap((dependency) =>
      dependency.available ? [] : [dependency.serviceId, ...dependency.blockingServiceIds]
    )
  );
  const ownAvailable = service.availability === "available";
  const available = ownAvailable && blockingServiceIds.length === 0;
  const health: SynCloudOSServiceHealth =
    service.availability === "future"
      ? "future"
      : available
        ? "healthy"
        : ownAvailable
          ? "degraded"
          : "unavailable";
  const reasons: string[] = [];

  if (service.availability === "future") reasons.push("Service is registered as future-facing and is not expected to be live yet.");
  if (service.availability === "unavailable") reasons.push("Service is registered but unavailable.");
  if (ownAvailable && blockingServiceIds.length > 0) {
    reasons.push(`Blocked by unavailable dependency service(s): ${blockingServiceIds.join(", ")}.`);
  }
  if (missingDependencyIds.length > 0) {
    reasons.push(`Missing dependency service(s): ${missingDependencyIds.join(", ")}.`);
  }
  if (cyclePaths.length > 0) {
    reasons.push(`Dependency cycle path(s): ${cyclePaths.map((path) => path.join(" -> ")).join("; ")}.`);
  }

  return {
    serviceId,
    available,
    status: service.availability,
    health,
    displayName: service.displayName,
    description: service.description,
    internal: service.internal,
    ...serviceCapabilityFields(service),
    dependencyIds,
    missingDependencyIds,
    blockingServiceIds,
    cyclePaths,
    dependencies,
    reason: reasons.length > 0 ? reasons.join(" ") : undefined
  };
}

function getServiceReportBlockerIds(report: SynCloudOSServiceReport) {
  return unique(
    report.items.flatMap((item) =>
      item.available ? [] : [item.serviceId, ...item.blockingServiceIds, ...item.missingDependencyIds]
    )
  );
}

function createServiceReport(requiredServices: string[]): SynCloudOSServiceReport {
  const items = requiredServices.map((serviceId) => evaluateService(serviceId));
  return {
    ok: items.every((item) => item.available),
    requiredServices,
    items,
    missing: unique(items.flatMap((item) => (item.available ? [] : [item.serviceId, ...item.blockingServiceIds]))),
    checkedAt: Date.now(),
    health: getAggregateHealth(items)
  };
}

function createDirectGraph(snapshot: ReturnType<typeof RuntimeStore.getSnapshot>, serviceIds: string[]) {
  return serviceIds.reduce<Record<string, string[]>>((graph, serviceId) => {
    graph[serviceId] = [...(snapshot.services[serviceId]?.dependencies ?? [])];
    return graph;
  }, {});
}

function createDependencyScope(snapshot: ReturnType<typeof RuntimeStore.getSnapshot>, rootServiceIds: string[]) {
  const scope = new Set<string>();
  const visit = (serviceId: string) => {
    if (scope.has(serviceId)) return;
    scope.add(serviceId);
    for (const dependencyId of snapshot.services[serviceId]?.dependencies ?? []) {
      visit(dependencyId);
    }
  };

  rootServiceIds.forEach(visit);
  return Array.from(scope);
}

function createReverseGraph(directGraph: Record<string, string[]>) {
  const reverseGraph: Record<string, string[]> = {};

  for (const serviceId of Object.keys(directGraph)) {
    reverseGraph[serviceId] = reverseGraph[serviceId] ?? [];
  }

  for (const [serviceId, dependencyIds] of Object.entries(directGraph)) {
    for (const dependencyId of dependencyIds) {
      reverseGraph[dependencyId] = unique([...(reverseGraph[dependencyId] ?? []), serviceId]);
    }
  }

  return reverseGraph;
}

function collectReachable(graph: Record<string, string[]>, serviceId: string) {
  const visited = new Set<string>();
  const visit = (currentId: string) => {
    for (const nextId of graph[currentId] ?? []) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      visit(nextId);
    }
  };

  visit(serviceId);
  visited.delete(serviceId);
  return Array.from(visited);
}

function findCyclePaths(directGraph: Record<string, string[]>, rootServiceIds: string[]) {
  const paths: string[][] = [];
  const visit = (serviceId: string, path: string[]) => {
    const cycleStart = path.indexOf(serviceId);
    if (cycleStart >= 0) {
      paths.push([...path.slice(cycleStart), serviceId]);
      return;
    }

    if (!directGraph[serviceId]) return;

    for (const dependencyId of directGraph[serviceId]) {
      visit(dependencyId, [...path, serviceId]);
    }
  };

  rootServiceIds.forEach((serviceId) => visit(serviceId, []));
  return uniqueCyclePaths(paths);
}

function findMissingDependencies(
  snapshot: ReturnType<typeof RuntimeStore.getSnapshot>,
  directGraph: Record<string, string[]>
): SynCloudOSServiceMissingDependency[] {
  const missing: SynCloudOSServiceMissingDependency[] = [];
  const seen = new Set<string>();

  for (const [serviceId, dependencyIds] of Object.entries(directGraph)) {
    for (const dependencyId of dependencyIds) {
      if (snapshot.services[dependencyId]) continue;
      const key = `${serviceId}\u0000${dependencyId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      missing.push({ serviceId, dependencyId });
    }
  }

  return missing;
}

function createDependencyReport(serviceIds?: string[]): SynCloudOSServiceDependencyReport {
  const snapshot = RuntimeStore.getSnapshot();
  const rootServiceIds = unique(serviceIds && serviceIds.length > 0 ? serviceIds : Object.keys(snapshot.services));
  const scopedServiceIds = createDependencyScope(snapshot, rootServiceIds);
  const directGraph = createDirectGraph(snapshot, scopedServiceIds);
  const allServiceIds = unique([...Object.keys(snapshot.services), ...scopedServiceIds]);
  const fullDirectGraph = createDirectGraph(snapshot, allServiceIds);
  const reverseGraph = createReverseGraph(fullDirectGraph);
  const transitiveDependencies = scopedServiceIds.reduce<Record<string, string[]>>((dependencies, serviceId) => {
    dependencies[serviceId] = collectReachable(directGraph, serviceId);
    return dependencies;
  }, {});
  const transitiveDependents = scopedServiceIds.reduce<Record<string, string[]>>((dependents, serviceId) => {
    dependents[serviceId] = collectReachable(reverseGraph, serviceId);
    return dependents;
  }, {});
  const missingDependencies = findMissingDependencies(snapshot, directGraph);
  const cyclePaths = findCyclePaths(directGraph, rootServiceIds);

  return {
    ok: missingDependencies.length === 0 && cyclePaths.length === 0,
    checkedAt: Date.now(),
    rootServiceIds,
    serviceIds: scopedServiceIds,
    directGraph,
    reverseGraph,
    transitiveDependencies,
    transitiveDependents,
    missingDependencies,
    cyclePaths,
    services: scopedServiceIds.map((serviceId) => evaluateService(serviceId))
  };
}

function createImpactReport(serviceId: string): SynCloudOSServiceImpactReport {
  const snapshot = RuntimeStore.getSnapshot();
  const dependencyReport = createDependencyReport();
  const service = evaluateService(serviceId);
  const affectedServices = dependencyReport.transitiveDependents[serviceId] ?? [];
  const impactedServiceIds = new Set([serviceId, ...affectedServices]);
  const affectedApps = Object.values(snapshot.appInfo).reduce<SynCloudOSServiceImpactApp[]>((apps, app) => {
    const report = createServiceReport(app.requiredServices);
    const impactedServices = unique(
      app.requiredServices.filter((requiredServiceId) => impactedServiceIds.has(requiredServiceId))
    );
    const affected = impactedServices.length > 0 || report.missing.includes(serviceId);

    if (!affected) return apps;

    apps.push({
      appId: app.id,
      packageName: app.packageName,
      displayName: app.displayName,
      requiredServices: app.requiredServices,
      impactedServices,
      direct: app.requiredServices.includes(serviceId),
      ok: report.ok,
      disabled:
        app.isDisabled ||
        !app.hasAccessToRequiredServices ||
        !report.ok ||
        snapshot.lifecycle[app.id] === "disabled" ||
        Boolean(snapshot.managers[app.id]?.disabled),
      missing: report.missing,
      blockers: getServiceReportBlockerIds(report)
    });
    return apps;
  }, []);
  const disabledApps = affectedApps.filter((app) => app.disabled);
  const blockers = unique([
    ...(!service.available ? [service.serviceId, ...service.blockingServiceIds, ...service.missingDependencyIds] : []),
    ...disabledApps.flatMap((app) => app.blockers)
  ]);

  return {
    serviceId,
    exists: Boolean(snapshot.services[serviceId]),
    checkedAt: Date.now(),
    service,
    affectedServices,
    affectedApps,
    disabledApps,
    blockers,
    dependencyReport
  };
}

function refreshAppServiceStatus() {
  RuntimeStore.mutate((draft) => {
    for (const [appId, app] of Object.entries(draft.appInfo)) {
      const report = createServiceReport(app.requiredServices);
      const serviceStatus = report.items.reduce<Record<string, boolean>>((status, service) => {
        status[service.serviceId] = service.available;
        return status;
      }, {});
      const optionalReport = createServiceReport(app.optionalServices ?? []);
      const optionalServiceStatus = optionalReport.items.reduce<Record<string, boolean>>((status, service) => {
        status[service.serviceId] = service.available;
        return status;
      }, {});
      const unavailableOptionalServices = optionalReport.items
        .filter((service) => !service.available)
        .map((service) => service.serviceId);
      const hasAccessToRequiredServices = report.ok;
      const serviceError = `Required services unavailable: ${report.missing.join(", ") || "unknown"}.`;
      const wasServiceDisabled =
        !app.hasAccessToRequiredServices ||
        Object.values(app.serviceStatus ?? {}).some((available) => !available);
      const unsafeExternalRoute = app.type === "external" && !inspectExternalRouteSafety(app.route).safe;
      const nextDisabled = app.disabled === true || unsafeExternalRoute ||
        !hasAccessToRequiredServices || (app.isDisabled && !wasServiceDisabled);
      draft.appInfo[appId] = {
        ...app,
        serviceStatus,
        optionalServiceStatus,
        unavailableOptionalServices,
        hasAccessToRequiredServices,
        isDisabled: nextDisabled
      };

      const record = draft.managers[appId];
      if (record) {
        draft.managers[appId] = {
          ...record,
          requiredServices: serviceStatus,
          disabled: nextDisabled,
          lastError: hasAccessToRequiredServices
            ? record.lastError?.startsWith("Required services unavailable:")
              ? null
              : record.lastError
            : serviceError
        };
      }

      if (!hasAccessToRequiredServices) {
        draft.lifecycle[appId] = "disabled";
      } else if (draft.lifecycle[appId] === "disabled" && !nextDisabled) {
        draft.lifecycle[appId] = "registered";
      }
    }
  });
}

const serviceRegistry = {
  runtimeId: RuntimeStore.runtimeId,

  register<TDefinition extends SynCloudOSAppServiceDefinition<object>>(definition: TDefinition): TDefinition | null {
    if (disposed || !definition || typeof definition.id !== "string" || definition.id.trim().length === 0) return null;
    const id = definition.id.trim();
    const record = Object.freeze({ ...definition, id }) as SynCloudOSAppServiceDefinition<object>;
    appServices.set(id, record as SynCloudOSAppServiceDefinition<unknown>);
    EventBus.publish("service.available", { runtimeId: RuntimeStore.runtimeId, serviceId: id }, id);
    return record as TDefinition;
  },

  get(serviceId: string) {
    return appServices.get(serviceId) ?? null;
  },

  unregister(serviceId: string): boolean {
    const removed = appServices.delete(serviceId);
    if (removed) EventBus.publish("service.unavailable", { serviceId, reason: "provider-unregistered" }, serviceId);
    return removed;
  },


  resolveAppClient<TClient = object>(request: {
    readonly appId: string;
    readonly serviceId: string;
    readonly permissions: readonly string[];
    readonly minimumVersion?: string;
    readonly contractVersion?: string;
    readonly signal: AbortSignal;
    readonly terminalOperations?: ServiceTerminalOperations;
    readonly purpose?: "mounted" | "route-preparation";
  }): SynCloudOSAppServiceResolution<TClient> {
    const unavailable = (reason: string, version: string | null = null, denied = false): SynCloudOSAppServiceResolution<TClient> => Object.freeze({
      available: false,
      client: null,
      reason,
      denied,
      version,
    });
    if (disposed || request.signal.aborted) return unavailable("The host service session is no longer available.");
    const service = appServices.get(request.serviceId);
    if (!service) return unavailable(`The host did not provide service "${request.serviceId}".`);
    const missingPermissions = (service.requiredPermissions ?? []).filter((permission) => !request.permissions.includes(permission));
    if (missingPermissions.length > 0) {
      return unavailable(`The SynWare did not declare the required permission${missingPermissions.length === 1 ? "" : "s"}: ${missingPermissions.join(", ")}.`, service.version ?? null, true);
    }
    if (!serviceVersionAtLeast(service.version, request.minimumVersion)) {
      return unavailable(`Service "${request.serviceId}" does not meet the requested minimum version ${request.minimumVersion}.`, service.version ?? null);
    }
    if (request.contractVersion !== undefined && service.contractVersion !== request.contractVersion) {
      return unavailable(`Service "${request.serviceId}" does not provide contract version ${request.contractVersion}.`, service.version ?? null);
    }
    const factory = request.purpose === "route-preparation" ? service.createRoutePreparationClient : service.createAppClient;
    if (typeof factory !== "function") return unavailable(`The host did not expose a ${request.purpose === "route-preparation" ? "guard-safe" : "app-scoped"} client for service "${request.serviceId}".`, service.version ?? null);
    try {
      const client = factory(Object.freeze({
        appId: request.appId,
        permissions: Object.freeze([...request.permissions]),
        signal: request.signal,
        ...(request.purpose !== "route-preparation" && request.terminalOperations ? { terminalOperations: request.terminalOperations } : {}),
      }));
      if (!client) return unavailable(`The host declined an app-scoped client for service "${request.serviceId}".`, service.version ?? null);
      return Object.freeze({ available: true, client: client as TClient, reason: null, denied: false, version: service.version ?? null });
    } catch {
      return unavailable(`The host could not create an app-scoped client for service "${request.serviceId}".`, service.version ?? null);
    }
  },

  ensureDefaults,
  getDefaultServiceProviders() {
    return cloneDefaultServiceProviders();
  },

  registerService(service: SynCloudOSServiceDefinition) {
    ensureDefaults();
    descriptorRegistrations.set(service.id, service);
    RuntimeStore.mutate((draft) => {
      draft.services[service.id] = service;
    });
    refreshAppServiceStatus();
    EventBus.publish(service.availability === "available" ? "service.available" : "service.unavailable", service, service.id);
    return service;
  },

  registerMany(services: SynCloudOSServiceDefinition[]) {
    return services.map((service) => this.registerService(service));
  },

  unregisterService(serviceId: string, expected?: SynCloudOSServiceDefinition) {
    if (expected !== undefined && descriptorRegistrations.get(serviceId) !== expected) return;
    descriptorRegistrations.delete(serviceId);
    ensureDefaults();
    RuntimeStore.mutate((draft) => {
      delete draft.services[serviceId];
    });
    refreshAppServiceStatus();
    EventBus.publish("service.unavailable", { serviceId, reason: "unregistered" }, serviceId);
  },

  getService(serviceId: string) {
    ensureDefaults();
    return RuntimeStore.getSnapshot().services[serviceId] ?? null;
  },

  getServices() {
    ensureDefaults();
    return Object.values(RuntimeStore.getSnapshot().services);
  },

  isAvailable(serviceId: string) {
    ensureDefaults();
    return evaluateService(serviceId).available;
  },

  setAvailability(serviceId: string, available: boolean) {
    ensureDefaults();
    const current = this.getService(serviceId);
    if (!current) return null;
    const next: SynCloudOSServiceDefinition = {
      ...current,
      availability: available ? "available" : "unavailable"
    };
    RuntimeStore.mutate((draft) => {
      draft.services[serviceId] = next;
    });
    refreshAppServiceStatus();
    EventBus.publish(available ? "service.available" : "service.unavailable", next, serviceId);
    return next;
  },

  startService(serviceId: string) {
    return this.setAvailability(serviceId, true);
  },

  stopService(serviceId: string) {
    return this.setAvailability(serviceId, false);
  },

  checkRequiredServices(requiredServices: string[]) {
    return this.getServiceReport(requiredServices).ok;
  },

  getServiceReport(requiredServices: string[]): SynCloudOSServiceReport {
    ensureDefaults();
    return createServiceReport(requiredServices);
  },

  getDependencyGraph(serviceIds?: string[]) {
    ensureDefaults();
    const snapshot = RuntimeStore.getSnapshot();
    const ids = serviceIds ?? Object.keys(snapshot.services);
    return ids.reduce<Record<string, string[]>>((graph, serviceId) => {
      graph[serviceId] = snapshot.services[serviceId]?.dependencies ?? [];
      return graph;
    }, {});
  },

  getDependencyReport(serviceIds?: string[]) {
    ensureDefaults();
    return createDependencyReport(serviceIds);
  },

  getImpactReport(serviceId: string) {
    ensureDefaults();
    return createImpactReport(serviceId);
  },

  getHealthReport(requiredServices: string[] = []): SynCloudOSServiceHealthReport {
    ensureDefaults();
    const snapshot = RuntimeStore.getSnapshot();
    const serviceIds = Object.keys(snapshot.services);
    const services = serviceIds.map((serviceId) => evaluateService(serviceId));
    const requiredReport = createServiceReport(requiredServices);
    const dependencyReport = createDependencyReport(serviceIds);
    const unavailable = services.filter((service) => service.health === "unavailable").map((service) => service.serviceId);
    const degraded = services.filter((service) => service.health === "degraded").map((service) => service.serviceId);
    const future = services.filter((service) => service.health === "future").map((service) => service.serviceId);
    const appDependencies = Object.values(snapshot.appInfo).map((app) => {
      const report = createServiceReport(app.requiredServices);
      return {
        appId: app.id,
        packageName: app.packageName,
        requiredServices: app.requiredServices,
        ok: report.ok,
        missing: report.missing,
        health: report.health,
        disabled: app.isDisabled || !app.hasAccessToRequiredServices || !report.ok,
        blockers: getServiceReportBlockerIds(report)
      };
    });
    const requiredHealth = requiredReport.ok ? "healthy" : requiredReport.health === "healthy" ? "unavailable" : requiredReport.health;
    const health = getWorstHealth([
      unavailable.length > 0 ? "unavailable" : "healthy",
      degraded.length > 0 ? "degraded" : "healthy",
      dependencyReport.cyclePaths.length > 0 ? "degraded" : "healthy",
      dependencyReport.missingDependencies.length > 0 ? "degraded" : "healthy",
      requiredHealth
    ]);

    return {
      requiredServices,
      ok: requiredReport.ok && dependencyReport.ok && unavailable.length === 0 && degraded.length === 0,
      health,
      checkedAt: Date.now(),
      serviceCount: services.length,
      availableCount: services.filter((service) => service.available).length,
      unavailableCount: unavailable.length,
      futureCount: future.length,
      degradedCount: degraded.length,
      services,
      missing: requiredReport.missing,
      degraded,
      unavailable,
      future,
      appDependencies,
      requiredReport,
      dependencyReport,
      missingDependencies: dependencyReport.missingDependencies,
      cyclePaths: dependencyReport.cyclePaths
    };
  },

  explainService(serviceId: string): SynCloudOSServiceExplanation {
    ensureDefaults();
    const snapshot = RuntimeStore.getSnapshot();
    const service = evaluateService(serviceId);
    const dependencyReport = createDependencyReport([serviceId]);
    const impact = createImpactReport(serviceId);
    const dependents = Object.values(snapshot.services)
      .filter((candidate) => (candidate.dependencies ?? []).includes(serviceId))
      .map((candidate) => candidate.id);
    const appDependents = Object.values(snapshot.appInfo)
      .filter((app) => app.requiredServices.includes(serviceId))
      .map((app) => ({ appId: app.id, packageName: app.packageName }));
    const reasons = [
      service.reason ?? (service.available ? "Service is available with all dependencies satisfied." : "Service is not available."),
      dependents.length > 0 ? `Service is depended on by: ${dependents.join(", ")}.` : "No registered services depend on this service.",
      appDependents.length > 0
        ? `Service is required by app(s): ${appDependents.map((app) => app.packageName).join(", ")}.`
        : "No registered apps require this service directly."
    ];

    return {
      serviceId,
      exists: Boolean(snapshot.services[serviceId]),
      health: service.health,
      service,
      dependents,
      transitiveDependencies: dependencyReport.transitiveDependencies[serviceId] ?? [],
      transitiveDependents: impact.affectedServices,
      missingDependencies: dependencyReport.missingDependencies,
      cyclePaths: dependencyReport.cyclePaths,
      appDependents,
      impact,
      reasons,
      at: Date.now()
    };
  },

  dispose() {
    disposed = true;
    appServices.clear();
    descriptorRegistrations.clear();
  }
};
return serviceRegistry;
}
