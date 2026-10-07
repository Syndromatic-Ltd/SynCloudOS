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

import { beforeEach, afterEach, vi } from "vitest";

class MemoryStorage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

class RuntimePopStateEvent {
  readonly type: string;
  readonly state: unknown;

  constructor(type: string, init: { state?: unknown } = {}) {
    this.type = type;
    this.state = init.state ?? null;
  }
}

function createRuntimeWindow(pathname = "/") {
  const initialUrl = new URL(pathname, "http://127.0.0.1:5173");
  const location = {
    href: initialUrl.href,
    origin: "http://127.0.0.1:5173",
    pathname: initialUrl.pathname,
    search: initialUrl.search,
    hash: initialUrl.hash
  };

  const setHref = (nextHref: string | URL) => {
    const url = new URL(String(nextHref), location.origin);
    location.pathname = url.pathname;
    location.search = url.search;
    location.hash = url.hash;
    location.href = `${location.origin}${url.pathname}${url.search}${url.hash}`;
  };

  return {
    innerWidth: 1440,
    innerHeight: 900,
    location,
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    open: vi.fn(),
    matchMedia: vi.fn((query: string) => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false)
    })),
    history: {
      pushState: vi.fn((_state: unknown, _unused: string, url: string | URL) => {
        setHref(url);
      }),
      replaceState: vi.fn((_state: unknown, _unused: string, url: string | URL) => {
        setHref(url);
      })
    },
    setTimeout(handler: TimerHandler, timeout?: number, ...args: unknown[]) {
      return globalThis.setTimeout(handler, timeout, ...args);
    },
    clearTimeout(handle?: number) {
      globalThis.clearTimeout(handle);
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
    },
    cancelAnimationFrame(handle: number) {
      globalThis.clearTimeout(handle);
    },
    requestIdleCallback(callback: IdleRequestCallback) {
      return globalThis.setTimeout(() => callback({
        didTimeout: false,
        timeRemaining: () => 8
      }), 1) as unknown as number;
    },
    cancelIdleCallback(handle: number) {
      globalThis.clearTimeout(handle);
    }
  };
}

beforeEach(() => {
  if (typeof document !== "undefined" && typeof document.createElement === "function") return;

  vi.stubGlobal("window", createRuntimeWindow());
  vi.stubGlobal("navigator", {
    connection: { saveData: false },
    deviceMemory: 8,
    hardwareConcurrency: 8
  });
  vi.stubGlobal("PopStateEvent", RuntimePopStateEvent);
});

afterEach(() => {
  vi.useRealTimers();
});
