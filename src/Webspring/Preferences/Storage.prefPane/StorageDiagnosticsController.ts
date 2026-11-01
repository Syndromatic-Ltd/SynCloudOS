/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { NSEObject } from "../../../NSE/NSE";
import type { SynCloudOSRuntime } from "../../../SynCloudOS/Runtime/runtimeInstanceTypes";
import type { AppStorageDiagnosticsClient, StorageDiagnosticsSnapshot } from "../../../SynCloudOS/AppSDK";

export interface StorageDiagnosticsPresentation {
  readonly state: "idle" | "checking" | "completed" | "ended";
  readonly generation: number;
  readonly observation: StorageDiagnosticsSnapshot | null;
}
export const initialStorageDiagnostics: StorageDiagnosticsPresentation = Object.freeze({ state: "idle", generation: 0, observation: null });

/** Existing system Settings owns this presentation. App consumers use their
 * mounted client and their own Application → Window → ViewController owner. */
export class StorageDiagnosticsController extends NSEObject<StorageDiagnosticsPresentation> {
  readonly #owner = new AbortController();
  readonly #client: AppStorageDiagnosticsClient;
  readonly #releases: (() => void)[] = [];
  #request: AbortController | null = null;
  #snapshot = initialStorageDiagnostics;
  constructor(runtime: SynCloudOSRuntime) {
    super();
    runtime.signal.throwIfAborted();
    this.#client = runtime.storageDiagnostics;
    const ended = () => this.dispose();
    runtime.signal.addEventListener("abort", ended, { once: true });
    this.#releases.push(() => runtime.signal.removeEventListener("abort", ended));
    this.#releases.push(runtime.identity.session.subscribe(() => this.dispose()));
    this.#releases.push(runtime.systemUI.subscribe(() => { if (!runtime.systemUI.preferences.isOpen()) this.dispose(); }));
  }
  override getSnapshot = (): StorageDiagnosticsPresentation => this.#snapshot;
  #publish(next: StorageDiagnosticsPresentation) {
    this.#snapshot = Object.freeze(next);
    try { this.notifyObservers(); } catch { /* Presentation observers cannot interrupt owner cleanup. */ }
  }
  async refresh(): Promise<void> {
    if (this.#owner.signal.aborted) return;
    this.#request?.abort(new DOMException("Storage observation superseded", "AbortError"));
    const request = new AbortController(), generation = this.#snapshot.generation + 1;
    this.#request = request;
    this.#publish({ state: "checking", generation, observation: null });
    try {
      const observation = await this.#client.inspect(AbortSignal.any([this.#owner.signal, request.signal]));
      if (this.#owner.signal.aborted || this.#request !== request || request.signal.aborted) return;
      this.#publish({ state: "completed", generation, observation });
    } catch {
      // Revoked/superseded work is never presented as a successful empty
      // estimate. The shared client normalizes native query failures.
      if (!this.#owner.signal.aborted && this.#request === request && !request.signal.aborted) this.#publish({ state: "idle", generation, observation: null });
    } finally { if (this.#request === request) this.#request = null; }
  }
  dispose(): void {
    if (this.#owner.signal.aborted) return;
    this.#owner.abort(new DOMException("Storage observation owner ended", "AbortError"));
    this.#request?.abort(); this.#request = null;
    for (const release of this.#releases.splice(0)) release();
    this.#publish({ state: "ended", generation: this.#snapshot.generation + 1, observation: null });
  }
}
