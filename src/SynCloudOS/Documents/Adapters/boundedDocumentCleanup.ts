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

export interface DocumentCleanupTimerPort {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export class DocumentCleanupTimeoutError extends Error {
  readonly lateErrors: unknown[] = [];

  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`Document cleanup "${operation}" timed out after ${timeoutMs}ms.`);
    this.name = "DocumentCleanupTimeoutError";
  }

  observeLateError(error: unknown): void {
    this.lateErrors.push(error);
  }
}

export async function settleBoundedDocumentCleanup(
  operation: string,
  call: () => void | Promise<void>,
  timeoutMs: number,
  timers: DocumentCleanupTimerPort,
): Promise<unknown | null> {
  let result: void | Promise<void>;
  try {
    result = call();
  } catch (error) {
    return error;
  }
  const pending = Promise.resolve(result);
  const timeoutError = new DocumentCleanupTimeoutError(operation, Math.max(0, timeoutMs));
  let timeoutHandle: unknown = null;
  const deadline = new Promise<DocumentCleanupTimeoutError>((resolve) => {
    timeoutHandle = timers.schedule(() => resolve(timeoutError), Math.max(0, timeoutMs));
  });
  const outcome = await Promise.race([
    pending.then(() => null, (error) => error),
    deadline,
  ]);
  if (outcome !== timeoutError) timers.cancel(timeoutHandle);
  else void pending.catch((error) => timeoutError.observeLateError(error));
  return outcome;
}
