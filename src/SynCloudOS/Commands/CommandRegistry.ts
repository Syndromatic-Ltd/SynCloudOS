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

import type { CommandDeclaration, CommandId, CommandRegistration } from "./commandTypes";

export class CommandRegistrationError extends Error {
  constructor(readonly commandId: CommandId, readonly responderId: string) {
    super(`Command ${commandId} is already registered for responder ${responderId}.`);
    this.name = "CommandRegistrationError";
  }
}

export interface CommandRegistryEntry {
  readonly declaration: CommandDeclaration<unknown, unknown>;
  readonly generation: number;
}

export class CommandRegistry {
  readonly #entries = new Map<string, CommandRegistryEntry>();
  #generation = 0;
  #disposed = false;

  get generation() { return this.#generation; }

  register<P, R>(declaration: CommandDeclaration<P, R>): CommandRegistration {
    if (this.#disposed) throw new Error("Runtime commands are disposed.");
    const key = this.#key(declaration.id, declaration.responderId);
    if (this.#entries.has(key)) throw new CommandRegistrationError(declaration.id, declaration.responderId);
    const generation = ++this.#generation;
    this.#entries.set(key, { declaration: declaration as CommandDeclaration<unknown, unknown>, generation });
    let live = true;
    return {
      commandId: declaration.id,
      responderId: declaration.responderId,
      dispose: () => {
        if (!live) return false;
        live = false;
        if (!this.#entries.delete(key)) return false;
        this.#generation += 1;
        return true;
      },
    };
  }

  get(commandId: CommandId, responderId: string): CommandRegistryEntry | null {
    return this.#entries.get(this.#key(commandId, responderId)) ?? null;
  }

  inspect() {
    return Array.from(this.#entries.values()).map(({ declaration, generation }) => ({
      commandId: declaration.id,
      responderId: declaration.responderId,
      generation,
    }));
  }

  declarations() {
    return Array.from(this.#entries.values()).map(({ declaration }) => declaration);
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#entries.clear();
    this.#generation += 1;
  }

  #key(commandId: CommandId, responderId: string) {
    return `${commandId}\u0000${responderId}`;
  }
}
