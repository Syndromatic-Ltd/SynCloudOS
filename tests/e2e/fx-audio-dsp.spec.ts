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

import { expect, test } from "playwright/test";

test("real AudioWorklet executes the canonical duration-preserving pitch node with bounded startup latency", async ({ page }) => {
  await page.goto("/");
  await page.mouse.click(8, 8);
  const result = await page.evaluate(async () => {
    const [{ BrowserAudioGraphOutput }, { AUFXAudioEngine }, { AUFXAudioFormat }, { AUFXAudioPCMBuffer }, { AUFXAudioPlayerNode }, { AUFXAudioTimePitchNode }] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput.ts"),
      import("/src/FX/AudioFX/AUFXAudioEngine.ts"),
      import("/src/FX/AudioFX/AUFXAudioFormat.ts"),
      import("/src/FX/AudioFX/AUFXAudioPCMBuffer.ts"),
      import("/src/FX/AudioFX/AUFXAudioPlayerNode.ts"),
      import("/src/FX/AudioFX/AUFXAudioTimePitchNode.ts"),
    ]);
    const context = new AudioContext({ sampleRate: 48_000 });
    await context.resume();
    if (context.state !== "running" || !context.audioWorklet || typeof AudioWorkletNode !== "function") throw new Error("Real AudioWorklet evidence is unavailable in this Chromium build.");
    const format = new AUFXAudioFormat(context.sampleRate, 1), output = new BrowserAudioGraphOutput(async () => context, new AbortController().signal, () => undefined);
    const engine = new AUFXAudioEngine(format, output), player = new AUFXAudioPlayerNode(format), pitch = new AUFXAudioTimePitchNode(format, { pitchSemitones: 12 });
    engine.attach(player); engine.attach(pitch); engine.connect(player, pitch); engine.connect(pitch, engine.mainMixerNode);
    const pcm = new AUFXAudioPCMBuffer(format, 4_800); pcm.frameLength = 4_800;
    for (let frame = 0; frame < pcm.frameLength; frame++) pcm.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / format.sampleRate) * 0.2);
    player.scheduleBuffer(pcm, 0, true); player.play();
    let callbacks = 0, peak = 0;
    let resolveSignal!: (value: { callbacks: number; peak: number; elapsedSeconds: number }) => void;
    const signal = new Promise<{ callbacks: number; peak: number; elapsedSeconds: number }>(resolve => { resolveSignal = resolve; });
    const started = performance.now();
    const tap = engine.installTap(pitch, buffer => {
      callbacks++;
      for (let frame = 0; frame < buffer.frameLength; frame++) peak = Math.max(peak, Math.abs(buffer.getSample(0, frame)));
      if (peak > 0.01) resolveSignal({ callbacks, peak, elapsedSeconds: (performance.now() - started) / 1_000 });
    });
    try {
      await engine.start();
      const observed = await Promise.race([signal, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Time-pitch AudioWorklet output timed out.")), 3_000))]);
      return { ...observed, algorithmLatency: pitch.algorithmLatency, running: engine.isRunning, lastError: engine.lastError ? String(engine.lastError) : null };
    } finally {
      tap.dispose(); engine.dispose(); await context.close();
    }
  });

  expect(result.running).toBe(true);
  expect(result.lastError).toBeNull();
  expect(result.peak).toBeGreaterThan(0.01);
  expect(result.callbacks).toBeGreaterThan(1);
  expect(result.algorithmLatency).toBeCloseTo(0.04, 3);
  expect(result.elapsedSeconds).toBeLessThan(1);
});
