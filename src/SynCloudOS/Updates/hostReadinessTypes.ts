import { UPDATE_READINESS_PROTOCOL, type UpdateReadinessDomain, type UpdateReadinessSnapshot } from './updateReadiness';
import type { UpdateReadinessObservation } from './observeUpdateReadiness';

export type HostReadinessGap = 'document-admission' | 'recovery-cleanup' | 'resource-terminal-work' | 'editing-participants' | 'editing-owner-census' | 'underlying-operation-work' | 'private-job-admissions' | 'managed-task-owners' | 'application-lifecycle-owners' | 'command-lifecycle-undo' | 'persistence-work' | 'service-network-media' | 'native-picker-instrumentation' | 'native-write-permission' | 'clipboard-download';
export interface HostReadinessCoverage { readonly domain: UpdateReadinessDomain; readonly status: 'partial'; readonly gaps: readonly HostReadinessGap[] }
export const hostReadinessCoverage: readonly HostReadinessCoverage[] = Object.freeze([
  Object.freeze({ domain: 'documents' as const, status: 'partial' as const, gaps: Object.freeze(['document-admission'] as const) }),
  Object.freeze({ domain: 'editing' as const, status: 'partial' as const, gaps: Object.freeze(['editing-participants', 'editing-owner-census'] as const) }),
  Object.freeze({ domain: 'tasks' as const, status: 'partial' as const, gaps: Object.freeze(['recovery-cleanup', 'resource-terminal-work', 'underlying-operation-work', 'private-job-admissions', 'managed-task-owners', 'application-lifecycle-owners', 'command-lifecycle-undo', 'persistence-work', 'service-network-media'] as const) }),
  Object.freeze({ domain: 'native' as const, status: 'partial' as const, gaps: Object.freeze(['native-write-permission', 'clipboard-download', 'service-network-media'] as const) }),
]);
export interface HostReadinessCounts {
  readonly documents: number; readonly dirtyDocuments: number; readonly savingDocuments: number; readonly conflictedDocuments: number;
  readonly windows: number; readonly operations: number; readonly activeJobs: number; readonly queuedJobs: number; readonly nativeOperations: number;
}
export interface HostReadinessInspection {
  readonly available: boolean;
  readonly state: 'not-inspected' | 'checking' | 'observed' | 'stale' | 'failed';
  readonly observedAt: number | null;
  readonly sourceGeneration: number | null;
  readonly result: UpdateReadinessObservation | null;
  readonly reason: 'not-configured' | 'work-changed' | 'expired' | 'inspection-failed' | 'owner-ended' | null;
}
export interface HostUpdateReadinessSnapshot {
  readonly client: UpdateReadinessSnapshot;
  readonly decision: 'defer';
  readonly activationAuthorized: false;
  readonly ended: boolean;
  readonly coverage: readonly HostReadinessCoverage[];
  readonly counts: HostReadinessCounts;
  readonly compatibility: { readonly status: 'not-configured' | 'restricted'; readonly reasons: readonly ('target-build-unverified' | 'host-policy-restricted')[] };
  readonly inspection: HostReadinessInspection;
}
export interface HostUpdateReadinessOptions {
  readonly hostBuild?: string;
  readonly compatibilityRestricted?: boolean;
  /** Explicit owned, readonly host transport. No discovery/registration is performed. */
  readonly inspectParticipants?: (context: { readonly signal: AbortSignal; readonly hostBuild: string; readonly observerInstance: string }) => Promise<UpdateReadinessObservation>;
  readonly observationLifetimeMs?: number;
  readonly inspectionTimeoutMs?: number;
}
export function captureHostUpdateReadinessOptions(input: HostUpdateReadinessOptions = {}): Readonly<HostUpdateReadinessOptions> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TypeError('Host readiness options must be a plain record.');
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !['hostBuild', 'compatibilityRestricted', 'inspectParticipants', 'observationLifetimeMs', 'inspectionTimeoutMs'].includes(key)) throw new TypeError('Unknown host readiness option.');
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Host readiness options must be data properties.');
    const value = descriptor.value; if (value === undefined) continue;
    if (key === 'hostBuild' && (typeof value !== 'string' || !/^[a-zA-Z0-9._-]{1,96}$/.test(value))) throw new TypeError('Invalid host readiness build.');
    if (key === 'compatibilityRestricted' && typeof value !== 'boolean' || key === 'inspectParticipants' && typeof value !== 'function') throw new TypeError('Invalid host readiness option.');
    if ((key === 'observationLifetimeMs' || key === 'inspectionTimeoutMs') && (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 10000)) throw new TypeError('Invalid readiness observation duration.');
    output[key] = value;
  }
  return Object.freeze(output) as Readonly<HostUpdateReadinessOptions>;
}
export function initialHostUpdateReadinessSnapshot(): HostUpdateReadinessSnapshot {
  return Object.freeze({ client: Object.freeze({ protocol: UPDATE_READINESS_PROTOCOL, clientInstance: 'unconfigured-host', hostBuild: 'unconfigured', generation: 0, readiness: 'unknown', blockers: Object.freeze(['provider-unavailable'] as const) }), decision: 'defer', activationAuthorized: false, ended: false, coverage: hostReadinessCoverage,
    counts: Object.freeze({ documents: 0, dirtyDocuments: 0, savingDocuments: 0, conflictedDocuments: 0, windows: 0, operations: 0, activeJobs: 0, queuedJobs: 0, nativeOperations: 0 }),
    compatibility: Object.freeze({ status: 'not-configured', reasons: Object.freeze(['target-build-unverified'] as const) }),
    inspection: Object.freeze({ available: false, state: 'not-inspected', observedAt: null, sourceGeneration: null, result: null, reason: 'not-configured' }),
  });
}
