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

import type { RuntimePerformanceSnapshot } from "../Performance/RuntimePerformancePolicy";
import type { RuntimeResourceSnapshot } from "../Resources/RuntimeResourceLedger";
import type { HeavyJobAdmissionSnapshot } from "../Operations/HeavyJobAdmission";
import type { RuntimeMemorySample } from "../Runtime/runtimeInstanceTypes";
import { Config } from "../Config/Config";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { SynCloudOSAppRegistrationHistoryRecord } from "../AppRegistry/appRegistryTypes";
import type { SynCloudOSBootReport } from "../BootManager/bootTypes";
import type { CommandInspection } from "../Commands/commandTypes";
import type { SynCloudOSRuntime, RuntimeOwnedService } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeSnapshot, RuntimeTransactionRecord } from "../Runtime/runtimeTypes";
import type { RuntimeCacheStats } from "../Cache/cacheTypes";
import type { SynCloudOSRuntimeEvent } from "../EventBus/eventTypes";
import type { FocusScopeRegistration } from "../Focus/focusTypes";
import type { SynCloudOSPolicyAuditReport, SynCloudOSCapabilityMatrix, SynCloudOSPolicyDecision, SynCloudOSRoleCapabilityReportItem } from "../PolicyKit/policyTypes";
import type { KeyBindingCandidateInspection, KeyBindingDeclaration } from "../KeyBindings/keyBindingTypes";
import type { SynCloudOSLaunchHistoryRecord, SynCloudOSLaunchQueueSnapshot } from "../LaunchServices/launchTypes";
import type { ResponderGraphInspection } from "../Responders/responderTypes";
import type { UndoManagerInspection } from "../Undo/undoTypes";
import type { SynCloudOSStatechartInspection } from "../Statechart/statechartTypes";
import type { SynCloudOSRouteDiagnostics, SynCloudOSRouteExplanation, SynCloudOSRouteHistoryRecord } from "../RouteManager/routeTypes";
import type { SynCloudOSServiceExplanation, SynCloudOSServiceHealthReport } from "../ServiceRegistry/serviceTypes";
import type { CapturedSynCloudOSError } from "../ErrorManager/errorTypes";
import type { UserNotificationDiagnostic } from "../NotificationCenter/notificationDeliveryTypes";
import type { WindowRecord } from "../Windows/windowTypes";
import { createRuntimeConformanceInspectorProducer } from "./conformanceInspectorProducer";
import type {
  ConformanceInspectorAccessibilityFinding,
  ConformanceInspectorAppearanceFact,
  ConformanceInspectorExport,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotOptions,
  ConformanceInspectorSnapshotPort,
} from "./conformanceInspectorTypes";

export type {
  ConformanceInspectorExport,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotOptions,
  ConformanceInspectorSnapshotPort,
} from "./conformanceInspectorTypes";

type RuntimeEvents = SynCloudOSRuntimeEvent[];
type CacheReport = RuntimeCacheStats[];
type CommandReport = CommandInspection;
interface FocusReport {
  readonly generation: number;
  readonly focusedResponderId: string | null;
  readonly scopes: readonly FocusScopeRegistration[];
  readonly restorations: readonly { readonly scopeId: string; readonly responderId: string | null }[];
}
interface KeyBindingReport {
  readonly overrides: readonly { readonly commandId: string; readonly binding: KeyBindingDeclaration | null }[];
  readonly invalidOverrides: readonly { readonly commandId?: string; readonly reason: string }[];
  readonly lastCandidates: readonly KeyBindingCandidateInspection[];
}
type UndoReport = readonly UndoManagerInspection[];

interface InspectorRouteTableEntry {
  readonly appId: string;
  readonly packageName: string;
  readonly route: string;
  readonly normalizedRoute: string;
  readonly canonicalHref: string | null;
  readonly matchMode: "href" | "path";
  readonly routeableInternally: boolean;
  readonly externalRouteCandidate: boolean;
  readonly diagnostics: SynCloudOSRouteDiagnostics;
  readonly visible: boolean;
  readonly type: SynCloudOSAppInfo["type"];
}

export interface InspectorWindowStackIssue {
  readonly code: "NO_FOCUSED_WINDOW" | "FOCUSED_WINDOW_NOT_FRONT";
  readonly message: string;
  readonly windowId?: string;
  readonly appId?: string | null;
}

export interface InspectorWindowStackEntry extends WindowRecord {
  readonly appId: string | null;
  readonly stackIndex: number;
  readonly stackPosition: "front" | "middle" | "back";
}

export interface InspectorWindowStackReport {
  readonly checkedAt: number;
  readonly openWindowCount: number;
  readonly focusedWindowId: string | null;
  readonly frontWindowId: string | null;
  readonly activeAppId: string | null;
  readonly ok: boolean;
  readonly issues: readonly InspectorWindowStackIssue[];
  readonly stack: readonly InspectorWindowStackEntry[];
}

export interface InspectorServiceImpactSummary {
  readonly affectedApps: readonly {
    readonly appId: string;
    readonly packageName: string;
    readonly missing: readonly string[];
  }[];
  readonly unavailableServices: readonly string[];
  readonly degradedServices: readonly string[];
  readonly futureServices: readonly string[];
  readonly missingRequiredServices: readonly string[];
  readonly summary: string;
}

export interface InspectorRuntimeReport {
  readonly runtimeId: string;
  readonly generatedAt: number;
  readonly version: string;
  readonly snapshot: RuntimeSnapshot;
  readonly caches: CacheReport;
  readonly userNotifications: readonly UserNotificationDiagnostic[];
  readonly commands: CommandReport;
  readonly responders: ResponderGraphInspection;
  readonly focus: FocusReport;
  readonly keyBindings: KeyBindingReport;
  readonly undo: UndoReport;
  readonly boot: SynCloudOSBootReport | null;
  readonly routing: {
    readonly currentPath: string;
    readonly browserPath: string;
    readonly currentExplanation: SynCloudOSRouteExplanation;
    readonly table: readonly InspectorRouteTableEntry[];
    readonly history: readonly SynCloudOSRouteHistoryRecord[];
  };
  readonly services: SynCloudOSServiceHealthReport & {
    readonly dependencyGraph: Record<string, string[]>;
    readonly impactSummary: InspectorServiceImpactSummary;
    readonly report: {
      readonly health: SynCloudOSServiceHealthReport["health"];
      readonly serviceCount: number;
    };
  };
  readonly windows: InspectorWindowStackReport;
  readonly apps: {
    readonly registered: readonly string[];
    readonly display: readonly string[];
    readonly hidden: readonly string[];
    readonly lifecycle: RuntimeSnapshot["lifecycle"];
    readonly managers: RuntimeSnapshot["managers"];
    readonly registrationHistory: readonly SynCloudOSAppRegistrationHistoryRecord[];
  };
  readonly launch: {
    readonly queue: SynCloudOSLaunchQueueSnapshot;
    readonly active: SynCloudOSLaunchQueueSnapshot["active"];
    readonly queued: readonly SynCloudOSLaunchQueueSnapshot["queued"][number][];
    readonly deferred: readonly SynCloudOSLaunchQueueSnapshot["deferred"][number][];
    readonly history: readonly SynCloudOSLaunchHistoryRecord[];
    readonly report: {
      readonly active: SynCloudOSLaunchQueueSnapshot["active"];
      readonly queuedCount: number;
      readonly deferredCount: number;
      readonly historyCount: number;
    };
  };
  readonly policyKit: {
    readonly accessMode: string | null;
    readonly accessReport: SynCloudOSPolicyAuditReport;
    readonly auditLog: SynCloudOSPolicyDecision[];
    readonly report: {
      readonly audit: SynCloudOSPolicyAuditReport;
      readonly roleCapabilities: readonly SynCloudOSRoleCapabilityReportItem[];
      readonly capabilityMatrix: SynCloudOSCapabilityMatrix;
    };
    readonly summary: {
      readonly auditCount: number;
      readonly allowedCount: number;
      readonly deniedCount: number;
      readonly lastDecision: SynCloudOSPolicyDecision | null;
      readonly recentDenied: readonly SynCloudOSPolicyDecision[];
    };
  };
  readonly statechart: {
    readonly currentState: string;
    readonly previousState: string | null;
    readonly history: RuntimeSnapshot["statechart"]["history"];
    readonly inspectedState: string;
    readonly activeDefinition: SynCloudOSStatechartInspection["activeDefinition"];
    readonly allowedTransitions: SynCloudOSStatechartInspection["allowedTransitions"];
    readonly definitions: SynCloudOSStatechartInspection["definitions"];
    readonly inspection: SynCloudOSStatechartInspection;
  };
  readonly application: RuntimeSnapshot["application"];
  readonly webspring: RuntimeSnapshot["webspring"];
  readonly responsive: RuntimeSnapshot["responsive"];
  readonly loginServices: RuntimeSnapshot["loginServices"];
  readonly errors: RuntimeSnapshot["errors"];
  readonly errorReport: {
    readonly latest: CapturedSynCloudOSError | null;
    readonly history: readonly CapturedSynCloudOSError[];
    readonly latestTechnicalReport: string;
  };
  readonly notifications: RuntimeSnapshot["notifications"];
  readonly events: RuntimeEvents;
  readonly transactions: readonly RuntimeTransactionRecord[];
}

export interface InspectorMemoryReport {
  readonly capturedAt: number;
  /** Framework-estimated residency by kind/owner/state (runtime.resources). */
  readonly framework: RuntimeResourceSnapshot;
  readonly jobs: HeavyJobAdmissionSnapshot;
  /** The adaptive policy's tier and the capacity it applied. */
  readonly performance: RuntimePerformanceSnapshot;
  readonly caches: readonly RuntimeCacheStats[];
  /** Browser-measured values, or null when the host exposes none. */
  readonly host: RuntimeMemorySample | null;
  readonly interpretation: string;
}

export interface SynCloudOSInspectorService extends RuntimeOwnedService {
  readonly runtimeId: SynCloudOSRuntime["runtimeId"];
  getSnapshot(): RuntimeSnapshot;
  getBootReport(): SynCloudOSBootReport | null;
  explainRoute(pathname: string): SynCloudOSRouteExplanation;
  getRuntimeReport(): InspectorRuntimeReport;
  /** Framework resource estimates next to host-measured memory, kept apart. */
  getMemoryReport(): Promise<InspectorMemoryReport>;
  getRouteHistory(limit?: number): SynCloudOSRouteHistoryRecord[];
  getServiceHealth(requiredServices?: string[]): SynCloudOSServiceHealthReport;
  explainService(serviceId: string): SynCloudOSServiceExplanation;
  inspectWindowStack(): InspectorWindowStackReport;
  repairWindowFocus(): InspectorWindowStackReport;
  getStatechartReport(): InspectorRuntimeReport["statechart"];
  getConformanceSnapshot(options?: ConformanceInspectorSnapshotOptions): ConformanceInspectorSnapshot;
  refreshConformanceSnapshot(options?: ConformanceInspectorSnapshotOptions): Promise<ConformanceInspectorSnapshot>;
  exportConformanceSnapshot(snapshot: ConformanceInspectorSnapshot): ConformanceInspectorExport;
  getConformanceAppearanceFacts(): readonly ConformanceInspectorAppearanceFact[];
  registerConformanceAppearanceFact(fact: ConformanceInspectorAppearanceFact): () => void;
  getConformanceAccessibilityFindings(): readonly ConformanceInspectorAccessibilityFinding[];
  registerConformanceAccessibilityFinding(finding: ConformanceInspectorAccessibilityFinding): () => void;
}

function assertCategory(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.:+-]{1,64}$/u.test(value)) {
    throw new TypeError(`${label} must be a bounded category label.`);
  }
  return value;
}


export function createInspector(getRuntime: () => SynCloudOSRuntime): SynCloudOSInspectorService {
  let conformanceProducer: ConformanceInspectorSnapshotPort | null = null;
  const appearanceFacts = new Map<string, Map<number, ConformanceInspectorAppearanceFact>>();
  const accessibilityFindings = new Map<string, Map<number, ConformanceInspectorAccessibilityFinding>>();
  let evidenceSequence = 0;

  const resolveRuntime = (): SynCloudOSRuntime => {
    const runtime = getRuntime();
    if (!runtime) throw new Error("SynCloudOS inspector runtime is not initialised.");
    return runtime;
  };
  const conformance = (): ConformanceInspectorSnapshotPort => {
    if (conformanceProducer) return conformanceProducer;
    conformanceProducer = createRuntimeConformanceInspectorProducer(resolveRuntime());
    return conformanceProducer;
  };
  const inspectWindowStack = (): InspectorWindowStackReport => {
    const runtime = resolveRuntime();
    const managerSnapshot = runtime.windows.snapshot();
    const controllers = runtime.windows.list();
    const stack = controllers.map((controller, index) => ({
      ...controller.record,
      appId: controller.record.applicationId,
      stackIndex: index,
      stackPosition: index === controllers.length - 1 ? "front" as const : index === 0 ? "back" as const : "middle" as const,
    }));
    const focused = managerSnapshot.keyWindowControllerId
      ? stack.find(({ id }) => id === managerSnapshot.keyWindowControllerId) ?? null
      : null;
    const front = stack.at(-1) ?? null;
    const issues: InspectorWindowStackIssue[] = [];
    if (stack.length > 0 && !focused) {
      issues.push({ code: "NO_FOCUSED_WINDOW", message: "Open windows exist, but none are key." });
    }
    if (front && focused && focused.id !== front.id) {
      issues.push({
        code: "FOCUSED_WINDOW_NOT_FRONT",
        message: "The key window is not the front-most window by z-index.",
        windowId: focused.id,
        appId: focused.appId,
      });
    }
    return {
      checkedAt: runtime.environment.now(),
      openWindowCount: stack.length,
      focusedWindowId: focused?.id ?? null,
      frontWindowId: front?.id ?? null,
      activeAppId: focused?.appId ?? null,
      ok: issues.length === 0,
      issues,
      stack,
    };
  };
  const getRuntimeReport = (): InspectorRuntimeReport => {
    const runtime = resolveRuntime();
    const snapshot = runtime.store.cloneSnapshot();
    const registeredApps = runtime.apps.getAllApps();
    const displayApps = runtime.apps.getDisplayApps();
    const serviceHealth = runtime.services.getHealthReport();
    const affectedApps = serviceHealth.appDependencies
      .filter((app) => !app.ok)
      .map((app) => ({ appId: app.appId, packageName: app.packageName, missing: app.missing }));
    const missingRequiredServices = Array.from(new Set(affectedApps.flatMap((app) => app.missing)));
    const launchInspection = runtime.launchServices.inspect();
    const launchHistory = runtime.launchServices.getHistory(80);
    const auditLog = runtime.policy.getAuditLog(80);
    const auditReport = runtime.policy.getAuditReport(80);
    const statechartInspection = runtime.statechart.inspect();
    const errorHistory = runtime.errors.getHistory();
    const latestError = runtime.errors.getLatest();
    const routePath = snapshot.application.routePath || "/";
    const serviceImpact: InspectorServiceImpactSummary = {
      affectedApps,
      unavailableServices: serviceHealth.unavailable,
      degradedServices: serviceHealth.degraded,
      futureServices: serviceHealth.future,
      missingRequiredServices,
      summary: affectedApps.length > 0
        ? `${affectedApps.length} app(s) are blocked by service availability.`
        : "No service impact detected for registered apps.",
    };
    return {
      runtimeId: String(runtime.runtimeId),
      generatedAt: runtime.environment.now(),
      version: Config.version,
      snapshot,
      caches: runtime.caches.inspect(),
      userNotifications: runtime.notifications.getDiagnostics?.() ?? [],
      commands: runtime.commands.inspect(),
      responders: runtime.responders.inspect(),
      focus: runtime.focus.inspect(),
      keyBindings: runtime.keyBindings.inspect(),
      undo: runtime.undo.inspect(),
      boot: runtime.bootManager.getLastBootReport(),
      routing: {
        currentPath: routePath,
        browserPath: runtime.environment.browser.getLocation().pathname,
        currentExplanation: runtime.routes.explainRoute(routePath),
        table: runtime.routes.getRouteTable(),
        history: runtime.routes.getHistory(80),
      },
      services: {
        ...serviceHealth,
        dependencyGraph: runtime.services.getDependencyGraph(),
        impactSummary: serviceImpact,
        report: {
          health: serviceHealth.health,
          serviceCount: serviceHealth.serviceCount,
        },
      },
      windows: inspectWindowStack(),
      apps: {
        registered: registeredApps.map((app) => app.packageName),
        display: displayApps.map((app) => app.packageName),
        hidden: registeredApps.filter((app) => !app.webspring.visible).map((app) => app.packageName),
        lifecycle: snapshot.lifecycle,
        managers: snapshot.managers,
        registrationHistory: runtime.apps.getRegistrationHistory(80),
      },
      launch: {
        queue: {
          active: launchInspection.active,
          queued: launchInspection.queued,
          deferred: launchInspection.deferred,
        },
        active: launchInspection.active,
        queued: launchInspection.queued,
        deferred: launchInspection.deferred,
        history: launchHistory,
        report: {
          active: launchInspection.active,
          queuedCount: launchInspection.queued.length,
          deferredCount: launchInspection.deferred.length,
          historyCount: launchHistory.length,
        },
      },
      policyKit: {
        accessMode: runtime.policy.getAccessMode(),
        accessReport: auditReport,
        auditLog,
        report: {
          audit: auditReport,
          roleCapabilities: runtime.policy.getRoleCapabilityReport(),
          capabilityMatrix: runtime.policy.getCapabilityMatrix(),
        },
        summary: {
          auditCount: auditLog.length,
          allowedCount: auditLog.filter((decision) => decision.allowed).length,
          deniedCount: auditLog.filter((decision) => !decision.allowed).length,
          lastDecision: auditLog.at(-1) ?? null,
          recentDenied: auditLog.filter((decision) => !decision.allowed).slice(-12),
        },
      },
      statechart: {
        currentState: runtime.statechart.getCurrentState(),
        previousState: runtime.statechart.getPreviousState(),
        history: runtime.statechart.getHistory(),
        inspectedState: statechartInspection.inspectedState,
        activeDefinition: statechartInspection.activeDefinition,
        allowedTransitions: statechartInspection.allowedTransitions,
        definitions: runtime.statechart.getStateDefinitions(),
        inspection: statechartInspection,
      },
      application: snapshot.application,
      webspring: snapshot.webspring,
      responsive: snapshot.responsive,
      loginServices: snapshot.loginServices,
      errors: snapshot.errors,
      errorReport: {
        latest: latestError,
        history: errorHistory,
        latestTechnicalReport: runtime.errors.toTechnicalReport(latestError),
      },
      notifications: snapshot.notifications,
      events: runtime.events.getHistory(120),
      transactions: runtime.diagnostics.transactions.entries(),
    };
  };

  const inspector: SynCloudOSInspectorService = Object.freeze({
    get runtimeId() {
      return resolveRuntime().runtimeId;
    },
    getSnapshot() {
      return resolveRuntime().store.cloneSnapshot();
    },
    getBootReport() {
      return resolveRuntime().bootManager.getLastBootReport();
    },
    explainRoute(pathname: string) {
      return resolveRuntime().routes.explainRoute(pathname);
    },
    getRuntimeReport,
    async getMemoryReport(): Promise<InspectorMemoryReport> {
      const runtime = resolveRuntime();
      const host = runtime.environment.memory ? await runtime.environment.memory.sample() : null;
      return Object.freeze({
        capturedAt: runtime.environment.now(),
        framework: runtime.resources.snapshot(),
        jobs: runtime.jobs.snapshot(),
        performance: runtime.performancePolicy.snapshot(),
        caches: Object.freeze(runtime.caches.inspect()),
        host,
        interpretation: "Framework figures are estimates of backings owned by runtime participants (caches, leases, attachments, job reservations, diagnostics). JS heap, user-agent-specific and DOM figures are browser measurements; process footprint also includes code, GPU, media and browser overhead the framework cannot attribute.",
      });
    },
    getRouteHistory(limit?: number) {
      return resolveRuntime().routes.getHistory(limit);
    },
    getServiceHealth(requiredServices: string[] = []) {
      return resolveRuntime().services.getHealthReport(requiredServices);
    },
    explainService(serviceId: string) {
      return resolveRuntime().services.explainService(serviceId);
    },
    inspectWindowStack,
    repairWindowFocus() {
      const runtime = resolveRuntime();
      const before = inspectWindowStack();
      if (before.ok) return before;
      const managerSnapshot = runtime.windows.snapshot();
      const blocked = new Set(managerSnapshot.blockedWindowControllerIds);
      const front = [...runtime.windows.list()].reverse().find(({ record }) => (
        record.state === "open" && !blocked.has(record.id)
      ));
      if (!front) return before;
      runtime.windows.makeKey(front.id);
      const after = inspectWindowStack();
      runtime.events.publish("window.stack.repaired", { before, after }, front.record.applicationId ?? undefined);
      return after;
    },
    getStatechartReport() {
      const runtime = resolveRuntime();
      const inspection = runtime.statechart.inspect();
      return {
        currentState: runtime.statechart.getCurrentState(),
        previousState: runtime.statechart.getPreviousState(),
        history: runtime.statechart.getHistory(),
        inspectedState: inspection.inspectedState,
        activeDefinition: inspection.activeDefinition,
        allowedTransitions: inspection.allowedTransitions,
        definitions: runtime.statechart.getStateDefinitions(),
        inspection,
      };
    },
    getConformanceSnapshot(options: ConformanceInspectorSnapshotOptions = {}) {
      return conformance().getConformanceSnapshot(options);
    },
    refreshConformanceSnapshot(options: ConformanceInspectorSnapshotOptions = {}) {
      return conformance().refreshConformanceSnapshot(options);
    },
    exportConformanceSnapshot(snapshot: ConformanceInspectorSnapshot) {
      return conformance().exportConformanceSnapshot(snapshot);
    },
    getConformanceAppearanceFacts() {
      resolveRuntime();
      return Object.freeze([...appearanceFacts.entries()]
        .map(([slot, registrations]) => {
          let status: ConformanceInspectorAppearanceFact["status"] = "covered";
          for (const fact of registrations.values()) {
            if (fact.status === "provenance-violation") status = "provenance-violation";
            else if (fact.status === "unresolved" && status === "covered") status = "unresolved";
          }
          return Object.freeze({ slot, status });
        })
        .sort((left, right) => left.slot.localeCompare(right.slot)));
    },
    registerConformanceAppearanceFact(fact: ConformanceInspectorAppearanceFact) {
      resolveRuntime();
      const slot = assertCategory(fact.slot, "Conformance appearance slot");
      const value = Object.freeze({ slot, status: fact.status });
      const registrationId = ++evidenceSequence;
      const registrations = appearanceFacts.get(slot) ?? new Map<number, ConformanceInspectorAppearanceFact>();
      registrations.set(registrationId, value);
      appearanceFacts.set(slot, registrations);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = appearanceFacts.get(slot);
        if (!current?.delete(registrationId)) return;
        if (current.size === 0) appearanceFacts.delete(slot);
      };
    },
    getConformanceAccessibilityFindings() {
      resolveRuntime();
      return Object.freeze([...accessibilityFindings.entries()]
        .map(([code, registrations]) => {
          let severity: ConformanceInspectorAccessibilityFinding["severity"] = "info";
          for (const finding of registrations.values()) {
            if (finding.severity === "error") severity = "error";
            else if (finding.severity === "warning" && severity === "info") severity = "warning";
          }
          return Object.freeze({ code, severity });
        })
        .sort((left, right) => left.code.localeCompare(right.code)));
    },
    registerConformanceAccessibilityFinding(finding: ConformanceInspectorAccessibilityFinding) {
      resolveRuntime();
      const code = assertCategory(finding.code, "Conformance accessibility finding code");
      const value = Object.freeze({ code, severity: finding.severity });
      const registrationId = ++evidenceSequence;
      const registrations = accessibilityFindings.get(code) ?? new Map<number, ConformanceInspectorAccessibilityFinding>();
      registrations.set(registrationId, value);
      accessibilityFindings.set(code, registrations);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = accessibilityFindings.get(code);
        if (!current?.delete(registrationId)) return;
        if (current.size === 0) accessibilityFindings.delete(code);
      };
    },
    dispose() {
      resolveRuntime();
      appearanceFacts.clear();
      accessibilityFindings.clear();
      conformanceProducer = null;
    },
  });
  return inspector;
}
