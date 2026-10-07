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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { AppServiceClient, AppServiceResult } from "../AppSDK/runtimeContracts";
import { isAuthenticSynWareServiceToken, SynWareServiceAcquisitionError, type SynWareServiceToken } from "../AppSDK/runtimeContracts";
import { strongerServiceVersion } from "../serviceVersion";

export type RouteServiceScope = Readonly<Pick<AppServiceClient, "require" | "optional">>;

/** Uses the existing manifest, PolicyKit and ServiceRegistry. Preparation can
 * acquire only an explicitly safe host projection, never a mounted client. */
export function createRouteServiceScope(
  runtime: SynCloudOSRuntime,
  appId: string,
  signal: AbortSignal,
  purpose: "mounted" | "route-preparation",
  options: Readonly<{ allowedTokens?: readonly SynWareServiceToken<unknown>[] }> = {},
): RouteServiceScope {
  const bundle = runtime.bundles.getBundle(appId);
  const identityRevision = runtime.identity.session.getRevision();
  const allowedTokens = options.allowedTokens ? new Set(options.allowedTokens) : null;
  const assertLive = () => {
    signal.throwIfAborted();
    if (runtime.signal.aborted || runtime.bundles.getBundle(appId) !== bundle || runtime.identity.session.getRevision() !== identityRevision) {
      throw new DOMException("Route service authority changed.", "AbortError");
    }
  };
  const optional = <T,>(token: SynWareServiceToken<T>): AppServiceResult<T> => {
    assertLive();
    const denied = (message: string): AppServiceResult<T> => Object.freeze({ available: false, client: null, denial: Object.freeze({ code: "denied", message }) });
    if (!isAuthenticSynWareServiceToken(token)) return denied("An authentic service token is required.");
    if (allowedTokens && !allowedTokens.has(token as SynWareServiceToken<unknown>)) {
      return denied(`Service ${token.id} was not declared for this read-only route prefetch.`);
    }
    const manifest = bundle?.synWareManifest;
    const declaration = manifest?.services?.find(service => service.id === token.id);
    const app = runtime.apps.getApp(appId);
    if (!manifest || !declaration || !app) return denied("The route service was not declared by this application.");
    const minimumVersion = strongerServiceVersion(declaration.minimumVersion, token.minimumVersion);
    if (minimumVersion === null) return denied("Invalid service minimum version.");
    const authorise = () => runtime.policy.authorise({ action: "service.use", origin: "runtime", source: "RouteServiceScope", app,
      bundlePermissions: [...(manifest.permissions ?? [])], context: { appId, serviceId: token.id, declared: true, required: declaration.required !== false, minimumVersion: minimumVersion ?? null } });
    const policy = authorise();
    if (!policy.allowed) return denied(policy.reason);
    const provider = runtime.services.get(token.id);
    const resolved = runtime.services.resolveAppClient<T>({ appId, serviceId: token.id, permissions: manifest.permissions ?? [],
      ...(minimumVersion ? { minimumVersion } : {}), ...(token.contractVersion ? { contractVersion: token.contractVersion } : {}), signal, purpose });
    if (!resolved.available || !resolved.client) return denied(resolved.reason ?? "Route service unavailable.");
    const assertClientLive = () => { assertLive(); if (runtime.services.get(token.id) !== provider || !authorise().allowed) throw new DOMException("Route service was revoked.", "AbortError"); };
    // Project functions onto a new object so frozen provider properties never
    // bypass a proxy invariant. Retained methods check scope before and after awaits.
    const source = resolved.client as object;
    const client: Record<PropertyKey, unknown> = {};
    for (const key of Reflect.ownKeys(source)) {
      const value = Reflect.get(source, key);
      client[key] = typeof value !== "function" ? value : (...args: unknown[]) => {
        assertClientLive();
        const result = Reflect.apply(value, source, args);
        return result && typeof (result as { then?: unknown }).then === "function" ? Promise.resolve(result).then(value => { assertClientLive(); return value; }) : (assertClientLive(), result);
      };
    }
    return Object.freeze({ available: true, client: Object.freeze(client) as T, denial: null });
  };
  return Object.freeze({ optional, require<T>(token: SynWareServiceToken<T>): T {
    const result = optional(token);
    if (result.available && result.client) return result.client;
    throw new SynWareServiceAcquisitionError(token.id, result.denial!);
  } });
}
