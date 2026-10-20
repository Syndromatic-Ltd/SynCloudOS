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

/**
 * The shape `useObserve` accepts: anything that can announce a change and name
 * its current state. `NSEObject` and every `NSEController` satisfy it.
 */
export interface NSEObservable {
  subscribe(listener: () => void): unknown;
  getSnapshot(): unknown;
}

interface ObservableRecord {
  version: number;
  readonly listeners: Set<() => void>;
  /** Values of `@observable` accessors, keyed by accessor name. Held here, not in
   * the class's own storage, so an instance keeps its state when hot reload
   * swaps its prototype for a newer class. */
  readonly values: Map<string | symbol, unknown>;
}

const records = new WeakMap<object, ObservableRecord>();

function recordOf(object: object): ObservableRecord {
  let record = records.get(object);
  if (!record) {
    record = { version: 0, listeners: new Set(), values: new Map() };
    records.set(object, record);
  }
  return record;
}

/** Announces a change on `object`: advances its version and calls its listeners. */
export function publishObservableChange(object: object): void {
  const record = recordOf(object);
  record.version += 1;
  if (record.listeners.size === 0) return;
  const failures: unknown[] = [];
  for (const listener of [...record.listeners]) {
    try { listener(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Several observers failed while handling a change.");
}

/** The number of changes `object` has published; the snapshot `useObserve` reads for an `NSEObject`. */
export function observableVersion(object: object): number {
  return recordOf(object).version;
}

/** Calls `listener` after every change to `object`. Returns the function that stops listening. */
export function observe(object: object, listener: () => void): () => void {
  const record = recordOf(object);
  record.listeners.add(listener);
  return () => { record.listeners.delete(listener); };
}

/**
 * An accessor that publishes a change on its owning object when it is set to a
 * different value (`Object.is`). Setting an equal value publishes nothing.
 *
 * ```ts
 * class Note extends NSEObject {
 *   @observable accessor title = "";
 * }
 * ```
 *
 * Changes are per object, not per property: a view that calls
 * `useObserve(note)` re-renders when any observable accessor on `note` changes.
 * Collections should be replaced with a new value, or held in an
 * `NSEArrayController`.
 */
export function observable<This extends object, Value>(
  _target: ClassAccessorDecoratorTarget<This, Value>,
  context: ClassAccessorDecoratorContext<This, Value>,
): ClassAccessorDecoratorResult<This, Value> {
  if (context.private) throw new TypeError(`@observable cannot decorate the private accessor ${String(context.name)}; observers could not see it.`);
  const key = context.name;
  return {
    init(this: This, value: Value): Value {
      recordOf(this).values.set(key, value);
      return value;
    },
    get(this: This): Value {
      return recordOf(this).values.get(key) as Value;
    },
    set(this: This, value: Value): void {
      const record = recordOf(this);
      if (record.values.has(key) && Object.is(record.values.get(key), value)) return;
      record.values.set(key, value);
      publishObservableChange(this);
    },
  };
}
