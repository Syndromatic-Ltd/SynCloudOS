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

import { createCompressionStream } from "../../../Foundation/internal/compression";
import { CPFXAlgorithm } from "../CPFXAlgorithm";
import type { CPFXFilterOperation } from "../CPFXFilterOperation";
import { CPFXFilterError } from "../CPFXFilterError";

export function filterCodec(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm) {
  try {
    if (!Object.hasOwn(CPFXAlgorithm, algorithm)) throw new Error("Unknown algorithm.");
    return createCompressionStream(operation, algorithm);
  } catch (cause) {
    throw new CPFXFilterError("invalidState", `Cannot initialise ${algorithm} ${operation} filter: the host codec is unavailable or the parameters are invalid.`, { cause });
  }
}

export function filterCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new CPFXFilterError("invalidState", "Filter buffer capacity must be a positive safe integer.");
  return value;
}

export function filterDataError(cause: unknown): CPFXFilterError {
  return cause instanceof CPFXFilterError ? cause : new CPFXFilterError("invalidData", "The compression codec rejected the data.", { cause });
}
