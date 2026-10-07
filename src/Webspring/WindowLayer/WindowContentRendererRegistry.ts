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

import type { ReactNode } from "react";
import type { WindowPresentation, WindowRecord } from "../../SynCloudOS/SynCloudOS";

export interface WindowContentRenderContext {
  readonly window: WindowRecord;
  readonly presentation: WindowPresentation;
  readonly mountKey: string;
}

export type WindowContentRenderer = (context: WindowContentRenderContext) => ReactNode;

export class DuplicateWindowContentRendererError extends Error {
  constructor(readonly mountKey: string) {
    super(`Window content renderer "${mountKey}" is already registered.`);
    this.name = "DuplicateWindowContentRendererError";
  }
}

export class WindowContentRendererUnavailableError extends Error {
  constructor(readonly mountKey: string) {
    super(`Window content renderer "${mountKey}" is unavailable.`);
    this.name = "WindowContentRendererUnavailableError";
  }
}

export class WindowContentRendererRegistry {
  readonly #renderers = new Map<string, WindowContentRenderer>();
  readonly #listeners = new Set<() => void>();
  #revision = 0;
  #disposed = false;

  get size(): number { return this.#renderers.size; }

  get revision(): number { return this.#revision; }
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  register(mountKey: string, renderer: WindowContentRenderer): { dispose(): void; update(renderer: WindowContentRenderer): void } {
    this.#assertLive();
    if (!mountKey.trim()) throw new TypeError("Window content renderer keys must not be empty.");
    if (this.#renderers.has(mountKey)) throw new DuplicateWindowContentRendererError(mountKey);
    this.#renderers.set(mountKey, renderer);
    this.#publish();
    let live = true;
    return {
      update: (nextRenderer) => {
        if (!live || this.#renderers.get(mountKey) !== renderer) return;
        renderer = nextRenderer;
        this.#renderers.set(mountKey, nextRenderer);
        this.#publish();
      },
      dispose: () => {
        if (!live) return;
        live = false;
        if (this.#renderers.get(mountKey) === renderer) {
          this.#renderers.delete(mountKey);
          // A renderer registration is usually released from a fixture or
          // application effect cleanup. Its sibling WindowLayer may still be
          // completing that same React commit, so do not re-enter it with a
          // renderer-missing snapshot before the layer unmounts.
          this.#publishAfterTeardown();
        }
      },
    };
  }

  has(mountKey: string): boolean { return this.#renderers.has(mountKey); }

  render(mountKey: string, context: WindowContentRenderContext): ReactNode {
    this.#assertLive();
    const renderer = this.#renderers.get(mountKey);
    if (!renderer) throw new WindowContentRendererUnavailableError(mountKey);
    return renderer(context);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#renderers.clear();
    this.#publish();
    this.#listeners.clear();
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("WindowContentRendererRegistry is disposed.");
  }

  #publish(): void {
    this.#revision += 1;
    for (const listener of [...this.#listeners]) listener();
  }

  #publishAfterTeardown(): void {
    this.#revision += 1;
    queueMicrotask(() => {
      for (const listener of [...this.#listeners]) listener();
    });
  }
}
