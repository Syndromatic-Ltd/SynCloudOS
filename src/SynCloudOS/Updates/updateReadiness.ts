/** Observations only: none of these facts authorizes activation or reload. */
export const UPDATE_READINESS_PROTOCOL = 'syncloudos.update/1' as const;
export const updateReadinessDomains = ['documents', 'editing', 'tasks', 'native'] as const;
export type UpdateReadinessDomain = typeof updateReadinessDomains[number];
export const updateReadinessBlockers = ['dirty', 'conflict', 'saving', 'synchronizing', 'composition', 'transaction', 'recovery-write', 'native-operation', 'owner-busy', 'provider-unavailable', 'owner-ended'] as const;
export type UpdateReadinessBlocker = typeof updateReadinessBlockers[number];
export interface UpdateReadinessFacts {
  readonly known: boolean;
  readonly blockers: readonly UpdateReadinessBlocker[];
  /** A coarse revision, never a document identifier, title, content or URL. */
  readonly revision?: number;
}
export interface UpdateReadinessAuthority {
  readonly domain: UpdateReadinessDomain;
  readonly signal?: AbortSignal;
  read(): UpdateReadinessFacts;
  subscribe(listener: () => void): () => void;
}
export interface UpdateReadinessInventory {
  /** Explicit host assertion of membership coverage, not inferred from an empty list. */
  read(): { readonly covered: readonly UpdateReadinessDomain[]; readonly authorities: readonly UpdateReadinessAuthority[] } | null;
  subscribe(listener: () => void): () => void;
}
export interface UpdateReadinessSnapshot {
  readonly protocol: typeof UPDATE_READINESS_PROTOCOL;
  /** Random per-host instance, unrelated to an account or document. */
  readonly clientInstance: string;
  readonly hostBuild: string;
  readonly generation: number;
  readonly readiness: 'ready' | 'blocked' | 'unknown';
  readonly blockers: readonly UpdateReadinessBlocker[];
}

/** Structural adapter: the ApplicationDocument remains the sole dirty authority. */
export function documentUpdateReadiness(document: {
  readonly state: string; readonly hasUnsavedChanges: boolean; readonly dirtyRevision: number;
  subscribe(listener: () => void): () => void;
}, signal?: AbortSignal): UpdateReadinessAuthority {
  return Object.freeze({ domain: 'documents' as const, signal, subscribe: (listener: () => void) => document.subscribe(listener), read() {
    const blockers: UpdateReadinessBlocker[] = [];
    if (document.hasUnsavedChanges) blockers.push('dirty');
    if (document.state === 'conflicted') blockers.push('conflict');
    if (document.state === 'saving') blockers.push('saving');
    if (document.state === 'loading' || document.state === 'closing') blockers.push('owner-busy');
    return { known: document.state !== 'closed' && document.state !== 'deleted', blockers, revision: document.dirtyRevision };
  } });
}

/** No composition settlement or canonical text edit is performed. */
export function textSessionUpdateReadiness(session: {
  readonly signal: AbortSignal;
  getSnapshot(): { readonly marked: unknown; readonly disposed: boolean };
  subscribe(listener: () => void): () => void;
}): UpdateReadinessAuthority {
  return Object.freeze({ domain: 'editing' as const, signal: session.signal, subscribe: (listener: () => void) => session.subscribe(listener), read() {
    const snapshot = session.getSnapshot();
    return { known: !snapshot.disposed, blockers: snapshot.marked ? ['composition' as const] : [] };
  } });
}

export function editingControllerUpdateReadiness(controller: {
  readonly isEditing: boolean; readonly isDisposed: boolean;
  subscribe(listener: () => void): () => void;
  onDispose?(listener: () => void): () => void;
}, signal?: AbortSignal): UpdateReadinessAuthority {
  return Object.freeze({ domain: 'editing' as const, signal, subscribe: (listener: () => void) => {
    const release = controller.subscribe(listener), releaseDisposal = controller.onDispose?.(listener);
    return () => { try { release(); } finally { releaseDisposal?.(); } };
  }, read() {
    return { known: !controller.isDisposed, blockers: controller.isEditing ? ['transaction' as const] : [] };
  } });
}

/**
 * Optional host/service instrumentation. Track at the actual native invocation,
 * before any caller-abort race; only the underlying promise releases the lease.
 * It covers only operations explicitly routed through this instance.
 */
export class NativeOperationActivity implements UpdateReadinessAuthority {
  readonly domain = 'native' as const;
  readonly #listeners = new Set<() => void>();
  #pending = 0;
  #revision = 0;
  get pendingOperationCount(): number { return this.#pending; }
  constructor(readonly signal: AbortSignal) {
    signal.addEventListener('abort', () => { this.#emit(); this.#listeners.clear(); }, { once: true });
  }
  read = (): UpdateReadinessFacts => Object.freeze({ known: !this.signal.aborted, blockers: Object.freeze(this.#pending ? ['native-operation' as const] : []), revision: this.#revision });
  subscribe = (listener: () => void): (() => void) => {
    if (this.signal.aborted) return () => {};
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  };
  track<T>(invoke: () => T | PromiseLike<T>): Promise<T> {
    this.signal.throwIfAborted();
    this.#pending++; this.#emit();
    let operation: T | PromiseLike<T>;
    try { this.signal.throwIfAborted(); operation = invoke(); }
    catch (error) { this.#pending--; this.#emit(); throw error; }
    return Promise.resolve(operation).then(value => { this.#pending--; this.#emit(); return value; }, error => { this.#pending--; this.#emit(); throw error; });
  }
  #emit(): void {
    this.#revision++;
    // Observation must never prevent an already admitted native invocation.
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Isolated observer. */ } }
  }
}

/** Strict wire shape: never forward arbitrary authority records. */
export function isUpdateReadinessSnapshot(value: unknown): value is UpdateReadinessSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'blockers,clientInstance,generation,hostBuild,protocol,readiness') return false;
  if (v.protocol !== UPDATE_READINESS_PROTOCOL || typeof v.clientInstance !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(v.clientInstance) || typeof v.hostBuild !== 'string' || !/^[a-zA-Z0-9._-]{1,96}$/.test(v.hostBuild) || !Number.isSafeInteger(v.generation) || (v.generation as number) < 0) return false;
  if (!['ready', 'blocked', 'unknown'].includes(v.readiness as string) || !Array.isArray(v.blockers) || v.blockers.length > updateReadinessBlockers.length || new Set(v.blockers).size !== v.blockers.length || v.blockers.some(b => !updateReadinessBlockers.includes(b))) return false;
  if (v.readiness === 'ready') return v.blockers.length === 0;
  return v.blockers.length > 0 && (v.readiness !== 'blocked' || !v.blockers.includes('provider-unavailable') && !v.blockers.includes('owner-ended'));
}
