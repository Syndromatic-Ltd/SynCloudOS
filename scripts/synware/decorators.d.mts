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

/** esbuild options that make it lower standard decorators. Spread into `esbuild` in a Vite or Vitest config. */
export const decoratorEsbuildOptions: { supported: { decorators: boolean } };

/** Adds the Babel parser plugins that read decorators and `accessor` fields. */
export function addDecoratorParserPlugins(babelOptions: { parserOpts?: { plugins?: unknown[] } }): void;

/** The Vite plugin hooks that make decorators work: esbuild lowering and the React plugin's parser. */
export function createDecoratorHooks(): {
  config(): { esbuild: { supported: { decorators: boolean } } };
  api: { reactBabel(babelOptions: { parserOpts?: { plugins?: unknown[] } }): void };
};
