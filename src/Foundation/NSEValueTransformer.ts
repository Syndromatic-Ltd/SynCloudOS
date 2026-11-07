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

/** A subclassable Foundation value transformer with a process-wide named registry. */
export class NSEValueTransformer<TSource = unknown, TTarget = unknown> {
  static readonly #registry = new Map<string, NSEValueTransformer<any, any>>();

  static allowsReverseTransformation(): boolean { return false; }

  static setValueTransformer(transformer: NSEValueTransformer<any, any> | null, name: string): void {
    if (!name.trim()) throw new TypeError("Transformer name must not be empty.");
    if (transformer === null) NSEValueTransformer.#registry.delete(name);
    else NSEValueTransformer.#registry.set(name, transformer);
  }

  static valueTransformerForName(name: string): NSEValueTransformer<any, any> | null {
    return NSEValueTransformer.#registry.get(name) ?? null;
  }

  static valueTransformerNames(): readonly string[] {
    return Object.freeze([...NSEValueTransformer.#registry.keys()].sort());
  }

  transformedValue(_value: TSource): TTarget {
    throw new Error("Subclasses must implement transformedValue.");
  }

  reverseTransformedValue(_value: TTarget): TSource {
    throw new Error("Reverse transformation is not supported.");
  }
}
