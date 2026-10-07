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

import type { TrustedSynWareBundle } from "./bundleTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

export interface BundleGenerationFence {
  readonly signal: AbortSignal;
  dispose(): void;
}

function abortError(reason: unknown): DOMException {
  return reason instanceof DOMException && reason.name === "AbortError"
    ? reason
    : new DOMException("The SynWare bundle generation was revoked by replacement.", "AbortError");
}

function eventAppId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const appId = (payload as { readonly appId?: unknown }).appId;
  return typeof appId === "string" ? appId : null;
}

/**
 * Binds an asynchronous host operation to exactly one registered bundle
 * generation. A same-id replacement is an authority revocation, even though
 * a visual mount may remain alive for an exit transition. The returned signal
 * is deliberately host-only; portable AppSDK code receives only an operation
 * signal minted by its narrow client.
 */
export function createBundleGenerationFence(
  runtime: SynCloudOSRuntime,
  bundle: TrustedSynWareBundle,
  parentSignal?: AbortSignal,
): BundleGenerationFence {
  const controller = new AbortController();
  const appId = bundle.manifest.id;
  let disposed = false;
  let unsubscribeUpdate: (() => void) | null = null;
  let unsubscribeUnregister: (() => void) | null = null;

  const removeListeners = () => {
    unsubscribeUpdate?.();
    unsubscribeUpdate = null;
    unsubscribeUnregister?.();
    unsubscribeUnregister = null;
    runtime.signal.removeEventListener("abort", onRuntimeAbort);
    parentSignal?.removeEventListener("abort", onParentAbort);
  };
  const revoke = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(abortError(reason));
    removeListeners();
  };
  const ensureCurrent = () => {
    if (runtime.bundles.getBundle(appId) !== bundle) {
      revoke(new DOMException(`SynWare bundle ${appId} authority was revoked by replacement.`, "AbortError"));
    }
  };
  const onRuntimeAbort = () => revoke(runtime.signal.reason);
  const onParentAbort = () => revoke(parentSignal?.reason);
  const onBundleEvent = (payload: unknown) => {
    if (eventAppId(payload) === appId) ensureCurrent();
  };

  unsubscribeUpdate = runtime.events.subscribe("bundle.update", (event) => onBundleEvent(event.payload));
  unsubscribeUnregister = runtime.events.subscribe("bundle.unregister", (event) => onBundleEvent(event.payload));
  runtime.signal.addEventListener("abort", onRuntimeAbort, { once: true });
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  if (runtime.signal.aborted) onRuntimeAbort();
  else if (parentSignal?.aborted) onParentAbort();
  else ensureCurrent();

  return Object.freeze({
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      disposed = true;
      removeListeners();
    },
  });
}
