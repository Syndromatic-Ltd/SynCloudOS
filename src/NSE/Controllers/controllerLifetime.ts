/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Licensed under the GNU General Public License, version 3 or later.
 */

import { SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason, type SynCloudOSLifecycleDisposalReason } from "../../SynCloudOS/nseRuntimeContracts";
import { resolveOwnership, type NSEControllerOwnershipOptions } from "./ownership";

/** Ownership for presentation controllers that do not hold an NSEController model. */
export class NSEControllerLifetime {
  readonly record: SynCloudOSLifecycleRecord;
  readonly #signal: AbortSignal | undefined;
  #release: (() => void) | undefined;
  #disposed = false;

  constructor(options: NSEControllerOwnershipOptions, resource: { readonly kind: string; readonly id: string }) {
    this.record = new SynCloudOSLifecycleRecord(resource);
    this.#signal = resolveOwnership(options, resource).signal;
    this.#signal?.throwIfAborted();
  }

  get isDisposed(): boolean { return this.#disposed; }

  /** Attach only once construction has acquired every resource disposal releases. */
  bind(dispose: (reason: SynCloudOSLifecycleDisposalReason) => void): void {
    if (this.#disposed) return;
    if (!this.#signal) return;
    const signal = this.#signal;
    const abort = () => {
      const reason = synCloudOSLifecycleSignalReason(signal);
      this.record.markDisposed(reason);
      dispose(reason);
    };
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      this.#release = () => signal.removeEventListener("abort", abort);
    }
  }

  /** Returns false after the first disposal, including owner-triggered disposal. */
  dispose(): boolean {
    if (this.#disposed) return false;
    this.#disposed = true;
    this.record.markDisposed("explicit");
    this.#release?.();
    this.#release = undefined;
    return true;
  }

  assertLive(operation: string): void {
    if (this.#disposed) throw this.record.error({ code: "NSE_CONTROLLER_DISPOSED", operation });
  }
}
