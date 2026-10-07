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

export interface AutosaveTimerAPI {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class AutosaveScheduler {
  #timer: unknown | null = null;
  #running: Promise<void> = Promise.resolve();
  #abortController: AbortController | null = null;
  #generation = 0;

  constructor(
    private readonly delayMs: number,
    private readonly save: (signal: AbortSignal) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly timers: AutosaveTimerAPI,
  ) {}

  schedule(): void {
    const generation = ++this.#generation;
    if (this.#timer !== null) this.timers.clearTimeout(this.#timer);
    this.#timer = this.timers.setTimeout(() => {
      this.#timer = null;
      void this.#enqueue(generation);
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.#timer !== null) {
      this.timers.clearTimeout(this.#timer);
      this.#timer = null;
      await this.#enqueue(this.#generation);
      return;
    }
    await this.#running;
  }

  cancel(reason?: unknown): void {
    this.#generation += 1;
    if (this.#timer !== null) this.timers.clearTimeout(this.#timer);
    this.#timer = null;
    this.#abortController?.abort(reason);
  }

  async cancelAndWait(reason?: unknown): Promise<void> {
    this.cancel(reason);
    await this.#running;
  }

  #enqueue(generation: number): Promise<void> {
    const execution = this.#running.then(async () => {
      if (generation !== this.#generation) return;
      const controller = new AbortController();
      this.#abortController = controller;
      try {
        await this.save(controller.signal);
      } finally {
        if (this.#abortController === controller) this.#abortController = null;
      }
    });
    this.#running = execution.catch((error) => { this.onError(error); });
    return this.#running;
  }
}
