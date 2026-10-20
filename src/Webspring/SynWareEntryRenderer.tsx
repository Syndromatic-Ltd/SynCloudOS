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

import { LoadingSpinner } from "../NSE/NSE";
import type { SynCloudOSAppInfo, SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import { SynWareRuntimeMount } from "../SynCloudOS/AppSDK/SynWareRuntimeMount";
import { SynWareWindowChromeBridge } from "./WindowLayer/WindowChromeBridge";

export interface SynWareEntryRendererProps {
  readonly runtime: SynCloudOSRuntime;
  readonly app: SynCloudOSAppInfo;
  readonly responderId: string;
  readonly windowControllerId?: string;
  readonly isLoading: boolean;
  readonly loadingClassName: string;
  readonly loadingLabel: string;
  readonly loadingPackageLabel: string;
  readonly missingComponentLabel: string;
}

/** The only production path from a loaded SynWare definition to its callable
 * root. Stage and physical-window surfaces deliberately share this renderer,
 * so neither can revive component defaults or inject kernel runtime props. */
export function SynWareEntryRenderer({
  runtime,
  app,
  responderId,
  windowControllerId,
  isLoading,
  loadingClassName,
  loadingLabel,
  missingComponentLabel,
}: SynWareEntryRendererProps) {
  if (isLoading) {
    return (
      <div className={`${loadingClassName} webspring-loading-state`} aria-busy="true">
        <div className="webspring-loading-state-content">
          <LoadingSpinner label={loadingLabel} variant="dark" />
          <p>{loadingLabel}…</p>
        </div>
      </div>
    );
  }
  const definition = runtime.bundles.getLoadedBundle(app.bundleIdentifier)?.definition;
  if (!definition) {
    return (
      <div className={loadingClassName}>
        <p>{missingComponentLabel}</p>
      </div>
    );
  }
  const Root = definition.root;
  const windowChrome = definition.windowChrome;
  return (
    <SynWareRuntimeMount
      runtime={runtime}
      app={app}
      responderId={responderId}
      {...(windowControllerId === undefined ? {} : { windowControllerId })}
    >
      <Root />
      {windowChrome && windowControllerId !== undefined ? (
        <SynWareWindowChromeBridge
          runtime={runtime}
          windowChrome={windowChrome}
          windowControllerId={windowControllerId}
        />
      ) : null}
    </SynWareRuntimeMount>
  );
}
