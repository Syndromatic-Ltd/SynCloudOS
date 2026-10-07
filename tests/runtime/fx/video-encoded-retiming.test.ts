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

import { expect, it, vi } from 'vitest';
import { MEFXSampleTimingInfo, MEFXTime } from '../../../src/FX/MediaFX/public';
import { VFXEncodedChunk } from '../../../src/FX/VideoFX/public';

const timing = (seconds: number) => new MEFXSampleTimingInfo({
  presentationTime: MEFXTime.finite(BigInt(seconds), 1),
  decodeTime: MEFXTime.finite(BigInt(seconds), 1),
  duration: MEFXTime.finite(1n, 24),
});

it('copies sample timing without copying the immutable compressed payload', () => {
  const source = Uint8Array.of(4, 5, 6);
  const chunk = new VFXEncodedChunk({ type: 'key', data: source, timing: timing(1), discardPaddingNanoseconds: 123 });
  source.fill(0);
  const copyData = vi.spyOn(VFXEncodedChunk.prototype, 'copyData');
  const retimed = chunk.copyWithNewTiming(timing(21));
  expect(copyData).not.toHaveBeenCalled();
  copyData.mockRestore();
  expect(retimed).not.toBe(chunk);
  expect(retimed).toBeInstanceOf(VFXEncodedChunk);
  expect(retimed.type).toBe('key');
  expect(retimed.discardPaddingNanoseconds).toBe(123);
  expect(retimed.timing.presentationTime.toSeconds()).toBe(21);
  expect(chunk.timing.presentationTime.toSeconds()).toBe(1);
  expect(retimed.byteLength).toBe(3);
  retimed.copyData().fill(0);
  expect([...chunk.copyData()]).toEqual([4, 5, 6]);
  expect([...retimed.copyData()]).toEqual([4, 5, 6]);
  expect(Object.isFrozen(retimed)).toBe(true);
  expect(() => chunk.copyWithNewTiming({} as MEFXSampleTimingInfo)).toThrow(TypeError);
});
