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

import { createDecoratorHooks } from "./decorators.mjs";
import { createApplicationHotReload } from "./hot-applications.mjs";

/**
 * What the `synCloudOS()` Vite plugin adds for class-based applications:
 * standard decorators (esbuild lowering and the React plugin's Babel parser) and
 * hot reload of application modules.
 *
 * Spread `config`, `api` and `transform` into the plugin object, and begin
 * `handleHotUpdate` with `if (toolchain.acceptsHotUpdate(context)) return undefined;`.
 */
export function createApplicationToolchain() {
  const decorators = createDecoratorHooks();
  const hot = createApplicationHotReload();
  return {
    config: decorators.config,
    api: decorators.api,
    transform: hot.transform,
    acceptsHotUpdate: hot.acceptsHotUpdate,
  };
}
