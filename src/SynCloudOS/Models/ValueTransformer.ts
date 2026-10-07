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

export interface ValueTransformer<TSource, TTarget> {
  readonly id: string;
  readonly reversible: boolean;
  transform(value: TSource): TTarget;
  reverse?(value: TTarget): TSource;
}

export function createValueTransformer<TSource, TTarget>(
  transformer: Omit<ValueTransformer<TSource, TTarget>, "reversible">,
): ValueTransformer<TSource, TTarget> {
  if (!transformer.id.trim()) {
    throw new TypeError("Value transformer id must not be empty.");
  }
  return Object.freeze({
    ...transformer,
    reversible: typeof transformer.reverse === "function",
  });
}

export function composeTransformers<A, B, C>(
  id: string,
  first: ValueTransformer<A, B>,
  second: ValueTransformer<B, C>,
): ValueTransformer<A, C> {
  const reversible = first.reversible && second.reversible;
  return createValueTransformer({
    id,
    transform: (value: A) => second.transform(first.transform(value)),
    ...(reversible
      ? { reverse: (value: C) => first.reverse!(second.reverse!(value)) }
      : {}),
  });
}

export class ValueTransformerRegistry {
  readonly #values = new Map<string, ValueTransformer<unknown, unknown>>();

  register<S, T>(transformer: ValueTransformer<S, T>): () => boolean {
    if (this.#values.has(transformer.id)) {
      throw new Error(`Value transformer already registered: ${transformer.id}`);
    }
    this.#values.set(
      transformer.id,
      transformer as ValueTransformer<unknown, unknown>,
    );
    return () => {
      if (this.#values.get(transformer.id) !== transformer) return false;
      return this.#values.delete(transformer.id);
    };
  }

  get<S, T>(id: string): ValueTransformer<S, T> | null {
    return (
      (this.#values.get(id) as ValueTransformer<S, T> | undefined) ?? null
    );
  }

  list(): readonly string[] {
    return Object.freeze([...this.#values.keys()].sort());
  }
}

export const negateBooleanTransformer = createValueTransformer<boolean, boolean>({
  id: "negate-boolean",
  transform: (value) => !value,
  reverse: (value) => !value,
});

export const isNullTransformer = createValueTransformer<unknown, boolean>({
  id: "is-null",
  transform: (value) => value === null,
});

export const isNotNullTransformer = createValueTransformer<unknown, boolean>({
  id: "is-not-null",
  transform: (value) => value !== null,
});
