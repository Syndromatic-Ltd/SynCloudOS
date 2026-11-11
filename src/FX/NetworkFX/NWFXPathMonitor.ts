/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { networkSessionBindings } from "./internal/networkSessionBindings";
import { createFXSessionBinding, fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import { DFXQueue } from "../DispatchFX/DFXQueue";
import { NWFXError } from "./NWFXError";
import type { NWFXPath } from "./NWFXPath";
import { NWFXInterfaceType } from "./NWFXInterfaceType";
import { createNetworkPath } from "./internal/pathValues";
import { networkFailure, networkPortFor, unavailableObservation, type NetworkPathSnapshot } from "./internal/networkPort";
/** NWPathMonitor. The plugin supplies app attribution to enforce network.read;
 * Network has no authorization prompt or authorization API. Cancellation is terminal. */
export class NWFXPathMonitor {
  #binding;
  #session;
  #port;
  #generation;
  #filter;
  #queue: DFXQueue | null = null;
  #path: NWFXPath | null = null;
  #started = false;
  #cancelled = false;
  #subscription: { dispose(): void } | undefined;
  #releaseAccess: (() => void) | undefined;
  #releaseSession: (() => void) | undefined;
  pathUpdateHandler: ((path: NWFXPath) => void) | null = null;
  constructor();
  constructor(requiredInterfaceType: NWFXInterfaceType);
  constructor(prohibitedInterfaceTypes: readonly NWFXInterfaceType[]);
  constructor(filter?: NWFXInterfaceType | readonly NWFXInterfaceType[]) {
    this.#binding =
      networkSessionBindings.get(new.target) ??
      createFXSessionBinding(new.target, reason =>
        NWFXError.posix(reason === "ended" ? 89 : reason === "ambiguous" ? 22 : 6, `Network application session is ${reason}.`),
      );
    this.#session = this.#binding.resolve();
    this.#port = networkPortFor(this.#session.context);
    this.#port.assertAccess();
    this.#generation = this.#port.generation;
    const filters = filter === undefined ? [] : typeof filter === "string" ? [filter] : filter;
    if (!Array.isArray(filters) || filters.some(type => !Object.values(NWFXInterfaceType).includes(type)))
      throw NWFXError.posix(22, "Invalid network interface type.");
    this.#filter = typeof filter === "string" ? filter : filter ? Object.freeze([...filter]) : undefined;
  }
  get queue(): DFXQueue | null {
    return this.#queue;
  }
  /** Throws before the first queued observation or after access/lifetime revocation. */
  get currentPath(): NWFXPath {
    this.#assertLive();
    return this.#path ?? unavailableObservation("currentPath before initial delivery");
  }
  /** Starts once. Events run as synchronous Dispatch items on `queue`, which is required, as in Apple's
   * `start(queue:)`. A required/prohibited interface filter throws ENOTSUP if the browser cannot observe transport. */
  start(queue: DFXQueue): void {
    this.#assertLive();
    if (this.#started) return;
    if (!(queue instanceof DFXQueue)) throw NWFXError.posix(22, "start(queue) requires a Dispatch queue, for example DFXQueue.main.");
    this.#queue = queue;
    this.#started = true;
    this.#releaseSession = observeFXSessionEnd(this.#session, () => this.cancel());
    this.#releaseAccess = this.#port.observeAccessLoss(() => this.cancel());
    const deliver = (snapshot: NetworkPathSnapshot) => {
      if (!this.#live()) return;
      try {
        const path = createNetworkPath(this.#filtered(snapshot));
        this.#queue!.async(() => {
          if (!this.#live()) return;
          this.#path = path;
          this.pathUpdateHandler?.(path);
        });
      } catch (error) {
        this.cancel();
        throw networkFailure(error);
      }
    };
    try {
      this.#subscription = this.#port.subscribe(deliver);
      if (this.#cancelled) this.#subscription.dispose();
      else deliver(this.#port.currentPath());
    } catch (error) {
      this.cancel();
      throw networkFailure(error);
    }
  }
  cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;
    this.#releaseAccess?.();
    this.#releaseSession?.();
    this.#releaseAccess = undefined;
    this.#releaseSession = undefined;
    const subscription = this.#subscription;
    this.#subscription = undefined;
    subscription?.dispose();
  }
  #assertLive(): void {
    if (this.#cancelled) throw NWFXError.posix(89, "Network monitor is cancelled.");
    this.#binding.resolve();
    this.#port.assertAccess(this.#generation);
  }
  #live(): boolean {
    try {
      this.#assertLive();
      return true;
    } catch {
      this.cancel();
      return false;
    }
  }
  #filtered(snapshot: NetworkPathSnapshot): NetworkPathSnapshot {
    const filter = this.#filter;
    if (filter === undefined || (typeof filter !== "string" && filter.length === 0)) return snapshot;
    const types = snapshot.interfaceTypes ?? unavailableObservation("interface filtering");
    const accepts = (type: NWFXInterfaceType) => (typeof filter === "string" ? type === filter : !filter.includes(type));
    const included = types.filter(accepts);
    return {
      ...snapshot,
      interfaceTypes: included,
      ...(snapshot.interfaces ? { interfaces: snapshot.interfaces.filter(item => accepts(item.type)) } : {}),
      ...(included.length === 0 ? { status: "unsatisfied", unsatisfiedReason: "notAvailable" } : {}),
    };
  }
}
Object.defineProperty(NWFXPathMonitor, fxAttributedClass, { value: true });
