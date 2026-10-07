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

import { createSynCloudOSFacade, type SynCloudOSRuntime } from "../SynCloudOS";
import {
  clearDefaultSynCloudOSRuntime,
  getDefaultSynCloudOSRuntime,
  setDefaultSynCloudOSRuntime,
} from "../Runtime/defaultRuntime";

type SynCloudOSDeveloperWindow = Window & {
  SynCloudOS?: Record<string, any>;
  NSE?: unknown;
};

export interface SynCloudOSDeveloperExposure {
  dispose(): void;
}

/**
 * Development globals are a presentation of the same cached facade used by
 * production callers.  The only added member is Developer; no service is
 * swapped for a console-only adapter or process-global fallback.
 */
export function exposeSynCloudOS(
  runtime: SynCloudOSRuntime,
  suppliedFacade: Record<string, any> = createSynCloudOSFacade(runtime),
  target: SynCloudOSDeveloperWindow | null = runtime.environment.browser.getWindow() as SynCloudOSDeveloperWindow | null,
): SynCloudOSDeveloperExposure | null {
  if (!(import.meta.env.DEV || import.meta.env.VITE_SYNCLOUDOS_CONSOLE === "true") || !target) return null;

  const facade = createSynCloudOSFacade(runtime) as Record<string, any>;
  if (suppliedFacade !== facade) {
    throw new Error("SynCloudOS developer exposure requires the canonical runtime facade.");
  }
  const previousGlobal = target.SynCloudOS;
  const previousDeveloper = facade.Developer;
  let nsePromise: Promise<unknown> | null = null;
  const loadNSE = () => {
    nsePromise ??= import("../../NSE/NSE").then((module) => {
      target.NSE = module.NSE;
      return module.NSE;
    });
    return nsePromise;
  };

  facade.Developer = {
    loadNSE,
    getConformanceSnapshot: () => runtime.inspector.getConformanceSnapshot(),
    loadDeveloperGlobals: async () => ({
      NSE: await loadNSE(),
      Inspector: runtime.inspector.getConformanceSnapshot(),
    }),
  };
  if (getDefaultSynCloudOSRuntime() !== runtime) setDefaultSynCloudOSRuntime(runtime);
  target.SynCloudOS = facade;
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (target.SynCloudOS === facade) target.SynCloudOS = previousGlobal;
      if (previousDeveloper === undefined) delete facade.Developer;
      else facade.Developer = previousDeveloper;
      clearDefaultSynCloudOSRuntime(runtime);
    },
  };
}
