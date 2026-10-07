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

import { expect, it } from 'vitest';
import { batchAFXFrameScheduler } from '../../../src/FX/AnimationFX/AFXFrameBatch';

it('shares one host frame while preserving timestamps, next-frame work and cancellation', () => {
  const host = new Map<number, (timestamp: number) => void>();
  let id = 0, reduced = false;
  const scheduler = batchAFXFrameScheduler({
    now: () => 123,
    requestFrame(callback) { const key = ++id; host.set(key, callback); return () => { host.delete(key); }; },
    get reducedMotion() { return reduced; }, suspended: false,
  });
  const calls: string[] = [];
  let cancelSecond = () => {};
  scheduler.requestFrame(time => {
    calls.push(`first:${time}`);
    cancelSecond();
    scheduler.requestFrame(next => calls.push(`next:${next}`));
  });
  cancelSecond = scheduler.requestFrame(() => calls.push('cancelled'));
  for (let i = 0; i < 1280; i++) scheduler.requestFrame(time => { expect(time).toBe(1000); });
  expect(host.size).toBe(1);
  const tick = (time: number) => { const entries = [...host]; host.clear(); for (const [, callback] of entries) callback(time); };
  tick(1000);
  expect(calls).toEqual(['first:1000']);
  expect(host.size).toBe(1);
  tick(1013.333);
  expect(calls).toEqual(['first:1000', 'next:1013.333']);
  expect(host.size).toBe(0);
  const cancel = scheduler.requestFrame(() => calls.push('disposed'));
  cancel(); cancel();
  expect(host.size).toBe(0);
  reduced = true;
  expect(scheduler.reducedMotion).toBe(true);
  expect(scheduler.now()).toBe(123);
});
