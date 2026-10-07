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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — the public Vite plugin is a plain .mjs tooling module.
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "syncloudos-vite-assets-"));
  temporaryRoots.push(root);
  mkdirSync(resolve(root, "src/SynWare"), { recursive: true });
  const assets = resolve(root, "node_modules/@syndromatic/syncloudos/assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(resolve(assets, "worker.js"), "self.postMessage('ready');\n", "utf8");
  return root;
}

describe("SynCloudOS Vite packed SDK assets", () => {
  it.each([
    { cache: 'node_modules/.vite/sdk-receipt', base: '/', outside: false },
    { cache: '.cache/development', base: '/nested/showcase/', outside: false },
    { cache: '../shared-vite-cache', base: '/nested/showcase/', outside: true },
  ])('serves the packaged worker from the resolved cache directory: $cache', async ({ cache, base, outside }) => {
    const root = fixtureRoot();
    const cacheDir = resolve(root, cache);
    const plugin = synCloudOS({ webspringEntry: false });
    plugin.configResolved?.({ root, base, cacheDir });
    const mounted = new Map<string, (request: object, response: object, next: () => void) => void>();
    plugin.configureServer?.({
      middlewares: { use: (path: string, handler: (request: object, response: object, next: () => void) => void) => mounted.set(path, handler) },
      watcher: { add: vi.fn(), on: vi.fn(), once: vi.fn(), off: vi.fn() },
      moduleGraph: { getModuleById: vi.fn() }, ws: { send: vi.fn() }, httpServer: null,
    });
    const assetPath = outside ? `/@fs/${cacheDir.replaceAll('\\', '/')}/assets` : `/${cache}/assets`;
    const handler = mounted.get(`${base.replace(/\/$/, '')}${assetPath}`);
    expect(handler, 'The worker URL produced by the optimized module must have a matching asset mount.').toBeTypeOf('function');
    const next = vi.fn();
    const body: Buffer[] = [];
    const response = new Writable({ write(chunk, _encoding, callback) { body.push(Buffer.from(chunk)); callback(); } });
    const setHeader = vi.fn();
    Object.assign(response, { setHeader });
    const finished = new Promise<void>((resolveFinished, reject) => {
      response.on('finish', resolveFinished); response.on('error', reject);
    });
    handler!({ url: '/worker.js?v=receipt' }, response, next);
    await finished;
    expect(next).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('javascript'));
    expect(Buffer.concat(body).toString()).toBe("self.postMessage('ready');\n");
    handler!({ url: '/%2e%2e%2fpackage.json' }, response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("mounts optimized SDK assets beneath a configured deployment base", () => {
    const root = fixtureRoot();
    const plugin = synCloudOS({ webspringEntry: false });
    plugin.configResolved?.({ root, base: "/nested/showcase/" });

    const mounted: string[] = [];
    const watcher = {
      add: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
    };
    plugin.configureServer?.({
      middlewares: { use: (path: string) => { mounted.push(path); } },
      watcher,
      moduleGraph: { getModuleById: vi.fn() },
      ws: { send: vi.fn() },
      httpServer: null,
    });

    expect(mounted).toContain("/nested/showcase/node_modules/.vite/assets");
  });
});
