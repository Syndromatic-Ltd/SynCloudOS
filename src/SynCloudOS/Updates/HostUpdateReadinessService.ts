import { observeOwnedWork } from "../Operations/OwnedWorkObservations";
import { observeDocumentStorePersistence } from "../DocumentStore/PersistenceDocumentStore";
import type { SynCloudOSRuntime } from '../Runtime/runtimeInstanceTypes';
import { bindRuntimeReadinessProjection } from '../Runtime/RuntimeStore';
import { UpdateReadinessProjection } from './UpdateReadinessProjection';
import { documentUpdateReadiness, type UpdateReadinessAuthority } from './updateReadiness';
import { captureHostUpdateReadinessOptions, hostReadinessCoverage, initialHostUpdateReadinessSnapshot, type HostReadinessCounts, type HostReadinessInspection, type HostUpdateReadinessOptions, type HostUpdateReadinessSnapshot } from './hostReadinessTypes';
import type { UpdateReadinessObservation } from './observeUpdateReadiness';

const reasons = ['no-clients', 'membership-changed', 'unresponsive-client', 'invalid-evidence', 'incompatible-build', 'client-blocked', 'client-unknown', 'evidence-changed', 'owner-ended', 'inspection-failed'];
function observation(value: UpdateReadinessObservation): UpdateReadinessObservation {
  if (!value || Object.keys(value).sort().join(',') !== 'activationAuthorized,participantCount,reasons,status' || value.activationAuthorized !== false || !['ready-at-observation', 'defer'].includes(value.status) || !Number.isSafeInteger(value.participantCount) || value.participantCount < 0 || value.participantCount > 128 || !Array.isArray(value.reasons) || value.reasons.some(reason => !reasons.includes(reason)) || new Set(value.reasons).size !== value.reasons.length || (value.status === 'ready-at-observation' ? value.reasons.length !== 0 || value.participantCount === 0 : value.reasons.length === 0)) throw new TypeError('Invalid participant evidence.');
  return Object.freeze({ ...value, reasons: Object.freeze([...value.reasons]) });
}

/** Derived host observations. Existing service owners retain all mutation authority. */
export class HostUpdateReadinessService {
  readonly #runtime: SynCloudOSRuntime;
  readonly #options: HostUpdateReadinessOptions;
  readonly #projection: UpdateReadinessProjection;
  readonly #releases: (() => void)[] = [];
  readonly #listeners = new Set<() => void>();
  readonly #inventoryListeners = new Set<() => void>();
  readonly #taskListeners = new Set<() => void>();
  readonly #documents = new Map<object, UpdateReadinessAuthority>();
  #snapshot = initialHostUpdateReadinessSnapshot();
  #inspection: HostReadinessInspection;
  #revision = 0;
  #disposed = false;
  #publishing = false;
  #projectingStore = false;
  #storeProjectionAttached = false;
  #pendingStoreNotification = false;
  #again = false;
  #storeFingerprint = '';
  #flight: { controller: AbortController; generation: number } | null = null;
  #expiry: unknown = null;
  readonly #ended = () => this.dispose();

  constructor(runtime: SynCloudOSRuntime, options: HostUpdateReadinessOptions = {}) {
    this.#runtime = runtime; this.#options = captureHostUpdateReadinessOptions(options); options = this.#options;
    this.#inspection = Object.freeze({ ...this.#snapshot.inspection, available: !!options.inspectParticipants, reason: options.inspectParticipants ? null : 'not-configured' });
    const build = options.hostBuild ?? 'unconfigured';
    this.#reconcileDocuments();
    const activity = runtime.documents.activity;
    const workOwners = [runtime.operations, runtime.lifecycle].map(owner => observeOwnedWork(owner));
    const workAuthorities: UpdateReadinessAuthority[] = workOwners.flatMap(source => source ? [{
      domain: 'tasks' as const,
      read: () => { const facts = source.getSnapshot(); return { known: !this.#disposed && !facts.ended, revision: facts.revision, blockers: facts.pending ? ['owner-busy' as const] : [] }; },
      subscribe: (listener: () => void) => source.subscribe(listener),
    }] : []);
    const persistence = observeDocumentStorePersistence(runtime.documentStore);
    const admissions: UpdateReadinessAuthority = { domain: 'documents', read: () => ({ known: !this.#disposed, revision: activity.getSnapshot().revision, blockers: activity.getSnapshot().admissions ? ['owner-busy'] : [] }), subscribe: listener => activity.subscribe(listener) };
    const recovery: UpdateReadinessAuthority = { domain: 'tasks', read: () => ({ known: !this.#disposed, revision: activity.getSnapshot().revision, blockers: activity.getSnapshot().recovery || activity.getSnapshot().cleanup ? ['recovery-write'] : [] }), subscribe: listener => activity.subscribe(listener) };
    const editing: UpdateReadinessAuthority = { domain: 'editing', read: () => { const current = activity.getSnapshot(); return { known: !this.#disposed, revision: current.revision, blockers: current.editingSettlements || current.editingCallbacks ? ['owner-busy'] : [] }; }, subscribe: listener => activity.subscribe(listener) };
    const persistenceWork: UpdateReadinessAuthority | null = persistence ? {
      domain: 'tasks',
      read: () => ({ known: !this.#disposed && !persistence.getSnapshot().ended, revision: persistence.getSnapshot().revision, blockers: persistence.getSnapshot().pending ? ['owner-busy'] : [] }),
      subscribe: listener => persistence.subscribe(listener),
    } : null;
    const tasks: UpdateReadinessAuthority = { domain: 'tasks', read: () => ({ known: !this.#disposed, revision: this.#revision, blockers: !runtime.store.getSnapshot().booted || runtime.disposalState !== 'running' || runtime.operations.inspectPending().length || runtime.jobs.snapshot().active || runtime.jobs.snapshot().queued ? ['owner-busy'] : [] }), subscribe: listener => { this.#taskListeners.add(listener); return () => { this.#taskListeners.delete(listener); }; } };
    this.#projection = new UpdateReadinessProjection({ clientInstance: ('host-' + runtime.environment.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '_')).slice(0, 96).padEnd(8, '_'), hostBuild: build, inventory: {
      // Controller-owned document admissions are observed; the other domains
      // still have explicit unresolved owner coverage.
      read: () => ({ covered: ['documents'], authorities: [...this.#documents.values(), admissions, recovery, editing, ...(persistenceWork ? [persistenceWork] : []), tasks, ...workAuthorities, runtime.nativeActivity] }),
      subscribe: listener => { this.#inventoryListeners.add(listener); return () => { this.#inventoryListeners.delete(listener); }; },
    } });
    this.#releases.push(this.#projection.subscribe(() => this.#publish()));
    this.#releases.push(runtime.documents.subscribe(() => { this.#reconcileDocuments(); for (const listener of [...this.#inventoryListeners]) listener(); }));
    const changed = () => { if (this.#disposed) return; this.#revision++; for (const listener of [...this.#taskListeners]) listener(); };
    const distinct = (read: () => string) => { let previous = read(); return () => { const next = read(); if (next !== previous) { previous = next; changed(); } }; };
    // Phase notifications and geometry animation frames are not membership
    // changes. Avoid creating a store publication for every such sample.
    this.#releases.push(
      runtime.operations.subscribe(distinct(() => JSON.stringify(runtime.operations.inspectPending().map(record => record.operationId).sort()))),
      runtime.jobs.subscribe(distinct(() => { const snapshot = runtime.jobs.snapshot(); return JSON.stringify([snapshot.active, snapshot.queued, snapshot.admitted]); })),
      runtime.windows.subscribe(distinct(() => JSON.stringify([...runtime.windows.snapshot().windowControllerIds].sort()))),
      runtime.identity.session.subscribe(changed),
    );
    this.#storeFingerprint = this.#fingerprint();
    const storeFactsChanged = () => {
      if (this.#disposed) return;
      const next = this.#fingerprint();
      if (next !== this.#storeFingerprint) { this.#storeFingerprint = next; changed(); }
      else if (!this.#publishing && JSON.stringify(runtime.store.getSnapshot().updateReadiness) !== JSON.stringify(this.#snapshot)) this.#publish();
    };
    const releaseProjection = bindRuntimeReadinessProjection(runtime.store, () => {
      const previous = this.#projectingStore;
      this.#projectingStore = true;
      try { storeFactsChanged(); return this.#snapshot; }
      finally { this.#projectingStore = previous; }
    }, () => {
      if (!this.#disposed && this.#pendingStoreNotification) { this.#pendingStoreNotification = false; this.#notify(); }
    });
    this.#storeProjectionAttached = !!releaseProjection;
    if (releaseProjection) this.#releases.push(releaseProjection);
    else this.#releases.push(runtime.store.subscribe(storeFactsChanged));
    runtime.signal.addEventListener('abort', this.#ended, { once: true });
    this.#publish(); if (runtime.signal.aborted) this.dispose();
  }
  getSnapshot = (): HostUpdateReadinessSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { if (this.#disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  inspect(): HostUpdateReadinessSnapshot {
    if (!this.#disposed) {
      const fingerprint = this.#fingerprint();
      if (fingerprint !== this.#storeFingerprint) { this.#storeFingerprint = fingerprint; this.#revision++; for (const listener of [...this.#taskListeners]) listener(); }
      this.#publish();
    }
    return this.#snapshot;
  }
  async inspectParticipants(): Promise<HostUpdateReadinessSnapshot> {
    if (this.#disposed || !this.#options.inspectParticipants) return this.inspect();
    this.#cancelFlight(); this.#clearExpiry();
    const generation = this.inspect().client.generation;
    const flight = { controller: new AbortController(), generation }; this.#flight = flight;
    this.#inspection = Object.freeze({ available: true, state: 'checking', observedAt: null, sourceGeneration: generation, result: null, reason: null }); this.#publish();
    const timer = this.#runtime.environment.setTimeout(() => flight.controller.abort(new DOMException('Observation expired.', 'TimeoutError')), this.#options.inspectionTimeoutMs ?? 1500);
    try {
      const result = await new Promise<UpdateReadinessObservation>((resolve, reject) => {
        const abort = () => { flight.controller.signal.removeEventListener('abort', abort); reject(flight.controller.signal.reason); };
        flight.controller.signal.addEventListener('abort', abort, { once: true });
        if (flight.controller.signal.aborted) { abort(); return; }
        let pending: Promise<UpdateReadinessObservation>;
        try { pending = this.#options.inspectParticipants!({ signal: flight.controller.signal, hostBuild: this.#snapshot.client.hostBuild, observerInstance: this.#snapshot.client.clientInstance }); }
        catch (error) { flight.controller.signal.removeEventListener('abort', abort); reject(error); return; }
        pending.then(value => { flight.controller.signal.removeEventListener('abort', abort); resolve(value); }, error => { flight.controller.signal.removeEventListener('abort', abort); reject(error); });
      });
      if (this.#disposed || this.#flight !== flight) return this.#snapshot;
      if (this.inspect().client.generation !== generation) { this.#stale('work-changed'); return this.#snapshot; }
      this.#inspection = Object.freeze({ available: true, state: 'observed', observedAt: this.#runtime.environment.now(), sourceGeneration: generation, result: observation(result), reason: null });
      this.#expiry = this.#runtime.environment.setTimeout(() => { this.#expiry = null; if (!this.#disposed) { this.#stale('expired'); this.#publish(); } }, this.#options.observationLifetimeMs ?? 3000);
    } catch {
      if (!this.#disposed && this.#flight === flight && this.#inspection.state === 'checking') this.#inspection = Object.freeze({ ...this.#inspection, state: 'failed', reason: 'inspection-failed' });
    } finally {
      this.#runtime.environment.clearTimeout(timer);
      if (this.#flight === flight) { this.#flight = null; flight.controller.abort(); }
      if (!this.#disposed) this.#publish();
    }
    return this.#snapshot;
  }
  dispose(): void {
    if (this.#disposed) return; this.#disposed = true; this.#pendingStoreNotification = false;
    this.#cancelFlight(); this.#clearExpiry(); this.#projection.dispose();
    this.#runtime.signal.removeEventListener('abort', this.#ended);
    for (const release of this.#releases.splice(0).reverse()) { try { release(); } catch { /* Release every owner. */ } }
    this.#documents.clear(); this.#inventoryListeners.clear(); this.#taskListeners.clear();
    this.#snapshot = Object.freeze({ ...this.#snapshot, client: this.#projection.getSnapshot(), ended: true, inspection: Object.freeze({ ...this.#inspection, state: 'stale', reason: 'owner-ended' }) });
    if (this.#storeProjectionAttached) { try { this.#runtime.store.mutate(draft => { draft.updateReadiness = this.#snapshot; }); } catch { /* Store may already have ended. */ } }
    this.#notify(); this.#listeners.clear();
  }
  #reconcileDocuments(): void {
    const documents = this.#runtime.documents.openDocuments;
    for (const document of this.#documents.keys()) if (!documents.includes(document as never)) this.#documents.delete(document);
    for (const document of documents) if (!this.#documents.has(document)) this.#documents.set(document, documentUpdateReadiness(document));
  }
  #fingerprint(): string {
    const state = this.#runtime.store.getSnapshot();
    // Session identity is compared locally only; no account identifier leaves
    // this private change detector or appears in readiness/store projections.
    return JSON.stringify([state.booted, this.#runtime.statechart.getCurrentState(), this.#runtime.disposalState, state.loginServices.isAuthorised, state.loginServices.sessionId, state.loginServices.synId]);
  }
  #counts(): HostReadinessCounts {
    const documents = this.#runtime.documents.openDocuments, jobs = this.#runtime.jobs.snapshot();
    return Object.freeze({ operationWork: observeOwnedWork(this.#runtime.operations)?.getSnapshot().pending ?? 0, lifecycleWork: observeOwnedWork(this.#runtime.lifecycle)?.getSnapshot().pending ?? 0, documentEditingParticipants: this.#runtime.documents.activity.getSnapshot().editingParticipants, documentEditingWork: this.#runtime.documents.activity.getSnapshot().editingSettlements + this.#runtime.documents.activity.getSnapshot().editingCallbacks, persistenceMutations: observeDocumentStorePersistence(this.#runtime.documentStore)?.getSnapshot().pending ?? 0, documents: documents.length, dirtyDocuments: documents.filter(document => document.hasUnsavedChanges).length, savingDocuments: documents.filter(document => document.state === 'saving').length, conflictedDocuments: documents.filter(document => document.state === 'conflicted').length, windows: this.#runtime.windows.snapshot().windowControllerIds.length, operations: this.#runtime.operations.inspectPending().length, activeJobs: jobs.active, queuedJobs: jobs.queued, nativeOperations: this.#runtime.nativeActivity.pendingOperationCount, documentAdmissions: this.#runtime.documents.activity.getSnapshot().admissions, documentRecovery: this.#runtime.documents.activity.getSnapshot().recovery, documentCleanup: this.#runtime.documents.activity.getSnapshot().cleanup });
  }
  #publish(): void {
    if (this.#disposed) return;
    if (this.#publishing) { this.#again = true; return; }
    this.#publishing = true;
    try {
      const client = this.#projection.inspect();
      if (this.#inspection.sourceGeneration !== null && this.#inspection.sourceGeneration !== client.generation && ['checking', 'observed'].includes(this.#inspection.state)) this.#stale('work-changed');
      const observedCoverage = Object.freeze(hostReadinessCoverage.map(row => row.domain === 'documents' ? Object.freeze({ ...row, status: 'observed' as const, gaps: Object.freeze([]) }) : row.domain === 'tasks' ? Object.freeze({ ...row, gaps: Object.freeze(row.gaps.filter(gap => gap !== 'recovery-cleanup' && !(gap === 'underlying-operation-work' && observeOwnedWork(this.#runtime.operations)))) }) : row));
      let coverage = this.#runtime.environment.createFileSystemAccessPanelPort ? observedCoverage : Object.freeze(observedCoverage.map(row => row.domain === 'native' ? Object.freeze({ ...row, gaps: Object.freeze([...row.gaps, 'native-picker-instrumentation' as const]) }) : row));
      if (!this.#storeProjectionAttached) coverage = Object.freeze(coverage.map(row => row.domain === 'tasks' ? Object.freeze({ ...row, gaps: Object.freeze([...row.gaps, 'runtime-store-publication' as const]) }) : row));
      const next: HostUpdateReadinessSnapshot = Object.freeze({ client, decision: 'defer', activationAuthorized: false, ended: false, coverage, counts: this.#counts(), compatibility: Object.freeze({ status: this.#options.compatibilityRestricted ? 'restricted' : 'not-configured', reasons: Object.freeze(this.#options.compatibilityRestricted ? ['host-policy-restricted'] as const : ['target-build-unverified'] as const) }), inspection: this.#inspection });
      if (JSON.stringify(next) !== JSON.stringify(this.#snapshot) || this.#storeProjectionAttached && JSON.stringify(this.#runtime.store.getSnapshot().updateReadiness) !== JSON.stringify(next)) {
        this.#snapshot = next;
        if (this.#storeProjectionAttached && this.#projectingStore) this.#pendingStoreNotification = true;
        else { if (this.#storeProjectionAttached) this.#runtime.store.mutate(draft => { draft.updateReadiness = next; }); this.#notify(); }
      }
    } finally { this.#publishing = false; }
    if (this.#again) { this.#again = false; this.#publish(); }
  }
  #stale(reason: 'work-changed' | 'expired'): void { this.#clearExpiry(); this.#cancelFlight(); this.#inspection = Object.freeze({ ...this.#inspection, state: 'stale', reason }); }
  #clearExpiry(): void { if (this.#expiry !== null) this.#runtime.environment.clearTimeout(this.#expiry); this.#expiry = null; }
  #cancelFlight(): void { const flight = this.#flight; this.#flight = null; flight?.controller.abort(); }
  #notify(): void { for (const listener of [...this.#listeners]) { try { listener(); } catch { /* An observer cannot alter service work. */ } } }
}
