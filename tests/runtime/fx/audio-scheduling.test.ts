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

import { expect, it, vi } from "vitest";
import { AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioPlayerNode } from "../../../src/FX/AudioFX/public";
const format = new AUFXAudioFormat(8000, 1);
function source() { const buffer = new AUFXAudioPCMBuffer(format, 4); buffer.frameLength = 4; for (let frame = 0; frame < 4; frame++) buffer.setSample(0, frame, frame + 1); return buffer; }

it("renders an owned frame segment and completes once with its render clock", async () => {
  const player = new AUFXAudioPlayerNode(format), buffer = source(), completion = vi.fn();
  const handle = player.scheduleSegment(buffer, 1, 2, 0, false, completion); buffer.setSample(0, 1, 99); player.play();
  const output = player.render([], 2, 0); expect(output.getSample(0, 0)).toBe(2); expect(output.getSample(0, 1)).toBe(3);
  await expect(handle.completed).resolves.toEqual({ status: "rendered", endSampleTime: 2 });
  handle.cancel(); player.stop(); expect(completion).toHaveBeenCalledOnce();
});

it("releases consumed buffers for long streams and settles stopped/seeked schedules", async () => {
  const player = new AUFXAudioPlayerNode(format); player.play();
  for (let index = 0; index < 300; index++) { const handle = player.scheduleBuffer(source(), player.currentTime); player.render([], 4, 0); await expect(handle.completed).resolves.toMatchObject({ status: "rendered" }); }
  const skipped = player.scheduleBuffer(source(), 1); player.seek(2); await expect(skipped.completed).resolves.toEqual({ status: "cancelled" });
  const stopped = player.scheduleBuffer(source(), 2, true); player.stop(); await expect(stopped.completed).resolves.toEqual({ status: "cancelled" });
});

it("reports graph render time at changed rate and tolerates a completion callback cancelling peers", async () => {
  const player = new AUFXAudioPlayerNode(format); player.playbackRate = 2;
  const first = player.scheduleBuffer(source(), 0, false, () => player.stop());
  const second = player.scheduleBuffer(source()); player.play(); player.render([], 2, 1);
  await expect(first.completed).resolves.toEqual({ status: "rendered", endSampleTime: 8002 });
  await expect(second.completed).resolves.toEqual({ status: "cancelled" });
});
