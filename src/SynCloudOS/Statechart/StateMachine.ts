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

/** @internal One table of legal moves. Shaped after GameplayKit's GKStateMachine. */
export interface StateMachineDefinition<S extends string, E extends string> {
  readonly initial: S;
  /** For each state, the event → next-state table. An absent event is illegal in that state. */
  readonly states: Readonly<Record<S, Readonly<Partial<Record<E, S>>>>>;
}

/** @internal */
export interface StateMachine<S extends string, E extends string> {
  readonly state: S;
  canSend(event: E): boolean;
  /** Returns the new state, or null (and changes nothing) when the event is illegal here. */
  send(event: E): S | null;
  /** Whether the table has any event taking `from` to `to`. */
  canEnter(from: S, to: S): boolean;
  subscribe(listener: (state: S, previous: S, event: E) => void): () => void;
}

/** @internal The state `event` leads to from `state`, or null when the table has no such move. */
export function nextState<S extends string, E extends string>(definition: StateMachineDefinition<S, E>, state: S, event: E): S | null {
  const moves = definition.states[state];
  return moves && Object.hasOwn(moves, event) ? moves[event] ?? null : null;
}

/** @internal Whether any event takes `from` to `to`. */
export function canEnterState<S extends string, E extends string>(definition: StateMachineDefinition<S, E>, from: S, to: S): boolean {
  const moves = definition.states[from];
  return Boolean(moves) && Object.values(moves).includes(to);
}

/** @internal Checks the table once, so a misspelt target fails where it is written. */
export function defineStateMachine<S extends string, E extends string>(definition: StateMachineDefinition<S, E>): {
  create(initial?: S): StateMachine<S, E>;
  readonly definition: StateMachineDefinition<S, E>;
} {
  const known = (state: string) => Object.hasOwn(definition.states, state);
  if (!known(definition.initial)) throw new TypeError(`State machine starts in unknown state "${definition.initial}".`);
  for (const [state, moves] of Object.entries(definition.states) as Array<[S, Partial<Record<E, S>>]>) {
    for (const [event, target] of Object.entries(moves) as Array<[E, S]>) {
      if (!known(target)) throw new TypeError(`State "${state}" sends "${event}" to unknown state "${target}".`);
    }
  }
  const frozen: StateMachineDefinition<S, E> = Object.freeze({
    initial: definition.initial,
    states: Object.freeze(Object.fromEntries(Object.entries(definition.states).map(([state, moves]) => [state, Object.freeze({ ...(moves as object) })]))) as StateMachineDefinition<S, E>["states"],
  });

  return {
    definition: frozen,
    create(initial: S = frozen.initial) {
      if (!known(initial)) throw new TypeError(`State machine cannot start in unknown state "${initial}".`);
      let state = initial;
      const listeners = new Set<(state: S, previous: S, event: E) => void>();
      // A listener may send again. Its move takes effect at once; listeners hear of it after the move that caused it.
      const pending: Array<readonly [S, S, E]> = [];
      let delivering = false;
      return {
        get state() { return state; },
        canSend: (event) => nextState(frozen, state, event) !== null,
        canEnter: (from, to) => canEnterState(frozen, from, to),
        send(event) {
          const next = nextState(frozen, state, event);
          if (next === null) return null;
          pending.push([next, state, event]);
          state = next;
          if (delivering) return next;
          delivering = true;
          try {
            for (let move = pending.shift(); move; move = pending.shift()) {
              for (const listener of [...listeners]) listener(...move);
            }
          } finally {
            pending.length = 0;
            delivering = false;
          }
          return next;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
      };
    },
  };
}
