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

/** The host facilities a cooperative yield may use; a Window satisfies it. */
export interface BrowserYieldHost {
  readonly scheduler?: { readonly yield?: () => Promise<void> };
  readonly MessageChannel?: typeof MessageChannel;
  setTimeout(callback: () => void, delay: number): unknown;
}

/**
 * Cooperative yield for long main-thread work (text layout, preparation
 * loops): lets pending input and rendering tasks run, then resumes promptly.
 *
 * `setTimeout(0)` is clamped to at least 4 ms once nested, which made yield
 * latency, not work, dominate long layouts. Preference order:
 * `scheduler.yield()` (prioritised continuation), then a MessageChannel task
 * (unclamped; input is still serviced between tasks), then `setTimeout`.
 * An abort rejects immediately with the signal's reason; a continuation that
 * arrives afterwards is ignored.
 */
export function createBrowserHostYield(host: BrowserYieldHost): (signal: AbortSignal) => Promise<void> {
  const scheduler = host.scheduler;
  const Channel = host.MessageChannel;
  const wait: () => Promise<void> = typeof scheduler?.yield === "function"
    ? () => scheduler.yield!.call(scheduler)
    : typeof Channel === "function"
      ? () => new Promise<void>((resolve) => {
          const channel = new Channel();
          channel.port1.onmessage = () => {
            channel.port1.close();
            channel.port2.close();
            resolve();
          };
          channel.port2.postMessage(null);
        })
      : () => new Promise<void>((resolve) => { host.setTimeout(resolve, 0); });
  return (signal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    wait().then(() => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, (error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}
