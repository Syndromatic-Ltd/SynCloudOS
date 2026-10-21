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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { NSEThemeDefinition } from "../NSE/Appearance/NSEThemeDefinition";
import type { SynCloudOSLocaleBundleResourceInput } from "../SynCloudOS/LocaleServices/localeTypes";
import type { PreferencePaneDefinition } from "../SynCloudOS/Preferences";
import type { SynCloudOSHostContribution } from "./browserHostContributions";
import type { SynCloudOSAppModule } from "../SynCloudOS/BundleLoader/bundleTypes";
import type { SynCloudOSShellResources } from "../Webspring/WebspringController";
import type { WebspringDefinition, WebspringWidget } from "../Webspring/webspringTypes";

/** One application folder as the project discovered it: its derived manifest,
 * its lazy entry and the file URLs the manifest refers to. */
export interface SynCloudOSDiscoveredBundleDescriptor {
  readonly manifest: unknown;
  readonly modulePath: string;
  readonly loadModule: () => Promise<SynCloudOSAppModule>;
  readonly resourceUrls?: Readonly<Record<string, string>>;
  readonly localeResources?: SynCloudOSLocaleBundleResourceInput;
  readonly fontResourceUrls?: Readonly<Record<string, string>>;
}

/**
 * Everything a project's folders declare, as `virtual:syncloudos/project`
 * exports it: applications, preference panes, widgets, integrations and the
 * Webspring shell. A host that builds without the Vite plugin passes its own.
 */
export interface SynCloudOSProjectComposition {
  readonly themes?: readonly NSEThemeDefinition[];
  readonly bundles: readonly SynCloudOSDiscoveredBundleDescriptor[];
  readonly preferences: readonly PreferencePaneDefinition[];
  readonly widgets: readonly WebspringWidget[];
  readonly contributions: readonly SynCloudOSHostContribution[];
  /** The project's shell, already carrying the discovered panes and widgets. */
  readonly shell: WebspringDefinition | null;
  readonly shellResources: SynCloudOSShellResources;
}


/** Hosts without the discovery plugin can supply a composition explicitly.
 * The plugin injects its project through its browser-entry adapter. */
export const emptyProjectComposition: SynCloudOSProjectComposition = Object.freeze({
  themes: Object.freeze([]),
  bundles: Object.freeze([]),
  preferences: Object.freeze([]),
  widgets: Object.freeze([]),
  contributions: Object.freeze([]),
  shell: null,
  shellResources: Object.freeze({}),
});

