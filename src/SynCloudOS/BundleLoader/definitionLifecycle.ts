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

import type { SynWareDefinition } from "../AppSDK/runtimeContracts";

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError(reason: unknown): DOMException {
  return isAbortError(reason)
    ? reason as DOMException
    : new DOMException("The SynWare definition lifecycle was revoked.", "AbortError");
}

/** Races non-abortable imports and definition callbacks against their host
 * generation. The underlying promise remains observed after revocation, but
 * no stale value can settle into loader or caller state. */
export function awaitCurrentGeneration<T>(value: Promise<T>, signal: AbortSignal, assertCurrent: () => void): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError(signal.reason)));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then(
      (result) => finish(() => {
        try {
          assertCurrent();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }),
      (error) => finish(() => reject(error)),
    );
  });
}

/** Observe a shared host-owned generation from one caller without allowing
 * that caller's cancellation to revoke other waiters or the generation. */
export function awaitCallerSignal<T>(value: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return value;
  if (signal.aborted) {
    // The shared operation keeps running independently of this caller. Keep
    // its eventual rejection observed even when this caller leaves at once.
    void value.then(() => undefined, () => undefined);
    return Promise.reject(abortError(signal.reason));
  }
  return awaitCurrentGeneration(value, signal, () => {});
}

export interface DefinitionLifecycleContext {
  readonly signal: AbortSignal;
  assertCurrent(): void;
}

/**
 * Runs declaration-owned lifecycle work after the lazy module has been
 * captured, before the host publishes a ready loaded-bundle record. The
 * definition has no ambient persistence surface: migration values are an
 * internal sequential handoff, while all durable state remains behind the
 * application-specific host services that own it.
 */
export async function runDefinitionLifecycle(
  definition: Readonly<SynWareDefinition>,
  context: DefinitionLifecycleContext,
): Promise<void> {
  let migrationValue: unknown = undefined;
  for (const migration of definition.migrations ?? []) {
    context.assertCurrent();
    migrationValue = await awaitCurrentGeneration(
      Promise.resolve().then(() => migration.migrate(migrationValue, { signal: context.signal })),
      context.signal,
      context.assertCurrent,
    );
  }

  const background = definition.manifest.background;
  const tasks = background?.enabled ? (background.tasks ?? []) : [];
  if (tasks.length === 0 || !definition.createBackgroundHandler) return;

  context.assertCurrent();
  const handler = definition.createBackgroundHandler();
  context.assertCurrent();
  for (const taskId of tasks) {
    await awaitCurrentGeneration(
      Promise.resolve().then(() => handler.handle(taskId, { signal: context.signal })),
      context.signal,
      context.assertCurrent,
    );
  }
}
