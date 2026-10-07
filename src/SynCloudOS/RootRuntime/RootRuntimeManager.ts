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

import type { RuntimeBrowserPort } from "../Runtime/runtimeInstanceTypes";

export interface RootRuntimeScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RootRuntimeManagerDependencies {
  readonly browser: RuntimeBrowserPort;
  readonly scheduler: RootRuntimeScheduler;
  startBrowserRouting(): void;
  stopBrowserRouting(): void;
  boot(initialPathname: string): void | Promise<void>;
  resolveAppearance(): string;
}
export type RootRuntimeStartupPhase = "booting" | "material" | "complete";

export function createRootRuntimeManager(dependencies: RootRuntimeManagerDependencies) {
  return {
    start(onStartupPhase: (phase: RootRuntimeStartupPhase) => void) {
      const location = dependencies.browser.getLocation();
      const initialPathname = `${location.pathname}${location.search}${location.hash}`;
      let stopped = false;
      dependencies.startBrowserRouting();
      const document = dependencies.browser.getDocument();
      if (document) document.documentElement.dataset.mode = dependencies.resolveAppearance();

      const materialTimer = dependencies.scheduler.setTimeout(() => {
        if (!stopped) onStartupPhase("material");
      }, 90);
      const bootTimer = dependencies.scheduler.setTimeout(() => {
        if (stopped) return;
        void Promise.resolve(dependencies.boot(initialPathname)).then(() => {
          if (!stopped) onStartupPhase("complete");
        });
      }, 560);

      return () => {
        if (stopped) return;
        stopped = true;
        dependencies.scheduler.clearTimeout(materialTimer);
        dependencies.scheduler.clearTimeout(bootTimer);
        dependencies.stopBrowserRouting();
      };
    },
  };
}
