/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXKeyDescriptor } from "../CNFXKeyDescriptor";
import { CNFXError } from "../CNFXError";
import { contactKeys } from "./contactValues";
const descriptors = new WeakMap<object, readonly string[]>();
export function keyDescriptor(keys: readonly string[]): CNFXKeyDescriptor { const descriptor = Object.freeze({}); descriptors.set(descriptor, Object.freeze([...keys])); return descriptor; }
export function expandKeys(keys: readonly CNFXKeyDescriptor[]): readonly string[] { return Object.freeze([...new Set(keys.flatMap(key => { if (typeof key === "string" && contactKeys.includes(key)) return [key]; if (typeof key === "object" && key && descriptors.has(key)) return descriptors.get(key)!; throw new CNFXError("unauthorizedKeys", "The requested contact key descriptor is unavailable."); }))]); }
