import { UPDATE_READINESS_PROTOCOL, isUpdateReadinessSnapshot, type UpdateReadinessSnapshot } from './updateReadiness';
import type { SynCloudOSRuntimeEnvironment } from '../SynCloudOS';

export interface UpdateReadinessRequest {
  readonly protocol: typeof UPDATE_READINESS_PROTOCOL;
  readonly kind: 'inspect' | 'confirm';
  readonly observerInstance: string;
  readonly nonce: string;
}
export interface UpdateReadinessReply extends UpdateReadinessRequest {
  readonly snapshot: UpdateReadinessSnapshot;
}
export type UpdateReadinessDeferReason = 'no-clients' | 'membership-changed' | 'unresponsive-client' | 'invalid-evidence' | 'incompatible-build' | 'client-blocked' | 'client-unknown' | 'evidence-changed' | 'owner-ended' | 'inspection-failed';
export interface UpdateReadinessObservation {
  readonly status: 'ready-at-observation' | 'defer';
  /** This contract deliberately cannot grant takeover or reload authority. */
  readonly activationAuthorized: false;
  readonly reasons: readonly UpdateReadinessDeferReason[];
  readonly participantCount: number;
}
export interface UpdateReadinessTransport {
  /** Browser-owned in-scope client IDs; include uncontrolled clients. */
  enumerate(signal: AbortSignal): Promise<readonly string[]>;
  /** One exact client and a fresh private port, validated source/scope/script. */
  request(clientId: string, request: UpdateReadinessRequest, signal: AbortSignal): Promise<unknown>;
}
function members(ids: readonly string[]): readonly string[] {
  if (!Array.isArray(ids) || ids.length > 128 || ids.some(id => typeof id !== 'string' || !id || id.length > 256 || /[\r\n]/.test(id)) || new Set(ids).size !== ids.length) throw new TypeError('Invalid browser client inventory.');
  return [...ids].sort();
}
function reply(value: unknown, request: UpdateReadinessRequest): UpdateReadinessSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'kind,nonce,observerInstance,protocol,snapshot' || v.protocol !== request.protocol || v.kind !== request.kind || v.observerInstance !== request.observerInstance || v.nonce !== request.nonce || !isUpdateReadinessSnapshot(v.snapshot)) return null;
  return Object.freeze({ ...v.snapshot, blockers: Object.freeze([...v.snapshot.blockers]) });
}

/**
 * Bounded, ephemeral evidence collection. No durable participant registry and
 * no activation methods. Enumeration is not atomic browser membership: an edit
 * or a new client after the last read remains possible even for an all-ready result.
 */
export async function observeUpdateReadiness(options: {
  readonly transport: UpdateReadinessTransport;
  readonly observerInstance: string;
  readonly hostBuild: string;
  readonly signal: AbortSignal;
  readonly environment: Pick<SynCloudOSRuntimeEnvironment, 'setTimeout' | 'clearTimeout' | 'randomUUID'>;
  readonly timeoutMs?: number;
}): Promise<UpdateReadinessObservation> {
  const reasons = new Set<UpdateReadinessDeferReason>();
  let participantCount = 0;
  const finish = (): UpdateReadinessObservation => Object.freeze({ status: reasons.size ? 'defer' : 'ready-at-observation', activationAuthorized: false, reasons: Object.freeze([...reasons].sort()), participantCount });
  if (!/^[a-zA-Z0-9_-]{8,96}$/.test(options.observerInstance) || !/^[a-zA-Z0-9._-]{1,96}$/.test(options.hostBuild)) throw new TypeError('Invalid observation identity.');
  const timeoutMs = options.timeoutMs ?? 1500;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new TypeError('Invalid inspection deadline.');
  const lifetime = new AbortController();
  const abort = () => lifetime.abort(options.signal.reason);
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  const timer = options.environment.setTimeout(() => lifetime.abort(new DOMException('Readiness deadline expired.', 'TimeoutError')), timeoutMs);
  // Even a defective transport that ignores AbortSignal cannot keep inspection
  // pending. Its real adapter still owns closing the private port on abort.
  const bounded = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const ended = () => { lifetime.signal.removeEventListener('abort', ended); reject(lifetime.signal.reason); };
    lifetime.signal.addEventListener('abort', ended, { once: true });
    if (lifetime.signal.aborted) ended();
    promise.then(value => { lifetime.signal.removeEventListener('abort', ended); resolve(value); }, error => { lifetime.signal.removeEventListener('abort', ended); reject(error); });
  });
  try {
    lifetime.signal.throwIfAborted();
    const initial = members(await bounded(options.transport.enumerate(lifetime.signal)));
    participantCount = initial.length;
    if (!initial.length) { reasons.add('no-clients'); return finish(); }
    const nonce = options.environment.randomUUID();
    const snapshots = new Map<string, UpdateReadinessSnapshot>();
    const instances = new Set<string>();
    for (const kind of ['inspect', 'confirm'] as const) {
      const request = Object.freeze({ protocol: UPDATE_READINESS_PROTOCOL, kind, observerInstance: options.observerInstance, nonce });
      const replies = await bounded(Promise.all(initial.map(async id => {
        try { return { id, evidence: reply(await bounded(options.transport.request(id, request, lifetime.signal)), request) }; }
        catch { reasons.add('unresponsive-client'); return { id, evidence: null }; }
      })));
      lifetime.signal.throwIfAborted();
      for (const { id, evidence } of replies) {
        if (!evidence) { reasons.add('invalid-evidence'); continue; }
        if (evidence.hostBuild !== options.hostBuild) reasons.add('incompatible-build');
        if (evidence.readiness === 'blocked') reasons.add('client-blocked');
        if (evidence.readiness === 'unknown') reasons.add('client-unknown');
        if (kind === 'inspect') {
          if (instances.has(evidence.clientInstance)) reasons.add('invalid-evidence');
          instances.add(evidence.clientInstance); snapshots.set(id, evidence);
        } else {
          const first = snapshots.get(id);
          if (!first || first.clientInstance !== evidence.clientInstance || first.generation !== evidence.generation || first.readiness !== evidence.readiness || first.blockers.join(',') !== evidence.blockers.join(',')) reasons.add('evidence-changed');
        }
      }
      const after = members(await bounded(options.transport.enumerate(lifetime.signal)));
      if (after.join('\n') !== initial.join('\n')) reasons.add('membership-changed');
      if (reasons.size) break;
    }
    lifetime.signal.throwIfAborted();
  } catch {
    reasons.add(options.signal.aborted ? 'owner-ended' : lifetime.signal.aborted ? 'unresponsive-client' : 'inspection-failed');
  } finally {
    options.environment.clearTimeout(timer); options.signal.removeEventListener('abort', abort);
    lifetime.abort(); // Releases even a transport's late or mismatched reply port.
  }
  return finish();
}
