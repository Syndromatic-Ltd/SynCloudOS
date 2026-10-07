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

test("browser audio codec negotiation reflects real WebCodecs probes with portable WAV fallback", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createBrowserRuntimeEnvironment } = await import("/src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts");
    const environment = createBrowserRuntimeEnvironment();
    const audioFiles = environment.audioFiles;
    if (!audioFiles) throw new Error("Browser audio-file service is unavailable.");
    const globals = globalThis as typeof globalThis & {
      AudioDecoder?: { isConfigSupported(configuration: Record<string, unknown>): Promise<{ supported?: boolean }> };
      AudioEncoder?: { isConfigSupported(configuration: Record<string, unknown>): Promise<{ supported?: boolean }> };
    };
    if (!globals.AudioDecoder?.isConfigSupported || !globals.AudioEncoder?.isConfigSupported) throw new Error("WebCodecs audio configuration probes are unavailable in this Chromium build.");
    const configuration = { mimeType: "audio/webm", codec: "opus", sampleRate: 48_000, channelCount: 2 } as const;
    const [negotiated, directDecode, directEncode, wav] = await Promise.all([
      audioFiles.negotiateCodec(configuration, new AbortController().signal),
      globals.AudioDecoder.isConfigSupported({ codec: configuration.codec, sampleRate: configuration.sampleRate, numberOfChannels: configuration.channelCount }),
      globals.AudioEncoder.isConfigSupported({ codec: configuration.codec, sampleRate: configuration.sampleRate, numberOfChannels: configuration.channelCount }),
      audioFiles.negotiateCodec({ mimeType: "audio/wav", codec: "pcm-s16le", sampleRate: 48_000, channelCount: 2 }, new AbortController().signal),
    ]);
    return { negotiated, directDecode: directDecode.supported === true, directEncode: directEncode.supported === true, wav };
  });

  expect(result.negotiated.provenance).toBe("webcodecs-probe");
  expect(result.negotiated.decode).toBe(result.directDecode);
  expect(result.negotiated.encode).toBe(result.directEncode);
  expect(result.wav).toMatchObject({ decode: true, encode: true, provenance: "portable" });
});

test("real WebCodecs Opus export uses the shared WebM container and keeps the source cursor", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ createBrowserRuntimeEnvironment }, { AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer }, { VFXContainerReader }, { VFXWebMContainerBackend }] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts"),
      import("/src/FX/AudioFX/public.ts"),
      import("/src/FX/VideoFX/VFXContainerReader.ts"),
      import("/src/FX/VideoFX/backends/VFXWebMContainerBackend.ts"),
    ]);
    const service = createBrowserRuntimeEnvironment().audioFiles;
    if (!service) throw new Error("Browser audio-file service is unavailable.");
    const negotiated = await service.negotiateCodec({ mimeType: "audio/webm", codec: "opus", sampleRate: 48_000, channelCount: 1 }, new AbortController().signal);
    if (!negotiated.encode) throw new Error("This Chromium build has no Opus WebCodecs encoder.");
    const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 4_800);
    pcm.frameLength = pcm.frameCapacity;
    for (let frame = 0; frame < pcm.frameLength; frame++) pcm.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / 48_000) * 0.25);
    const file = new AUFXAudioFile(pcm);
    file.framePosition = 37;
    try {
      const exported = await service.exportFile(file, new AbortController().signal, { format: "opus-webm" });
      const bytes = new Uint8Array(await exported.data.arrayBuffer());
      const parsed = await new VFXContainerReader({ backend: new VFXWebMContainerBackend() }).read(bytes);
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(exported.data);
      try {
        await new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error("External WebM audio player timed out.")), 3_000);
          audio.addEventListener("loadedmetadata", () => { clearTimeout(deadline); resolve(); }, { once: true });
          audio.addEventListener("error", () => { clearTimeout(deadline); reject(new Error("External WebM audio player rejected the export.")); }, { once: true });
          audio.src = url;
          audio.load();
        });
        return { mimeType: exported.mimeType, fileType: exported.fileType, size: bytes.byteLength, cursor: file.framePosition, track: parsed.track, packets: parsed.chunks.length, externalReady: audio.readyState >= HTMLMediaElement.HAVE_METADATA };
      } finally { audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); }
    } finally { file.close(); }
  });
  expect(result).toMatchObject({ mimeType: "audio/webm", fileType: "webm", cursor: 37, track: { kind: "audio", codec: "opus", sampleRate: 48_000, channelCount: 1 }, externalReady: true });
  expect(result.packets).toBeGreaterThan(0);
  expect(result.size).toBeGreaterThan(64);
});

test("real WebCodecs Opus import demuxes through VideoFX and closes decoded AudioData", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer }, { encodeOpusWebM, decodeOpusWebM }] = await Promise.all([
      import("/src/FX/AudioFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserOpusWebMCodec.ts"),
    ]);
    const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 4_800);
    pcm.frameLength = pcm.frameCapacity;
    for (let frame = 0; frame < pcm.frameLength; frame++) pcm.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / 48_000) * 0.4);
    const file = new AUFXAudioFile(pcm);
    const nativeClose = AudioData.prototype.close;
    let closedData = 0;
    AudioData.prototype.close = function () { closedData++; return nativeClose.call(this); };
    try {
      const blob = await encodeOpusWebM(file, new AbortController().signal);
      const closedEncoderInputs = closedData;
      const decoded = await decodeOpusWebM(new Uint8Array(await blob.arrayBuffer()), new AbortController().signal);
      const peak = Math.max(...Array.from({ length: decoded.frameLength }, (_, frame) => Math.abs(decoded.getSample(0, frame))));
      return { frames: decoded.frameLength, sampleRate: decoded.format.sampleRate, channels: decoded.format.channelCount, peak, closedEncoderInputs, closedDecoderOutputs: closedData - closedEncoderInputs };
    } finally { AudioData.prototype.close = nativeClose; file.close(); }
  });
  expect(result.sampleRate).toBe(48_000);
  expect(result.channels).toBe(1);
  expect(result.frames).toBe(4_800);
  expect(result.peak).toBeGreaterThan(0.15);
  expect(result.closedEncoderInputs).toBeGreaterThan(0);
  expect(result.closedDecoderOutputs).toBeGreaterThan(0);
});

test("mounted audio-file client exports and reopens Opus WebM under its owner", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer }, { BrowserAudioFileAdapter }, { RuntimeAudioFileService }, { createMountedAudioFiles }] = await Promise.all([
      import("/src/FX/AudioFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioFileAdapter.ts"),
      import("/src/SynCloudOS/AudioFX/AudioFileService.ts"),
      import("/src/SynCloudOS/AppSDK/mountedAudioFiles.ts"),
    ]);
    const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 4_800);
    pcm.frameLength = pcm.frameCapacity;
    for (let frame = 0; frame < pcm.frameLength; frame++) pcm.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / 48_000) * 0.4);
    let bytes = new Uint8Array(AUFXAudioFile.encodeWAV(pcm));
    let mimeType = "audio/wav";
    const host = new RuntimeAudioFileService(new BrowserAudioFileAdapter({ loadBytes: async source => ({ bytes, mimeType, source }) }));
    const owner = new AbortController();
    const client = createMountedAudioFiles(host, owner.signal, () => ["audio.play"]);
    const opened = await client.openFile({ source: "/source.wav" });
    const exported = await client.exportFile(opened, undefined, { format: "opus-webm" });
    bytes = new Uint8Array(await exported.data.arrayBuffer());
    mimeType = exported.mimeType;
    const imported = await client.openFile({ source: "/encoded.webm" });
    const samples = imported.readFrames(imported.length);
    let peak = 0;
    for (let frame = 0; frame < samples.frameLength; frame++) peak = Math.max(peak, Math.abs(samples.getSample(0, frame)));
    const beforeRevoke = { exported: exported.fileType, decodedFrames: imported.length, peak, capabilities: client.capabilities() };
    owner.abort();
    return { ...beforeRevoke, openedClosed: !opened.isOpen, importedClosed: !imported.isOpen };
  });
  expect(result.exported).toBe("webm");
  expect(result.decodedFrames).toBe(4_800);
  expect(result.peak).toBeGreaterThan(0.15);
  expect(result.capabilities.encode).toContainEqual({ mimeType: "audio/webm", provenance: "observed-browser" });
  expect(result.capabilities.decode).toContainEqual({ mimeType: "audio/webm", provenance: "observed-browser" });
  expect(result.openedClosed).toBe(true);
  expect(result.importedClosed).toBe(true);
});

test("mounted streaming Opus export writes a playable WebM without allocating an audio file", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ AUFXAudioChunkStream, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXClockObservation }, { BrowserAudioFileAdapter }, { RuntimeAudioFileService }, { createMountedAudioFiles }, { VFXContainerReader }, { VFXWebMContainerBackend }] = await Promise.all([
      import("/src/FX/AudioFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioFileAdapter.ts"),
      import("/src/SynCloudOS/AudioFX/AudioFileService.ts"),
      import("/src/SynCloudOS/AppSDK/mountedAudioFiles.ts"),
      import("/src/FX/VideoFX/VFXContainerReader.ts"),
      import("/src/FX/VideoFX/backends/VFXWebMContainerBackend.ts"),
    ]);
    let released = 0;
    const source = new AUFXAudioChunkStream(async function* () {
      try {
        for (let index = 0; index < 5; index++) {
          const buffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 960);
          buffer.frameLength = 960;
          for (let frame = 0; frame < 960; frame++) buffer.setSample(0, frame, Math.sin(2 * Math.PI * 440 * (index * 960 + frame) / 48_000) * 0.25);
          yield { buffer, observation: new AUFXClockObservation({ samplePosition: index * 960, sampleRate: 48_000, domain: "render", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 0 }) };
        }
      } finally { released++; }
    });
    const fragments: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({ write(fragment) { fragments.push(fragment.slice()); } });
    const host = new RuntimeAudioFileService(new BrowserAudioFileAdapter({ loadBytes: async () => { throw new Error("Streaming export must not load a file."); } }));
    const owner = new AbortController();
    const audio = createMountedAudioFiles(host, owner.signal, () => ["audio.play"]);
    const exported = await audio.exportStream({ source, sink, format: "opus-webm" });
    const bytes = new Uint8Array(exported.byteLength);
    let offset = 0;
    for (const fragment of fragments) { bytes.set(fragment, offset); offset += fragment.byteLength; }
    const parsed = await new VFXContainerReader({ backend: new VFXWebMContainerBackend() }).read(bytes);
    owner.abort();
    return { exported, size: bytes.byteLength, track: parsed.track, packets: parsed.chunks.length, released, sinkUnlocked: !sink.locked, hasBlob: "data" in exported };
  });
  expect(result.exported).toMatchObject({ mimeType: "audio/webm", fileType: "webm" });
  expect(result.exported.byteLength).toBe(result.size);
  expect(result.track).toMatchObject({ kind: "audio", codec: "opus", sampleRate: 48_000, channelCount: 1 });
  expect(result.packets).toBeGreaterThan(0);
  expect(result.released).toBe(1);
  expect(result.sinkUnlocked).toBe(true);
  expect(result.hasBlob).toBe(false);
});

test("browser audio output exposes a real Web Audio timestamp as an estimated output observation", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ BrowserAudioGraphOutput }, { AUFXAudioFormat }] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput.ts"),
      import("/src/FX/AudioFX/AUFXAudioFormat.ts"),
    ]);
    const context = new AudioContext({ sampleRate: 48_000 });
    if (typeof context.getOutputTimestamp !== "function") throw new Error("Web Audio output timestamps are unavailable in this Chromium build.");
    const format = new AUFXAudioFormat(context.sampleRate, 1);
    const plan = Object.freeze({
      version: 1,
      sampleRate: format.sampleRate,
      channelCount: format.channelCount,
      outputId: 1,
      nodes: Object.freeze([{ id: 1, kind: "mixer" as const, inputs: Object.freeze([]), muted: false, volume: Object.freeze({ initial: 1, events: Object.freeze([]) }) }]),
      tapIds: Object.freeze([]),
    });
    const source = {
      snapshot: () => plan,
      subscribe: () => () => undefined,
      receive: () => undefined,
      renderFallback: () => { throw new Error("AudioWorklet was expected in browser output evidence."); },
    };
    const owner = new AbortController();
    const output = new BrowserAudioGraphOutput(async () => context, owner.signal, () => undefined);
    try {
      await output.start(format, source, () => undefined, new AbortController().signal);
      for (let attempt = 0; attempt < 50 && output.observeClock()?.hostAnchorSeconds == null; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      const direct = context.getOutputTimestamp();
      const observed = output.observeClock();
      if (!observed) throw new Error("Browser output clock observation was unavailable after start.");
      return { direct, observed, state: context.state };
    } finally {
      output.dispose();
      await context.close();
    }
  });

  expect(result.observed.domain).toBe("output");
  expect(result.observed.sampleRate).toBe(48_000);
  expect(result.observed.discontinuityGeneration).toBe(1);
  expect(result.observed.uncertaintySeconds).toBeGreaterThan(0);
  expect(result.observed.hostAnchorSeconds).not.toBeNull();
  expect(Math.abs(result.observed.hostAnchorSeconds! - result.direct.performanceTime / 1000)).toBeLessThan(0.25);
});

test("audio/media correlation records browser output-clock drift without hiding it in rounding", async ({ page }) => {
  await page.goto("/");
  await page.mouse.click(8, 8);
  const result = await page.evaluate(async () => {
    const [{ BrowserAudioGraphOutput }, { AUFXAudioFormat }, { AUFXAudioTime }, { AudioMediaClockBridge }, { MEFXMonotonicClock }] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput.ts"),
      import("/src/FX/AudioFX/AUFXAudioFormat.ts"),
      import("/src/FX/AudioFX/AUFXAudioTime.ts"),
      import("/src/SynCloudOS/AudioFX/AudioMediaClockBridge.ts"),
      import("/src/FX/MediaFX/MEFXClock.ts"),
    ]);
    const context = new AudioContext({ sampleRate: 48_000 });
    await context.resume();
    if (context.state !== "running") throw new Error(`AudioContext did not enter running state: ${context.state}`);
    const format = new AUFXAudioFormat(context.sampleRate, 1);
    const plan = Object.freeze({
      version: 1,
      sampleRate: format.sampleRate,
      channelCount: format.channelCount,
      outputId: 1,
      nodes: Object.freeze([{ id: 1, kind: "mixer" as const, inputs: Object.freeze([]), muted: false, volume: Object.freeze({ initial: 1, events: Object.freeze([]) }) }]),
      tapIds: Object.freeze([]),
    });
    const source = { snapshot: () => plan, subscribe: () => () => undefined, receive: () => undefined, renderFallback: () => { throw new Error("AudioWorklet expected."); } };
    const output = new BrowserAudioGraphOutput(async () => context, new AbortController().signal, () => undefined);
    const mediaClock = new MEFXMonotonicClock("browser:performance", 0.001, () => performance.now() / 1000);
    const bridge = new AudioMediaClockBridge({ sampleRate: format.sampleRate, mediaClock, observeAudioClock: () => output.observeClock() });
    try {
      await output.start(format, source, () => undefined, new AbortController().signal);
      // The first output timestamp can precede the browser's initial output buffer.
      for (let attempt = 0; attempt < 50 && (output.observeClock()?.hostAnchorSeconds == null || context.getOutputTimestamp().contextTime < 0.1); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      const correlation = bridge.reanchor();
      if (correlation.audioAnchor.hostAnchorSeconds === null) throw new Error("Output host anchor unavailable.");
      const anchorOffset = correlation.mediaAnchor.position.toSeconds() - correlation.audioAnchor.hostAnchorSeconds;
      await new Promise(resolve => setTimeout(resolve, 150));
      const current = output.observeClock();
      if (!current?.hostAnchorSeconds) throw new Error("Current output host anchor unavailable.");
      const mapped = bridge.toMediaTime(new AUFXAudioTime(current.samplePosition, format.sampleRate), correlation.generation);
      const currentOffset = mapped.toSeconds() - current.hostAnchorSeconds;
      return {
        driftSeconds: Math.abs(currentOffset - anchorOffset),
        uncertaintySeconds: correlation.uncertaintySeconds,
        startSample: correlation.audioAnchor.samplePosition,
        endSample: current.samplePosition,
        state: context.state,
      };
    } finally {
      bridge.dispose();
      mediaClock.dispose();
      output.dispose();
      await context.close();
    }
  });

  expect(result.state).toBe("running");
  expect(result.endSample).toBeGreaterThan(result.startSample);
  expect(result.uncertaintySeconds).toBeGreaterThan(0);
  expect(result.driftSeconds).toBeLessThan(0.02);
});

test("real AudioWorklet renders a negotiated silent edge and returns an owned tap", async ({ page }) => {
  await page.goto("/");
  await page.mouse.click(8, 8);
  const result = await page.evaluate(async () => {
    const [{ BrowserAudioGraphOutput }, { AUFXAudioEngine }, { AUFXAudioFormat }, { AUFXAudioPCMBuffer }, { AUFXAudioPlayerNode }] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput.ts"),
      import("/src/FX/AudioFX/AUFXAudioEngine.ts"),
      import("/src/FX/AudioFX/AUFXAudioFormat.ts"),
      import("/src/FX/AudioFX/AUFXAudioPCMBuffer.ts"),
      import("/src/FX/AudioFX/AUFXAudioPlayerNode.ts"),
    ]);
    const context = new AudioContext({ sampleRate: 48_000 });
    await context.resume();
    if (context.state !== "running" || !context.audioWorklet || typeof AudioWorkletNode !== "function") throw new Error("Real AudioWorklet evidence is unavailable in this Chromium build.");
    const outputFormat = new AUFXAudioFormat(context.sampleRate, 2), sourceFormat = new AUFXAudioFormat(44_100, 1);
    const output = new BrowserAudioGraphOutput(async () => context, new AbortController().signal, () => undefined);
    const engine = new AUFXAudioEngine(outputFormat, output), player = new AUFXAudioPlayerNode(sourceFormat);
    engine.attach(player);
    const edge = engine.connect(player, engine.mainMixerNode, { channelMap: [[1], [1]] });
    const pcm = new AUFXAudioPCMBuffer(sourceFormat, 441); pcm.frameLength = 441;
    player.scheduleBuffer(pcm, 0, true); player.play();
    let resolveTap!: (value: { frames: number; sampleRate: number; channels: number; peak: number }) => void;
    const tapped = new Promise<{ frames: number; sampleRate: number; channels: number; peak: number }>(resolve => { resolveTap = resolve; });
    const tap = engine.installTap(engine.mainMixerNode, buffer => {
      let peak = 0; for (let channel = 0; channel < buffer.format.channelCount; channel++) for (let frame = 0; frame < buffer.frameLength; frame++) peak = Math.max(peak, Math.abs(buffer.getSample(channel, frame)));
      resolveTap({ frames: buffer.frameLength, sampleRate: buffer.format.sampleRate, channels: buffer.format.channelCount, peak });
    });
    try {
      await engine.start();
      const observation = await Promise.race([tapped, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AudioWorklet tap timed out.")), 3_000))]);
      return { observation, sourceRate: edge.sourceFormat.sampleRate, negotiatedRate: edge.negotiatedFormat.sampleRate, running: engine.isRunning };
    } finally {
      tap.dispose(); engine.dispose(); await context.close();
    }
  });

  expect(result.running).toBe(true);
  expect(result.sourceRate).toBe(44_100);
  expect(result.negotiatedRate).toBe(48_000);
  expect(result.observation).toMatchObject({ sampleRate: 48_000, channels: 2, peak: 0 });
  expect(result.observation.frames).toBeGreaterThan(0);
  expect(result.observation.frames).toBeLessThanOrEqual(2_048);
});

test("mounted graph output keeps a 48 kHz worklet independent of 44.1 kHz system feedback", async ({ page }) => {
  await page.goto("/");
  await page.mouse.click(8, 8);
  const result = await page.evaluate(async () => {
    const [{ AUFXSystemFeedbackBus }, { AUFXAudioEngine, AUFXAudioFormat }] = await Promise.all([
      import("/src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus.ts"),
      import("/src/FX/AudioFX/public.ts"),
    ]);
    const contexts: AudioContext[] = [];
    const requested: Array<number | undefined> = [];
    const bus = new AUFXSystemFeedbackBus(options => {
      requested.push(options?.sampleRate);
      const context = new AudioContext({ sampleRate: options?.sampleRate ?? 44_100 });
      contexts.push(context);
      return context;
    });
    const owner = new AbortController();
    const output = bus.createGraphOutput(owner.signal);
    await bus.prepare(false);
    const engine = new AUFXAudioEngine(new AUFXAudioFormat(48_000, 1), output);
    try {
      await engine.start();
      const clock = engine.observeOutputClock();
      owner.abort();
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error("Graph context did not close.")), 3_000);
        const check = () => {
          if (contexts[1]?.state !== "closed") { setTimeout(check, 10); return; }
          clearTimeout(deadline);
          resolve();
        };
        check();
      });
      return { requested: requested.map(rate => rate ?? null), feedbackRate: contexts[0]!.sampleRate, graphRate: clock?.sampleRate,
        feedbackState: contexts[0]!.state, graphState: contexts[1]!.state };
    } finally {
      engine.dispose();
      bus.dispose();
    }
  });
  expect(result.requested).toEqual([null, 48_000]);
  expect(result).toMatchObject({ feedbackRate: 44_100, graphRate: 48_000, graphState: "closed" });
  expect(result.feedbackState).not.toBe("closed");
});
