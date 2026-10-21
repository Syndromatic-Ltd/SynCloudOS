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

import type { Plugin } from "vite";

export interface SynCloudOSViteOptions {
  /** Site-owned directory containing .app bundles. Defaults to src/SynWare. */
  appsDirectory?: string;
  /** Host-trusted static .scostheme packages; defaults to src/Themes. */
  themesDirectory?: string | false;
  /** Folder-discovered preference panes; defaults to src/Preferences. */
  preferencesDirectory?: string;
  /** Folder-discovered widgets; defaults to src/Widgets. */
  widgetsDirectory?: string;
  /** Host contributions; defaults to src/Integrations. */
  integrationsDirectory?: string;
  /** Bundle identifiers included in this build (case-insensitive); otherwise SYNCLOUDOS_APPLICATIONS or all. */
  applications?: readonly string[] | string;
  /** Site-owned Webspring definition, or false for a host without a shell. */
  webspringEntry?: string | false;
  /** Default-exported FontDeclaration; resource paths resolve beside this module. */
  typography?: string;
}

/** Discover site-owned bundles and serve installed package workers and artwork. */
export function synCloudOS(options?: SynCloudOSViteOptions): Plugin;
