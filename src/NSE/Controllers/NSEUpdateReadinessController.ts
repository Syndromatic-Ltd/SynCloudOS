import { NSEObject } from '../Objects/NSEObject';
import { ControllerLifetime } from './controllerLifetime';
import type { NSEControllerOwnershipOptions } from './ownership';
import type { UpdateReadinessInventory, UpdateReadinessSnapshot } from '../../SynCloudOS/SynCloudOS';
import { UpdateReadinessProjection } from '../../SynCloudOS/nseRuntimeContracts';

/** Owned presentation over the shared readonly runtime observation contract. */
export class UpdateReadinessController extends NSEObject<UpdateReadinessSnapshot> {
  readonly #lifetime: ControllerLifetime;
  readonly #projection: UpdateReadinessProjection;
  readonly #release: () => void;
  constructor(options: NSEControllerOwnershipOptions & { readonly id: string; readonly clientInstance: string; readonly hostBuild: string; readonly inventory?: UpdateReadinessInventory }) {
    super();
    this.#lifetime = new ControllerLifetime(options, { kind: 'NSEUpdateReadinessController', id: options.id });
    this.#projection = new UpdateReadinessProjection(options);
    this.#release = this.#projection.subscribe(() => { try { this.notifyObservers(); } catch { /* Presentation observers cannot interrupt authorities. */ } });
    this.#lifetime.bind(() => this.dispose());
  }
  get signal(): AbortSignal { return this.#projection.signal; }
  get isDisposed(): boolean { return this.#lifetime.isDisposed; }
  getSnapshot = (): UpdateReadinessSnapshot => this.#projection.getSnapshot();
  inspect(): UpdateReadinessSnapshot { return this.#projection.inspect(); }
  dispose(): void { if (!this.#lifetime.dispose()) return; this.#projection.dispose(); this.#release(); }
}
