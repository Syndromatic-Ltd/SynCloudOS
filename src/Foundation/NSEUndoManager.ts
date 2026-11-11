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

import { UndoHistory } from "./internal/UndoHistory";

type Operation = { readonly target: object; readonly invoke: () => unknown };
type Group = { name: string; operations: Operation[] };

/** Foundation undo history. Handlers register their inverse during replay. */
export class NSEUndoManager {
  readonly #history = new UndoHistory<Group, Group>();
  #replay: Group | null = null;
  #direction: "undo" | "redo" | null = null;
  #levels = 0;

  get canUndo(): boolean { return this.#history.cursor > 0; }
  get canRedo(): boolean { return this.#history.cursor < this.#history.entries.length; }
  get isUndoing(): boolean { return this.#direction === "undo"; }
  get isRedoing(): boolean { return this.#direction === "redo"; }
  get groupingLevel(): number { return this.#history.groups.length; }
  get undoActionName(): string { return this.#history.frontier("undo")?.name ?? ""; }
  get redoActionName(): string { return this.#history.frontier("redo")?.name ?? ""; }
  get levelsOfUndo(): number { return this.#levels; }
  set levelsOfUndo(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("levelsOfUndo must be a nonnegative integer.");
    this.#levels = value;
    this.#trim();
  }
  registerUndo<T extends object>(target: T, handler: (target: T) => void): void {
    const operation = { target, invoke: () => handler(target) };
    if (this.#replay) { this.#replay.operations.push(operation); return; }
    const registration = this.#history.register(
      () => ({ name: "", operations: [operation] }),
      group => { group.operations.push(operation); },
      () => false,
      () => undefined,
    );
    if (!registration.group) this.#trim();
  }
  beginUndoGrouping(): void {
    if (this.#direction) throw new Error("Cannot open an undo group while replaying.");
    this.#history.beginGroup({ name: "", operations: [] });
  }
  endUndoGrouping(): void {
    const closed = this.#history.closeGroup(
      group => group.operations.length === 0,
      (parent, group) => { parent.operations.push(...group.operations); },
      group => group,
      () => undefined,
    );
    if (!closed) throw new Error("No undo group is open.");
    if (closed.committed) this.#trim();
  }
  setActionName(name: string): void {
    const group = this.#replay ?? this.#history.currentGroup ?? this.#history.frontier("undo");
    if (group) group.name = name;
  }
  undo(): void { this.#execute("undo"); }
  redo(): void { this.#execute("redo"); }
  removeAllActions(): void {
    if (this.#direction) throw new Error("Cannot clear undo history while replaying.");
    this.#history.entries.length = 0;
    this.#history.groups.length = 0;
    this.#history.cursor = 0;
  }
  removeAllActionsWithTarget(target: object): void {
    if (this.#direction) throw new Error("Cannot remove undo actions while replaying.");
    for (const group of this.#history.groups) {
      group.operations = group.operations.filter(operation => operation.target !== target);
    }
    for (let index = this.#history.entries.length - 1; index >= 0; index--) {
      const group = this.#history.entries[index]!;
      group.operations = group.operations.filter(operation => operation.target !== target);
      if (group.operations.length === 0) {
        this.#history.entries.splice(index, 1);
        if (index < this.#history.cursor) this.#history.cursor--;
      }
    }
  }
  #trim(): void {
    while (this.#levels > 0 && this.#history.entries.length > this.#levels) {
      if (this.#history.cursor > 0) this.#history.evictOldest();
      else this.#history.entries.pop();
    }
  }
  #execute(direction: "undo" | "redo"): void {
    if (this.#direction || this.groupingLevel) throw new Error("Cannot replay while another undo operation or group is open.");
    this.#history.replaySync(direction, group => {
      this.#direction = direction;
      this.#replay = { name: group.name, operations: [] };
      try {
        for (const operation of [...group.operations].reverse()) {
          const result = operation.invoke();
          if (result !== null && (typeof result === "object" || typeof result === "function") && typeof (result as { then?: unknown }).then === "function") {
            void Promise.resolve(result).catch(() => undefined);
            throw new TypeError("Undo handlers must be synchronous.");
          }
        }
        return this.#replay.operations.length ? this.#replay : undefined;
      } finally { this.#replay = null; this.#direction = null; }
    });
  }
}
