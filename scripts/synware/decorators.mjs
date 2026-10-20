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

/**
 * Standard (TC39) decorators in the toolchain.
 *
 * TypeScript compiles `@action` and `@observable accessor` without any flag
 * (the project does not set `experimentalDecorators`), but three tools in the
 * chain need telling:
 *
 * - esbuild leaves decorators in the output when it targets `esnext`, which is
 *   what the dev server and Vitest ask for; no browser or Node release parses
 *   them yet. Marking the `decorators` feature unsupported makes esbuild lower
 *   them for every target.
 * - `@vitejs/plugin-react` runs a Babel pass over `.tsx` files in the dev
 *   server (for Fast Refresh) with no `decorators` parser plugin, so a
 *   decorated class in a `.tsx` file would fail to parse.
 * - Vitest uses esbuild through Vite, so its config needs the first fix too.
 */

/** esbuild options that make it lower standard decorators. Spread into `esbuild` in a Vite or Vitest config. */
export const decoratorEsbuildOptions = { supported: { decorators: false } };

const parserPlugins = Object.freeze(["decorators", "decoratorAutoAccessors"]);

/**
 * Adds the Babel parser plugins that read decorators and `accessor` fields.
 * Has the shape of `@vitejs/plugin-react`'s `api.reactBabel` hook, which hands
 * every transform its Babel options to adjust.
 */
export function addDecoratorParserPlugins(babelOptions) {
  babelOptions.parserOpts ??= {};
  babelOptions.parserOpts.plugins ??= [];
  const plugins = babelOptions.parserOpts.plugins;
  for (const name of parserPlugins) {
    const present = plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);
    if (!present) plugins.push(name);
  }
}

/** The Vite plugin hooks that make decorators work: esbuild lowering and the React plugin's parser. */
export function createDecoratorHooks() {
  return {
    config() {
      return { esbuild: { supported: { decorators: false } } };
    },
    api: { reactBabel: addDecoratorParserPlugins },
  };
}
