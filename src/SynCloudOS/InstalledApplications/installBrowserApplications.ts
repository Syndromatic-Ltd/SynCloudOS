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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { BrowserInstalledApplicationAdapter } from "../PlatformAdapters/BrowserInstalledApplicationAdapter";
import type { InstalledApplicationConfiguration } from "./installedApplicationTypes";
/** Browser mount owns installation, not applications or FX. */
export function installBrowserApplications(runtime: SynCloudOSRuntime): void {
  const document = runtime.environment.browser.getDocument();
  const browserWindow = document?.defaultView;
  const value = document?.querySelector('meta[name="syncloudos-installation"]')?.getAttribute("content");
  if (!browserWindow || !value) return;
  const configuration = JSON.parse(value) as InstalledApplicationConfiguration;
  if (!configuration.manifests.length) return;
  const adapter = new BrowserInstalledApplicationAdapter(browserWindow, browserWindow.navigator, configuration);
  runtime.registerDisposalParticipant({ id: "installed-applications", prepare: () => ({ status: "ready", commit: () => adapter.dispose() }) });
  void adapter.start();
}
