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

export class NSEBrowserRequestGate {
  #generation = 0;
  #controller: AbortController | null = null;

  begin(): { readonly generation: number; readonly signal: AbortSignal } {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    this.#generation += 1;
    return Object.freeze({ generation: this.#generation, signal: controller.signal });
  }

  accepts(generation: number): boolean {
    return generation === this.#generation && this.#controller?.signal.aborted === false;
  }

  abort(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.#generation += 1;
  }
}
