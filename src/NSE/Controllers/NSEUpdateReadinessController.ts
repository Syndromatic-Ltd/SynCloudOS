import { NSEObject } from '../Objects/NSEObject';
import { NSEControllerLifetime } from './controllerLifetime';
import type { NSEControllerOwnershipOptions } from './ownership';
import type { UpdateReadinessInventory, UpdateReadinessAuthority, UpdateReadinessSnapshot, UpdateReadinessBlocker } from '../../SynCloudOS/SynCloudOS';
import { UPDATE_READINESS_PROTOCOL, updateReadinessDomains, updateReadinessBlockers } from '../../SynCloudOS/nseRuntimeContracts';

/** Owned presentation projection. It cannot save, settle editing, activate or reload. */
export class NSEUpdateReadinessController extends NSEObject<UpdateReadinessSnapshot> {
  readonly #lifetime: NSEControllerLifetime;
  readonly #abort = new AbortController();
  readonly #inventory?: UpdateReadinessInventory;
  readonly #clientInstance: string;
  readonly #hostBuild: string;
  readonly #sources = new Map<UpdateReadinessAuthority, () => void>();
  #releaseInventory: (() => void) | undefined;
  #snapshot: UpdateReadinessSnapshot;
  #reading = false;
  #invalidated = false;
  #fingerprint = '';

  constructor(options: NSEControllerOwnershipOptions & { readonly id: string; readonly clientInstance: string; readonly hostBuild: string; readonly inventory?: UpdateReadinessInventory }) {
    super();
    if (!/^[a-zA-Z0-9_-]{8,96}$/.test(options.clientInstance) || !/^[a-zA-Z0-9._-]{1,96}$/.test(options.hostBuild)) throw new TypeError('Readiness needs a bounded host instance and build identity.');
    this.#lifetime = new NSEControllerLifetime(options, { kind: 'NSEUpdateReadinessController', id: options.id });
    this.#inventory = options.inventory; this.#clientInstance = options.clientInstance; this.#hostBuild = options.hostBuild;
    this.#snapshot = this.#make(0, ['provider-unavailable']);
    try {
      const release = this.#inventory?.subscribe(() => this.#refresh(true));
      if (typeof release === 'function') this.#releaseInventory = release;
    }
    catch { /* Missing subscription is unknown, never ready. */ }
    this.#refresh(true);
    this.#lifetime.bind(() => this.dispose());
  }
  get signal(): AbortSignal { return this.#abort.signal; }
  get isDisposed(): boolean { return this.#lifetime.isDisposed; }
  getSnapshot = (): UpdateReadinessSnapshot => this.#snapshot;
  /** Re-read existing authorities before an observation; never calls their actions. */
  inspect(): UpdateReadinessSnapshot {
    if (!this.isDisposed) this.#refresh(false);
    return this.#snapshot;
  }
  dispose(): void {
    if (!this.#lifetime.dispose()) return;
    this.#snapshot = this.#make(this.#snapshot.generation + 1, ['owner-ended']);
    this.#abort.abort();
    try { this.#releaseInventory?.(); } catch { /* Complete all releases. */ }
    for (const release of this.#sources.values()) { try { release(); } catch { /* Complete all releases. */ } }
    this.#sources.clear(); this.#releaseInventory = undefined;
    this.#publish();
  }
  #make(generation: number, blockers: readonly UpdateReadinessBlocker[]): UpdateReadinessSnapshot {
    const sorted = Object.freeze([...new Set(blockers)].sort());
    return Object.freeze({ protocol: UPDATE_READINESS_PROTOCOL, clientInstance: this.#clientInstance, hostBuild: this.#hostBuild, generation, readiness: sorted.includes('provider-unavailable') || sorted.includes('owner-ended') ? 'unknown' : sorted.length ? 'blocked' : 'ready', blockers: sorted });
  }
  #refresh(event: boolean): void {
    if (this.isDisposed) return;
    if (this.#reading) { this.#invalidated = true; return; }
    this.#reading = true;
    const blockers: UpdateReadinessBlocker[] = [];
    const revisions: unknown[] = [];
    let membershipChanged = false;
    try {
      const inventory = this.#inventory?.read();
      if (!inventory || !this.#releaseInventory || updateReadinessDomains.some(domain => !inventory.covered.includes(domain))) blockers.push('provider-unavailable');
      const authorities = inventory?.authorities ?? [];
      if (new Set(authorities).size !== authorities.length || authorities.length > 4096) throw new TypeError('Invalid readiness inventory.');
      for (const [source, release] of this.#sources) if (!authorities.includes(source)) { release(); this.#sources.delete(source); membershipChanged = true; }
      for (const source of authorities) {
        if (!updateReadinessDomains.includes(source.domain)) throw new TypeError('Unknown readiness domain.');
        if (!this.#sources.has(source)) {
          membershipChanged = true;
          const changed = () => this.#refresh(true);
          const release = source.subscribe(changed);
          if (typeof release !== 'function') throw new TypeError('Missing authority subscription.');
          source.signal?.addEventListener('abort', changed, { once: true });
          this.#sources.set(source, () => { release(); source.signal?.removeEventListener('abort', changed); });
        }
        if (source.signal?.aborted) { blockers.push('owner-ended'); continue; }
        const facts = source.read();
        if (facts.known !== true) blockers.push('provider-unavailable');
        if (!Array.isArray(facts.blockers) || facts.blockers.some(b => !updateReadinessBlockers.includes(b)) || facts.revision !== undefined && (!Number.isSafeInteger(facts.revision) || facts.revision < 0)) throw new TypeError('Invalid authority facts.');
        blockers.push(...facts.blockers); revisions.push([source.domain, facts.revision]);
      }
    } catch { blockers.push('provider-unavailable'); }
    finally { this.#reading = false; }
    if (this.isDisposed) return;
    // A callback during inspection invalidates the observation rather than
    // recursively retrying a potentially changing authority forever.
    if (this.#invalidated) { blockers.push('provider-unavailable'); this.#invalidated = false; }
    const fingerprint = JSON.stringify([blockers, revisions]);
    if (event || membershipChanged || fingerprint !== this.#fingerprint) {
      this.#fingerprint = fingerprint;
      this.#snapshot = this.#make(this.#snapshot.generation + 1, blockers);
      this.#publish();
    }
  }
  #publish(): void {
    try { this.notifyObservers(); } catch { /* A presentation observer cannot interrupt a document/native authority. */ }
  }
}
