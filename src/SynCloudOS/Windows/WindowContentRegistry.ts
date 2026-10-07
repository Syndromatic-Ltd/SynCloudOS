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

import { canonicalWindowSerializableValue } from "./windowTypes";
import type {
  WindowContentController,
  WindowContentDescriptor,
  WindowContentFactoryRegistration,
  WindowContentRegistration,
  WindowSerializableValue,
} from "./windowTypes";

export class DuplicateWindowContentFactoryError extends Error {
  constructor(readonly typeId: string) {
    super(`Window content factory "${typeId}" is already registered.`);
    this.name = "DuplicateWindowContentFactoryError";
  }
}

export class WindowContentFactoryUnavailableError extends Error {
  constructor(readonly typeId: string) {
    super(`Window content factory "${typeId}" is unavailable.`);
    this.name = "WindowContentFactoryUnavailableError";
  }
}

export class WindowContentRegistry {
  readonly #factories = new Map<string, WindowContentFactoryRegistration>();
  #disposed = false;

  get size(): number { return this.#factories.size; }

  register(factory: WindowContentFactoryRegistration): WindowContentRegistration {
    this.#assertLive();
    if (!factory.typeId.trim()) throw new TypeError("Window content factory IDs must not be empty.");
    if (this.#factories.has(factory.typeId)) throw new DuplicateWindowContentFactoryError(factory.typeId);
    this.#factories.set(factory.typeId, factory);
    let live = true;
    return { dispose: () => {
      if (!live) return;
      live = false;
      if (this.#factories.get(factory.typeId) === factory) this.#factories.delete(factory.typeId);
    } };
  }

  createController(
    descriptor: WindowContentDescriptor,
    windowControllerId: string,
    applicationId?: string | null,
  ): WindowContentController {
    this.#assertLive();
    const applicationTypeId = applicationId ? `application:${applicationId}` : null;
    const factory = this.#factories.get(descriptor.rendererId) ?? (applicationTypeId ? this.#factories.get(applicationTypeId) : undefined);
    if (!factory) throw new WindowContentFactoryUnavailableError(applicationTypeId && this.#factories.has(applicationTypeId) ? applicationTypeId : descriptor.rendererId);
    const controller = factory.create({ descriptor, windowControllerId });
    if (!controller.mountKey.trim() || !controller.responderId.trim()) {
      try { controller.dispose(); } catch { /* invalid controller cleanup is best effort */ }
      throw new TypeError("Window content controllers require mount and responder IDs.");
    }
    return controller;
  }

  async restore(
    descriptor: WindowContentDescriptor,
    state: WindowSerializableValue | null,
    signal: AbortSignal,
    applicationId?: string | null,
  ): Promise<{ readonly descriptor: WindowContentDescriptor; readonly state: WindowSerializableValue | null }> {
    this.#assertLive();
    signal.throwIfAborted();
    const applicationTypeId = applicationId ? `application:${applicationId}` : null;
    const factory = this.#factories.get(descriptor.rendererId) ?? (applicationTypeId ? this.#factories.get(applicationTypeId) : undefined);
    if (!factory) throw new WindowContentFactoryUnavailableError(descriptor.rendererId);
    if (!factory.restore) return { descriptor, state };
    const restored = await factory.restore({ descriptor, state, signal });
    signal.throwIfAborted();
    const canonical = canonicalWindowSerializableValue(
      restored as unknown as WindowSerializableValue,
      "Restored window content",
    ) as unknown as {
      readonly descriptor?: { readonly rendererId?: unknown; readonly parameters?: unknown };
      readonly state?: WindowSerializableValue | null;
    };
    if (
      !canonical || typeof canonical !== "object" || Array.isArray(canonical) ||
      !canonical.descriptor || typeof canonical.descriptor !== "object" ||
      typeof canonical.descriptor.rendererId !== "string" || !canonical.descriptor.rendererId.trim() ||
      !("parameters" in canonical.descriptor) || !("state" in canonical)
    ) throw new TypeError("Restored window content requires a valid descriptor and state.");
    return Object.freeze({
      descriptor: Object.freeze({
        rendererId: canonical.descriptor.rendererId,
        parameters: canonical.descriptor.parameters as WindowSerializableValue | null,
      }),
      state: canonical.state ?? null,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#factories.clear();
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("Window content registry is disposed.");
  }
}
