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

/** History storage shared by the Foundation manager and runtime adapters.
 * Metadata and replay authority belong to the caller. */
export class UndoHistory<Entry, Group> {
  readonly entries: Entry[] = [];
  readonly groups: Group[] = [];
  cursor = 0;

  beginGroup(group: Group): void { this.groups.push(group); }
  endGroup(): Group | undefined { return this.groups.pop(); }
  get currentGroup(): Group | undefined { return this.groups.at(-1); }
  /** Register either inside the current group or at the history frontier. */
  register(
    makeEntry: () => Entry,
    appendToGroup: (group: Group) => void,
    mergePrevious: (entry: Entry) => boolean,
    retire: (entry: Entry) => void,
  ): { group?: Group; entry?: Entry; discarded: Entry[]; merged?: boolean } {
    const group = this.currentGroup;
    if (group) {
      appendToGroup(group);
      return { group, discarded: [] };
    }
    const discarded = this.discardRedo();
    discarded.forEach(retire);
    const previous = this.frontier("undo");
    if (previous && mergePrevious(previous)) return { entry: previous, discarded, merged: true };
    const entry = makeEntry();
    this.append(entry);
    return { entry, discarded };
  }

  /** Close one group, flattening it into its parent or committing it. */
  closeGroup(
    isEmpty: (group: Group) => boolean,
    merge: (parent: Group, child: Group) => void,
    makeEntry: (group: Group) => Entry,
    retire: (entry: Entry) => void,
  ): { group: Group; discarded: Entry[]; committed: boolean } | undefined {
    const group = this.endGroup();
    if (!group) return undefined;
    if (isEmpty(group)) return { group, discarded: [], committed: false };
    const parent = this.currentGroup;
    if (parent) {
      merge(parent, group);
      return { group, discarded: [], committed: false };
    }
    const discarded = this.discardRedo();
    discarded.forEach(retire);
    this.append(makeEntry(group));
    return { group, discarded, committed: true };
  }

  /** Only successful adapter transactions move the shared frontier. */
  async replayAsync<Result>(
    direction: "undo" | "redo",
    execute: (entry: Entry | undefined, commit: () => void) => Promise<Result>,
  ): Promise<Result> {
    let committed = false;
    const commit = () => {
      if (committed) throw new Error("Undo replay has already committed.");
      committed = true;
      this.advance(direction);
    };
    return execute(this.frontier(direction), commit);
  }

  replaySync(direction: "undo" | "redo", execute: (entry: Entry) => Entry | undefined): void {
    const entry = this.frontier(direction);
    if (!entry) return;
    const replacement = execute(entry);
    const index = direction === "undo" ? this.cursor - 1 : this.cursor;
    if (replacement !== undefined) {
      this.entries[index] = replacement;
      this.advance(direction);
    } else {
      this.entries.splice(index, 1);
      if (direction === "undo") this.cursor--;
    }
  }
  discardRedo(): Entry[] { return this.entries.splice(this.cursor); }
  append(entry: Entry): void {
    this.entries.push(entry);
    this.cursor = this.entries.length;
  }
  frontier(direction: "undo" | "redo"): Entry | undefined {
    return this.entries[direction === "undo" ? this.cursor - 1 : this.cursor];
  }
  advance(direction: "undo" | "redo"): void { this.cursor += direction === "undo" ? -1 : 1; }
  evictOldest(): Entry | undefined {
    const entry = this.entries.shift();
    if (entry !== undefined) this.cursor = Math.max(0, this.cursor - 1);
    return entry;
  }
}
