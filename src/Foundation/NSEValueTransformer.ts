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

  reverseTransformedValue(value: TTarget): TSource {
    const transformerClass = this.constructor as typeof NSEValueTransformer;
    if (!transformerClass.allowsReverseTransformation()) throw new Error("Reverse transformation is not supported.");
    return this.transformedValue(value as unknown as TSource) as unknown as TSource;
  }
}

export const NSENegateBooleanTransformerName = "NSNegateBoolean";
export const NSEIsNilTransformerName = "NSIsNil";
export const NSEIsNotNilTransformerName = "NSIsNotNil";

class NegateBooleanTransformer extends NSEValueTransformer<boolean, boolean> {
  static override allowsReverseTransformation(): boolean { return true; }
  override transformedValue(value: boolean): boolean { return !value; }
}
class IsNilTransformer extends NSEValueTransformer<unknown, boolean> {
  override transformedValue(value: unknown): boolean { return value == null; }
}
class IsNotNilTransformer extends NSEValueTransformer<unknown, boolean> {
  override transformedValue(value: unknown): boolean { return value != null; }
}
NSEValueTransformer.setValueTransformer(new NegateBooleanTransformer(), NSENegateBooleanTransformerName);
NSEValueTransformer.setValueTransformer(new IsNilTransformer(), NSEIsNilTransformerName);
NSEValueTransformer.setValueTransformer(new IsNotNilTransformer(), NSEIsNotNilTransformerName);
