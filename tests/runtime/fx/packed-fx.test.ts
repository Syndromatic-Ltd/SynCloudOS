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

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer } from "../../../scripts/synware/installed-consumer.mjs";
import { syntheticSensorDNG } from "../../fixtures/fx/synthetic-sensor-dng";

it("executes substantive FX operations from the built npm archive outside the repository", () => {
  const root = process.cwd();
  const consumer = createInstalledConsumer(root, "synware-fx-packed-");
  const fixture = consumer.root;
  const installedAssets = readdirSync(join(consumer.installed, "assets"));
  expect(installedAssets.filter((name) => /^image-processing\.worker-[A-Za-z0-9_-]+\.js$/u.test(name))).toHaveLength(1);
  expect(installedAssets.filter((name) => /^video-processing\.worker-[A-Za-z0-9_-]+\.js$/u.test(name))).toHaveLength(1);
  expect(installedAssets.filter((name) => /^pdf-document\.worker-[A-Za-z0-9_-]+\.js$/u.test(name))).toHaveLength(1);
  copyFileSync(resolve(root, "tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"), join(fixture, "font.ttf"));
  copyFileSync(resolve(root, "tests/fixtures/fx/fonts/notosansjp-vertical-subset.ttf"), join(fixture, "vertical-font.ttf"));
  writeFileSync(join(fixture, "sensor.dng"), syntheticSensorDNG());
  writeFileSync(join(fixture, "specimen.mjs"), `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GFXBitmapContext, GFXColour, GFXColourTransform, GFXDataProvider, GFXFloatImage, GFXGradient, GFXPath, GFXImage, GFXPDFContext, GFXPDFDocument } from "@syndromatic/syncloudos/fx/graphics";
import { AUFXAudioConnection, AUFXAudioEffectNode, AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioEngine, AUFXAudioPlayerNode, AUFXAudioTime, AUFXAudioTimePitchNode, toMediaTime, fromMediaTime } from "@syndromatic/syncloudos/fx/audio";
import { MEFXSampleTimingInfo, MEFXTime } from "@syndromatic/syncloudos/fx/media";
import { VFXContainerReader, VFXContainerWriter, VFXEncodedChunk } from "@syndromatic/syncloudos/fx/video";
import { VFXWebMContainerBackend } from "@syndromatic/syncloudos/fx/video/webm";
import { AFXAnimation, AFXBasicAnimation, AFXEmitterCell, AFXEmitterLayer, AFXGradientLayer, AFXReplicatorLayer, AFXTransform3D, normaliseAFXLayerActions } from "@syndromatic/syncloudos/fx/animation";
import { createAFXLayer } from "@syndromatic/syncloudos/sdk/animation-host";
import { HFXHapticEngine, HFXHapticPattern, HFXHapticPatternCodec } from "@syndromatic/syncloudos/fx/haptics";
import { createIFXTextImage, IFXAztecCodeDescriptor, IFXDetector, IFXImage, IFXImageResource, IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXGraphCodec, IFXImageAccumulator, IFXKernel, IFXModelAnalysisBackend, IFXProcessorDefinition, IFXQRCodeDescriptor, IFXRAWFilter, IFXRenderDestination, IFXSampler, IFXTileRenderDestination, IFXUnsupportedAnalysisError } from "@syndromatic/syncloudos/fx/image";
import { BrowserImageProcessingWorker, BrowserWebGPUImageProcessingBackend, createBrowserAcceleratedImageProcessingPipeline, createBrowserImageProcessingPipeline, createBrowserImageProcessingWorkerBackend, createBrowserWebGPUImageProcessingBackend } from "@syndromatic/syncloudos/browser";
import { MFXAttitude } from "@syndromatic/syncloudos/fx/motion";
import { TFXFont, TFXFontDescriptor, TFXAttributedString, TFXTypesetter, TFXGlyphDrawing, TFXLayoutCache, TFXTextContainer, TFX_VERTICAL_ORIENTATION_UNICODE_VERSION, tfxVerticalOrientationForGrapheme } from "@syndromatic/syncloudos/fx/text";
const packedTextCache = new TFXLayoutCache({ maximumBytes: 4096, maximumEntries: 4 });
const providerStorage = new Uint8Array([7, 8, 9]); let providerReleases = 0;
const callbackProvider = new GFXDataProvider({ length: providerStorage.length, read: (offset, length) => providerStorage.subarray(offset, offset + length), release: () => { providerReleases++; } });
const providerRead = callbackProvider.read(1, 2); providerRead[0] = 100;
assert.equal(providerStorage[1], 8); assert.throws(() => callbackProvider.read(2, 2), /bounds/i);
callbackProvider.release(); callbackProvider.release();
assert.equal(providerReleases, 1); assert.equal(callbackProvider.released, true);
assert.throws(() => callbackProvider.read(0, 1), /released/i);
const packedRaw = new IFXRAWFilter(new Uint8Array(readFileSync("sensor.dng")));
const packedImageProfile = new Uint8Array(132); new DataView(packedImageProfile.buffer).setUint32(0, 132); packedImageProfile.set([97,99,115,112], 36);
const packedImageHandle = { state: "ready", revision: 1, src: "memory:packed", intrinsicSize: { width: 1, height: 1 }, density: 1, sourceOrientation: 6, get sourceICCProfile() { return packedImageProfile.slice(); }, accessibleLabel: "Packed", renderingMode: "original", tintColour: null, capInsets: null, resizingMode: "stretch", ready: Promise.resolve(), subscribe: () => () => {}, release() {} };
const packedImageResource = new IFXImageResource({ resource: packedImageHandle, readPixels: async () => new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([1,2,3,255]) }), export: async () => new Uint8Array([1]) });
assert.equal(packedImageResource.sourceOrientation, 6); assert.deepEqual(packedImageResource.sourceICCProfile, packedImageProfile); packedImageResource.release();
assert.equal(packedRaw.metadata.cfaPattern, "rggb");
const packedDeveloped = await packedRaw.develop({ exposureEV: 1 });
assert.equal(packedDeveloped.provenance.source, "sensor-plane");
assert.equal(packedDeveloped.provenance.embeddedPreviewUsed, false);
assert.equal(packedDeveloped.image.descriptor.width, 2);
assert.equal(packedDeveloped.image.descriptor.height, 4);
assert.ok(packedDeveloped.image.pixel(0, 0).r > 0.3);
const packedTextContainer = new TFXTextContainer({ size: { width: 120, height: 40 } });
const packedTextLayout = Object.freeze({ fragments: Object.freeze([]), laidOutRange: Object.freeze({ location: 0, length: 0 }), truncated: false });
const packedTextKey = { revision: 1, attributedRevision: 0, fontGeneration: 0, text: "", font: { families: ["Prelude"], size: 16, weight: 400, style: "normal", stretch: "normal" }, locale: "en-GB", direction: "ltr", containers: [packedTextContainer] };
packedTextCache.store(packedTextKey, packedTextLayout);
assert.equal(packedTextCache.lookup(packedTextKey), packedTextLayout);
assert.ok(packedTextCache.diagnostics().liveBytes > 0);
packedTextCache.dispose();
assert.equal(typeof GFXPath, "function");
const graphicsDepth = new GFXBitmapContext({ width: 3, height: 1, scale: 2 });
assert.deepEqual(graphicsDepth.convertPointToDeviceSpace({ x: 1, y: 0.5 }), { x: 2, y: 1 });
const transparency = graphicsDepth.beginTransparencyGroup({ alpha: 0.5 });
graphicsDepth.fillPath(GFXPath.rect({ x: 0, y: 0, width: 2, height: 1 }), GFXColour.rgba(1, 0, 0));
graphicsDepth.fillPath(GFXPath.rect({ x: 1, y: 0, width: 2, height: 1 }), GFXColour.rgba(0, 1, 0));
graphicsDepth.endTransparencyGroup(transparency);
assert.equal(graphicsDepth.makeImage().pixel(2, 0).a, 128 / 255);
graphicsDepth.save();
const scopedGroup = graphicsDepth.beginTransparencyGroup({ alpha: 0.5 });
assert.throws(() => graphicsDepth.restore(), /matching save inside the transparency group/);
graphicsDepth.save();
graphicsDepth.fillPath(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }), GFXColour.rgba(1, 0, 0));
assert.throws(() => graphicsDepth.endTransparencyGroup(scopedGroup), /unbalanced.*state/);
graphicsDepth.restore();
graphicsDepth.endTransparencyGroup(scopedGroup);
graphicsDepth.restore();
assert.throws(() => graphicsDepth.restore(), /matching save/);
graphicsDepth.clear(); graphicsDepth.setBlendMode("copy"); graphicsDepth.fillPath(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }), GFXColour.rgba(1, 0, 0, 0.5));
assert.deepEqual([...graphicsDepth.makeImage().copyData().slice(0, 4)], [255, 0, 0, 128]); graphicsDepth.dispose();
const format = new AUFXAudioFormat(48000, 1);
const pcm = new AUFXAudioPCMBuffer(format, 16);
assert.equal(pcm.frameCapacity, 16);
pcm.frameLength = 16; pcm.setSample(0, 0, 0.5);
const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format);
engine.attach(player); engine.connect(player, engine.mainMixerNode); player.scheduleBuffer(pcm); player.play();
assert.equal((await engine.renderOffline(16)).getSample(0, 0), 0.5); engine.dispose();
const dspInput = new AUFXAudioPCMBuffer(format, 2048); dspInput.frameLength = 2048;
for (let frame = 0; frame < dspInput.frameLength; frame++) dspInput.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / format.sampleRate) * 0.2);
const stretched = new AUFXAudioTimePitchNode(format, { pitchSemitones: 0, timeScale: 1.25 }).processBuffer(dspInput);
assert.equal(stretched.frameLength, 2560); assert.ok(Number.isFinite(stretched.getSample(0, 1024)));
const notch = new AUFXAudioEffectNode(format, { type: "notch", frequency: 440, q: 4 }).render([dspInput], dspInput.frameLength, 0);
assert.ok(Math.abs(notch.getSample(0, 2047)) < 0.05);
const edgeSourceFormat = new AUFXAudioFormat(44100, 1), edgeOutputFormat = new AUFXAudioFormat(48000, 2);
const edgePCM = new AUFXAudioPCMBuffer(edgeSourceFormat, 441); edgePCM.frameLength = 441;
for (let frame = 0; frame < edgePCM.frameLength; frame++) edgePCM.setSample(0, frame, 0.25);
const edgeEngine = new AUFXAudioEngine(edgeOutputFormat), edgePlayer = new AUFXAudioPlayerNode(edgeSourceFormat); edgeEngine.attach(edgePlayer);
const edge = edgeEngine.connect(edgePlayer, edgeEngine.mainMixerNode, { channelMap: [[1], [1]] });
assert.ok(edge instanceof AUFXAudioConnection); assert.equal(edge.sourceBus, 0); assert.equal(edge.destinationBus, 0); assert.equal(edge.negotiatedFormat.sampleRate, 48000);
edgePlayer.scheduleBuffer(edgePCM, 0, true); edgePlayer.play(); const converted = await edgeEngine.renderOffline(480);
assert.equal(converted.frameLength, 480); assert.ok(Math.abs(converted.getSample(0, 479) - 0.25) < 1e-5); assert.ok(Math.abs(converted.getSample(1, 479) - 0.25) < 1e-5);
edgeEngine.disconnect(edge); assert.equal(edgeEngine.connections.length, 0); edgeEngine.dispose();
const streamEngine = new AUFXAudioEngine(format), streamPlayer = new AUFXAudioPlayerNode(format);
streamEngine.attach(streamPlayer); streamEngine.connect(streamPlayer, streamEngine.mainMixerNode); streamPlayer.scheduleBuffer(pcm); streamPlayer.play();
const streamed = [];
for await (const chunk of streamEngine.renderOfflineChunks(16, { chunkFrames: 5 })) streamed.push([chunk.buffer.frameLength, chunk.observation.samplePosition, chunk.observation.domain]);
assert.deepEqual(streamed, [[5,0,"render"],[5,5,"render"],[5,10,"render"],[1,15,"render"]]); streamEngine.dispose();
const wavHeader = AUFXAudioFile.encodeWAVHeader(format, 16), wavPCM = AUFXAudioFile.encodePCM16Chunk(pcm), wavBytes = new Uint8Array(wavHeader.byteLength + wavPCM.byteLength);
wavBytes.set(wavHeader); wavBytes.set(wavPCM, wavHeader.byteLength);
const decodedWav = AUFXAudioFile.decodeWAV(wavBytes.buffer);
assert.equal(decodedWav.frameLength, 16); assert.ok(Math.abs(decodedWav.getSample(0,0) - 0.5) < 1e-4);
const opusFragments = [];
const opusTrack = { id: 1, kind: "audio", codec: "opus", sampleRate: 48000, channelCount: 1, preSkip: 0, timescale: 1000000 };
const opusWriter = new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), track: opusTrack, sink: { write(bytes) { opusFragments.push(bytes.slice()); } } });
await opusWriter.write(new VFXEncodedChunk({ type: "key", data: Uint8Array.of(0xf8, 0xff), discardPaddingNanoseconds: 3_500_000, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 1000000), duration: MEFXTime.finite(20000n, 1000000) }) }));
await opusWriter.close();
const opusBytes = new Uint8Array(opusFragments.reduce((sum, part) => sum + part.byteLength, 0));
let opusOffset = 0; for (const part of opusFragments) { opusBytes.set(part, opusOffset); opusOffset += part.byteLength; }
const opusDemuxed = await new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumChunks: 1 }).read(opusBytes);
assert.deepEqual(opusDemuxed.track, opusTrack);
assert.deepEqual([...opusDemuxed.chunks[0].copyData()], [0xf8, 0xff]);
assert.equal(opusDemuxed.chunks[0].discardPaddingNanoseconds, 3_500_000);
const audioPosition = new AUFXAudioTime(96000, 48000), mediaPosition = toMediaTime(audioPosition);
assert.ok(mediaPosition instanceof MEFXTime); assert.equal(mediaPosition.toSeconds(), 2); assert.deepEqual(fromMediaTime(mediaPosition, 48000), audioPosition);
const animation = new AFXBasicAnimation({ targetId: "specimen", keyPath: "opacity", from: 0, to: 1, animation: new AFXAnimation({ duration: 1, timing: "linear" }) });
assert.equal(animation.sample(0.5), 0.5);
const packedScheduler = { now: () => 0, reducedMotion: false, suspended: false, requestFrame: () => () => {} };
const packedSnapshots = [];
const packedSurface = { supportedProperties: ["frame","transform","opacity","backgroundColour"], supportedContentKinds: ["image","gradient"], apply(snapshot) { packedSnapshots.push(snapshot); }, attach() {}, detach() {}, setMask() {}, dispose() {} };
const packedLayer = createAFXLayer(packedSurface, packedScheduler);
packedLayer.frame = { x: 0, y: 0, width: 4, height: 1 };
packedLayer.contents = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255,0,0,255,0,0,255,255]) });
packedLayer.contentsRect = { x: -0.5, y: 0, width: 2, height: 1 };
packedLayer.contentsCenter = { x: 0.25, y: 0, width: 0.5, height: 1 };
assert.deepEqual(packedLayer.model.contentsRect, { x: -0.5, y: 0, width: 2, height: 1 });
assert.equal(normaliseAFXLayerActions({ opacity: { duration: 0.25, timing: "linear" } }).opacity.duration, 0.25);
assert.equal(packedLayer.compositionCapability.state, "portable-owned");
const packedCompositionPixels = await packedLayer.render({ x: 0, y: 0, width: 4, height: 1 }, 1);
assert.equal(packedCompositionPixels.width, 4);
const packedCompositionTile = await packedLayer.render({ x: 0, y: 0, width: 2, height: 1 }, 1);
assert.equal(packedCompositionTile.width, 2);
const packedGradientSurface = { ...packedSurface, apply() {} };
const packedGradientLayer = createAFXLayer(AFXGradientLayer, packedGradientSurface, packedScheduler);
packedGradientLayer.gradient = new GFXGradient([{ offset: 0, colour: GFXColour.rgba(1,0,0) }, { offset: 1, colour: GFXColour.rgba(0,0,1) }]);
packedGradientLayer.colours = [GFXColour.rgba(0,1,0), GFXColour.rgba(1,1,0)];
packedGradientLayer.locations = [0.2, 0.8];
packedGradientLayer.startPoint = { x: 0.1, y: 0.2 }; packedGradientLayer.endPoint = { x: 0.9, y: 0.8 };
assert.deepEqual(packedGradientLayer.gradient.stops.map(stop => stop.offset), [0.2,0.8]);
assert.deepEqual(packedGradientLayer.gradient.geometry, { kind: "linear", start: { x: 0.1, y: 0.2 }, end: { x: 0.9, y: 0.8 } });
let packedSpatialTime = 0, packedSpatialFrame = null;
const packedSpatialScheduler = { now: () => packedSpatialTime, reducedMotion: false, suspended: false, requestFrame(callback) { packedSpatialFrame = callback; return () => { if (packedSpatialFrame === callback) packedSpatialFrame = null; }; }, subscribeState: () => () => {} };
const packedEmitterSnapshots = [];
const packedEmitterSurface = { supportedProperties: [], supportedContentKinds: ["emitter"], apply(snapshot) { packedEmitterSnapshots.push(snapshot); }, attach() {}, detach() {}, setMask() {}, dispose() {} };
const packedEmitterPixel = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255,255,255,255]) });
const packedChildCell = new AFXEmitterCell({ contents: packedEmitterPixel, birthRate: 4, lifetime: 2, velocity: 4, emissionLatitude: Math.PI / 2 });
const packedRootCell = new AFXEmitterCell({ contents: packedEmitterPixel, birthRate: 2, lifetime: 2, childCells: [packedChildCell] });
const packedEmitter = createAFXLayer(AFXEmitterLayer, packedEmitterSurface, packedSpatialScheduler);
packedEmitter.emitterMode = "points"; packedEmitter.projectionMode = "projective"; packedEmitter.projectionTransform = AFXTransform3D.perspective(200); packedEmitter.renderMode = "backToFront"; packedEmitter.emitterCells = [packedRootCell]; packedEmitter.startEmitting();
packedSpatialTime = 1; packedSpatialFrame?.(1);
const packedEmitterContent = packedEmitterSnapshots.at(-1).content;
assert.equal(packedEmitterContent.kind, "emitter"); assert.ok(packedEmitterContent.particles.length > 0); assert.equal(packedEmitterContent.particles[0].contents, packedEmitterPixel); assert.ok(Number.isFinite(packedEmitterContent.particles[0].zPosition)); packedEmitter.dispose();
const packedReplicationSnapshots = [];
const packedReplicationSurface = { supportedProperties: [], supportsReplication: true, replicationCapability: () => ({ projectiveDepth: true }), apply(snapshot) { packedReplicationSnapshots.push(snapshot); }, attach() {}, detach() {}, setMask() {}, dispose() {} };
packedSpatialTime = 0;
const packedReplicator = createAFXLayer(AFXReplicatorLayer, packedReplicationSurface, packedSpatialScheduler); packedReplicator.instanceCount = 2; packedReplicator.instanceDelay = 0.5; packedReplicator.projectionMode = "projective"; packedReplicator.instanceTransform = AFXTransform3D.perspective(300).multiply(AFXTransform3D.rotation(0.25, 1, 0, 0));
assert.equal(packedReplicator.preservesDepth, true); assert.equal(packedReplicationSnapshots.at(-1).replication.projectionMode, "projective");
const packedReplicaPlayback = packedReplicator.playInstances(new AFXBasicAnimation({ targetId: "packed-replica", keyPath: "opacity", from: 0, to: 1, animation: new AFXAnimation({ duration: 1, timing: "linear" }) }));
packedSpatialTime = 0.75; packedSpatialFrame?.(0.75);
assert.deepEqual(packedReplicationSnapshots.at(-1).replication.instances.map(instance => instance.opacity), [0.75, 0.25]);
packedReplicator.dispose(); assert.equal((await packedReplicaPlayback.finished).state, "cancelled");
packedGradientLayer.dispose(); packedLayer.dispose();
const pattern = new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 0.1, intensity: 0.5 }]);
assert.deepEqual(HFXHapticPatternCodec.decodeAHAP(HFXHapticPatternCodec.encodeAHAP(pattern)).events, pattern.events);
const hapticEvents = [], hapticCancels = [];
const hapticEngine = new HFXHapticEngine({ supported: true, audioState: "unavailable", capabilities: { amplitude: false, sharpness: false, timing: "approximate", amplitudeApproximation: "timing", dynamicParameters: "timing-approximation" }, trigger() {}, event(event) { hapticEvents.push(event); }, playerEvent(_owner, event) { hapticEvents.push(event); }, parameters() {}, playerParameters() {}, playerCancel(owner) { hapticCancels.push(owner); }, cancel() {}, dispose() {} });
assert.equal(hapticEngine.capabilities.fidelity.timing, "approximate"); assert.equal(hapticEngine.capabilities.fidelity.amplitude, "timing-approximation"); assert.equal(hapticEngine.capabilities.fidelity.sharpness, "unavailable");
const hapticPlayer = hapticEngine.makeAdvancedPlayer(pattern); hapticPlayer.start(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(hapticEvents[0].type, "continuous"); hapticPlayer.stop(); assert.equal(hapticCancels.length, 1); hapticEngine.dispose();
const pixels = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255,0,0,128]) });
const packedFloat = new GFXFloatImage({ width: 1, height: 1, sampleFormat: "float32", alpha: "straight", colourSpace: "linear-srgb", data: new Float32Array([2,-0.25,0.5,1]) });
assert.equal(packedFloat.descriptor.sampleFormat, "float32"); assert.equal(packedFloat.pixel(0,0).r, 2);
const packedColourTransform = new GFXColourTransform({ source: "linear-srgb", destination: "linear-srgb", gamutMapping: "preserve", toneMap: "none" });
assert.deepEqual(packedColourTransform.apply({ r: 2, g: -0.25, b: 0.5, a: 1 }), { r: 2, g: -0.25, b: 0.5, a: 1 });
const image = IFXImage.fromPixels(pixels), context = new IFXContext();
const rendered = await context.render(image.compositedOver(image));
assert.ok(rendered.image instanceof GFXImage);
assert.equal(rendered.image.pixel(0,0).r, 1); assert.ok(Math.abs(rendered.image.pixel(0,0).a - 192/255) < 1e-5);
context.dispose();
assert.equal(createBrowserImageProcessingWorkerBackend(), null);
const packedFallbackPipeline = createBrowserImageProcessingPipeline();
const packedFallbackDestination = new IFXRenderDestination(image.extent);
assert.equal((await packedFallbackPipeline.render(image, packedFallbackDestination)).info.backend, "cpu");
packedFallbackPipeline.dispose();
class PackedImageWorker {
  posts = []; messages = new Set(); errors = new Set(); terminated = 0;
  addEventListener(type, listener) { (type === "message" ? this.messages : this.errors).add(listener); }
  removeEventListener(type, listener) { (type === "message" ? this.messages : this.errors).delete(listener); }
  postMessage(message, transfer = []) { this.posts.push({ message, transfer }); }
  terminate() { this.terminated++; }
  respond(data) { for (const listener of this.messages) listener({ data }); }
}
const packedImageWorker = new PackedImageWorker();
const packedImageBackend = new BrowserImageProcessingWorker(packedImageWorker, { encoded: true });
const packedImageDestination = new IFXRenderDestination(image.extent);
const packedWorkerRender = packedImageBackend.render(image, packedImageDestination);
const packedRenderRequest = packedImageWorker.posts.at(-1).message;
const packedRenderBytes = new Uint8Array([255,0,0,128]);
packedImageWorker.respond({ id: packedRenderRequest.id, ok: true, kind: "pixels", value: { image: { width: 1, height: 1, bytesPerRow: 4, pixelFormat: "rgba8", alpha: "straight", colourSpace: "srgb", data: packedRenderBytes.buffer }, info: { width: 1, height: 1, sampleEvaluations: 1, cacheHits: 0, backend: "worker-cpu", tileCount: 1, logicalOutputBytes: 4, peakBytes: { output: 4, scratch: 0, cache: 0 }, work: 1, globalPreparationCount: 0, tileCacheHits: 0, tileCacheEvictions: 0 } } });
assert.equal((await packedWorkerRender).info.backend, "worker-cpu"); assert.equal(packedImageDestination.image.pixel(0,0).a, 128 / 255);
const packedFloatGraph = IFXImage.fromPixels(packedFloat);
const packedFloatWire = new IFXGraphCodec().encode(new IFXFilterGraph(packedFloatGraph));
assert.equal(packedFloatWire.version, 3);
assert.equal(new IFXGraphCodec().encode(new IFXFilterGraph(new IFXGraphCodec().decode(packedFloatWire).output)).version, 3);
const packedFloatDestination = new IFXRenderDestination(packedFloatGraph.extent, "linear-srgb", "straight");
const packedFloatPending = packedImageBackend.render(packedFloatGraph, packedFloatDestination);
const packedFloatRequest = packedImageWorker.posts.at(-1).message;
assert.equal(packedFloatRequest.graph.version, 3);
const packedFloatNode = packedFloatRequest.graph.nodes.find(node => node.kind === "pixels");
assert.equal(packedFloatNode.sampleFormat, "float32");
assert.deepEqual(Array.from(new Float32Array(packedFloatNode.data)), [2, -0.25, 0.5, 1]);
const packedFloatOutput = new Uint8Array([255,0,128,255]);
packedImageWorker.respond({ id: packedFloatRequest.id, ok: true, kind: "pixels", value: { image: { width: 1, height: 1, bytesPerRow: 4, pixelFormat: "rgba8", alpha: "straight", colourSpace: "linear-srgb", data: packedFloatOutput.buffer }, info: { width: 1, height: 1, sampleEvaluations: 1, cacheHits: 0, backend: "worker-cpu", tileCount: 1, logicalOutputBytes: 4, peakBytes: { output: 4, scratch: 0, cache: 0 }, work: 1, globalPreparationCount: 0, tileCacheHits: 0, tileCacheEvictions: 0 } } });
assert.equal((await packedFloatPending).info.backend, "worker-cpu");
const packedEncoded = packedImageBackend.renderEncoded(image, { format: "image/png", colourSpace: "srgb", orientation: "up" });
const packedEncodedRequest = packedImageWorker.posts.at(-1).message;
const packedBlob = new Blob([new Uint8Array([137,80,78,71])], { type: "image/png" });
packedImageWorker.respond({ id: packedEncodedRequest.id, ok: true, kind: "encoded", value: { blob: packedBlob, metadata: { width: 1, height: 1, mimeType: "image/png", colourSpace: "srgb", orientation: "up" } } });
assert.equal((await packedEncoded).metadata.mimeType, "image/png"); packedImageBackend.dispose(); assert.equal(packedImageWorker.terminated, 1);
assert.equal(typeof BrowserWebGPUImageProcessingBackend, "function");
assert.equal(typeof createBrowserAcceleratedImageProcessingPipeline, "function");
assert.equal(await createBrowserWebGPUImageProcessingBackend(), null);
let packedAcceleratedDisposals = 0;
const packedAcceleratedRequests = [];
const packedAcceleratedBackend = new BrowserWebGPUImageProcessingBackend({
  lost: new Promise(() => {}),
  async execute(request) {
    packedAcceleratedRequests.push(request);
    return new Uint8Array([191,159,127,255]);
  },
  dispose() { packedAcceleratedDisposals++; },
});
assert.deepEqual(packedAcceleratedBackend.capabilities.builtinOperations, ["exposure","invert"]);
assert.deepEqual(packedAcceleratedBackend.capabilities.pixelFormats, ["rgba8"]);
assert.deepEqual(packedAcceleratedBackend.capabilities.colourSpaces, ["linear-srgb"]);
assert.deepEqual(packedAcceleratedBackend.capabilities.alphaFormats, ["straight"]);
const packedLinearSource = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([64,96,128,255]) }));
const packedInvert = new IFXFilterRegistry().create("invert", {}).apply(packedLinearSource);
const packedAcceleratedDestination = new IFXRenderDestination(packedInvert.extent, "linear-srgb", "straight");
const packedAcceleratedResult = await packedAcceleratedBackend.render(packedInvert, packedAcceleratedDestination);
assert.equal(packedAcceleratedResult.info.backend, "accelerated");
assert.deepEqual([...packedAcceleratedResult.image.copyData()], [191,159,127,255]);
assert.deepEqual([...packedAcceleratedDestination.image.copyData()], [191,159,127,255]);
assert.deepEqual(packedAcceleratedRequests.map(request => request.operation.name), ["invert"]);
const packedUnsupportedAccelerated = new IFXFilterRegistry().create("sepia", { intensity: 1 }).apply(packedLinearSource);
assert.equal(packedAcceleratedBackend.canRender(packedUnsupportedAccelerated, new IFXRenderDestination(packedUnsupportedAccelerated.extent, "linear-srgb", "straight")), false);
packedAcceleratedBackend.dispose(); packedAcceleratedBackend.dispose(); assert.equal(packedAcceleratedDisposals, 1);
const packedFX13Registry = new IFXFilterRegistry();
const packedFX13Names = [
  "colorCrossPolynomial", "colorCubeWithColorSpace", "colorCubesMixedWithMask", "colorCurves", "documentEnhancer",
  "paletteCentroid", "palettize", "photoEffectChrome", "photoEffectFade", "photoEffectInstant", "photoEffectMono",
  "photoEffectNoir", "photoEffectProcess", "photoEffectTonal", "photoEffectTransfer", "thermal", "vignette", "vignetteEffect",
  "xRay", "hueSaturationValueGradient",
];
assert.equal(new Set(packedFX13Registry.names()).size, packedFX13Registry.names().length);
for (const name of packedFX13Names) assert.ok(packedFX13Registry.names().includes(name), "missing FX-13 filter " + name);
const packedFX13Source = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([64,128,192,128]) }));
const packedFX13IdentityCross = {
  redCoefficients: [0,1,0,0,0,0,0,0,0,0],
  greenCoefficients: [0,0,1,0,0,0,0,0,0,0],
  blueCoefficients: [0,0,0,1,0,0,0,0,0,0],
};
const packedFX13Cross = packedFX13Registry.create("colorCrossPolynomial", packedFX13IdentityCross).apply(packedFX13Source);
const packedFX13CrossWire = JSON.parse(JSON.stringify(new IFXFilterGraph(packedFX13Cross).serialize()));
const packedFX13CrossRestored = IFXFilterGraph.deserialize(packedFX13CrossWire).output;
const packedFX13Context = new IFXContext("linear-srgb", 20000);
const packedFX13SourceResult = await packedFX13Context.render(packedFX13Source);
const packedFX13CrossResult = await packedFX13Context.render(packedFX13CrossRestored);
assert.deepEqual([...packedFX13CrossResult.image.copyData()], [...packedFX13SourceResult.image.copyData()]);
const packedFX13Palette = IFXImage.fromPixels(new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([255,0,0,255,0,0,255,255]) }), { x: 8, y: 9 });
const packedFX13Tie = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([128,0,128,255]) }));
const packedFX13PaletteResult = await packedFX13Context.render(packedFX13Registry.create("palettize", { perceptual: false }).apply(packedFX13Tie, packedFX13Palette));
assert.deepEqual([...packedFX13PaletteResult.image.copyData()], [255,0,0,255]);
const packedFX13Noir = await packedFX13Context.render(packedFX13Registry.create("photoEffectNoir", { extrapolate: false }).apply(packedFX13Source));
assert.equal(packedFX13Noir.image.copyData()[3], 128);
assert.notDeepEqual([...packedFX13Noir.image.copyData().slice(0, 3)], [64,128,192]);
const packedFX13Gradient = packedFX13Registry.create("hueSaturationValueGradient", { colorSpace: "linear-srgb", dither: 0, radius: 4, softness: 0, value: 1 }).apply();
assert.deepEqual(packedFX13Gradient.extent, { kind: "finite", rect: { x: -4, y: -4, width: 8, height: 8 } });
packedFX13Context.dispose();
const packedGeometryNames = ["circularWrap","droste","glassDistortion","glassLozenge","lightTunnel","ninePartStretched","ninePartTiled","stretchCrop","torusLensDistortion","bicubicScaleTransform","edgePreserveUpsample","keystoneCorrectionCombined","keystoneCorrectionHorizontal","keystoneCorrectionVertical","perspectiveCorrection","perspectiveRotate","depthToDisparity","disparityToDepth"];
for (const name of packedGeometryNames) assert.ok(packedFX13Registry.names().includes(name), "missing geometry filter " + name);
const packedGeometryBytes = new Uint8Array(4 * 4 * 4);
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) packedGeometryBytes.set([x * 60, y * 60, 40, 255], (y * 4 + x) * 4);
const packedGeometrySource = IFXImage.fromPixels(new GFXImage({ width: 4, height: 4, alpha: "straight", colourSpace: "linear-srgb", data: packedGeometryBytes }));
const packedIdentityCorners = { topLeft: { x: 0, y: 0 }, topRight: { x: 4, y: 0 }, bottomRight: { x: 4, y: 4 }, bottomLeft: { x: 0, y: 4 } };
const packedCorrection = packedFX13Registry.create("perspectiveCorrection", { ...packedIdentityCorners, crop: false }).apply(packedGeometrySource);
const packedCorrectionWire = JSON.parse(JSON.stringify(new IFXFilterGraph(packedCorrection).serialize()));
const packedCorrectionRestored = IFXFilterGraph.deserialize(packedCorrectionWire).output;
const packedGeometryContext = new IFXContext("linear-srgb", 20000);
const packedGeometrySourceResult = await packedGeometryContext.render(packedGeometrySource);
const packedCorrectionResult = await packedGeometryContext.render(packedCorrectionRestored);
assert.deepEqual([...packedCorrectionResult.image.copyData()], [...packedGeometrySourceResult.image.copyData()]);
const packedBicubic = packedFX13Registry.create("bicubicScaleTransform", { scale: 2, aspectRatio: 1, parameterB: 1 / 3, parameterC: 1 / 3 }).apply(packedGeometrySource);
assert.deepEqual(packedBicubic.extent, { kind: "finite", rect: { x: 0, y: 0, width: 8, height: 8 } });
const packedNinePart = packedFX13Registry.create("ninePartStretched", { breakpoint0: { x: 1, y: 1 }, breakpoint1: { x: 3, y: 3 }, growAmount: { x: 2, y: 1 } }).apply(packedGeometrySource);
assert.deepEqual(packedNinePart.extent, { kind: "finite", rect: { x: 0, y: 0, width: 6, height: 5 } });
const packedDepth = IFXImage.fromPixels(new GFXFloatImage({ width: 1, height: 1, sampleFormat: "float32", alpha: "straight", colourSpace: "linear-srgb", data: new Float32Array([0.25,0.25,0.25,1]) }));
const packedCalibration = { focalLength: 4, baseline: 0.25, depthScale: 4, disparityScale: 4 };
const packedDisparity = packedFX13Registry.create("depthToDisparity", packedCalibration).apply(packedDepth);
assert.ok(Math.abs(new IFXSampler(packedDisparity).sample({ x: 0.5, y: 0.5 }, "nearest").r - 0.25) < 1e-6);
packedGeometryContext.dispose();
const packedTileNames = ["eightfoldReflectedTile","fourfoldReflectedTile","fourfoldRotatedTile","fourfoldTranslatedTile","glideReflectedTile","kaleidoscope","opTile","parallelogramTile","perspectiveTile","sixfoldReflectedTile","sixfoldRotatedTile","triangleKaleidoscope","triangleTile","twelvefoldReflectedTile"];
for (const name of packedTileNames) assert.ok(packedFX13Registry.names().includes(name), "missing tile filter " + name);
const packedPerspectiveTile = packedFX13Registry.create("perspectiveTile", packedIdentityCorners).apply(packedGeometrySource);
assert.deepEqual(packedPerspectiveTile.extent, { kind: "infinite" });
const packedPerspectiveTileWire = JSON.parse(JSON.stringify(new IFXFilterGraph(packedPerspectiveTile).serialize()));
const packedPerspectiveTileRestored = IFXFilterGraph.deserialize(packedPerspectiveTileWire).output;
const packedPerspectiveTileSampler = new IFXSampler(packedPerspectiveTileRestored);
assert.deepEqual(packedPerspectiveTileSampler.sample({ x: 0.5, y: 0.5 }, "nearest"), packedPerspectiveTileSampler.sample({ x: 4.5, y: 0.5 }, "nearest"));
assert.deepEqual(packedPerspectiveTileSampler.sample({ x: 0.5, y: 0.5 }, "nearest"), packedPerspectiveTileSampler.sample({ x: 0.5, y: -3.5 }, "nearest"));
const packedReflectedTile = packedFX13Registry.create("fourfoldReflectedTile", { acuteAngle: Math.PI / 2, angle: 0, center: { x: 0, y: 0 }, width: 4 }).apply(packedGeometrySource);
const packedInfiniteTileBounds = { kind: "finite", rect: { x: -8, y: -8, width: 16, height: 16 } };
const packedInfiniteTilePieces = [];
const packedInfiniteTileContext = new IFXContext("linear-srgb", 20000, { outputBytes: 64, scratchBytes: 4096, cacheBytes: 4096, work: 200000, tileSize: 4 });
const packedInfiniteTileDestination = new IFXTileRenderDestination(packedInfiniteTileBounds, { tileSize: 4, write: tile => void packedInfiniteTilePieces.push(tile.image) });
const packedInfiniteTileInfo = await packedInfiniteTileContext.renderTiles(packedReflectedTile, packedInfiniteTileDestination);
assert.equal(packedInfiniteTileInfo.tileCount, 16); assert.equal(packedInfiniteTilePieces.length, 16); assert.ok(packedInfiniteTileInfo.peakBytes.output <= 64);
packedInfiniteTileContext.dispose();
const packedTransitionNames = ["accordionFold","barsSwipe","copyMachine","disintegrateWithMask","flash","mod","pageCurl","pageCurlWithShadow","ripple"];
for (const name of packedTransitionNames) assert.ok(packedFX13Registry.names().includes(name), "missing transition filter " + name);
const packedTransitionExtent = { x: 0, y: 0, width: 4, height: 4 };
const packedTransitionTarget = IFXImage.constant(GFXColour.rgba(0,0,1)).cropped(packedTransitionExtent);
const packedTransitionBackside = IFXImage.constant(GFXColour.rgba(0,1,0)).cropped(packedTransitionExtent);
const packedTransitionShading = IFXImage.constant(GFXColour.rgba(0.5,0.5,0.5)).cropped(packedTransitionExtent);
const packedPageCurl = packedFX13Registry.create("pageCurl", { time: 0.5, angle: 0.25, extent: packedTransitionExtent, radius: 0.8 }).apply(packedGeometrySource, packedTransitionTarget, packedTransitionBackside, packedTransitionShading);
const packedPageCurlWire = JSON.parse(JSON.stringify(new IFXFilterGraph(packedPageCurl).serialize()));
const packedPageCurlRestored = IFXFilterGraph.deserialize(packedPageCurlWire).output;
const packedTransitionContext = new IFXContext("linear-srgb", 20000);
const packedPageCurlRendered = await packedTransitionContext.render(packedPageCurlRestored);
assert.equal(packedPageCurlRendered.image.copyData().length, 64);
assert.ok(new IFXSampler(packedPageCurlRestored).sample({ x: 1.5, y: 1.5 }, "nearest").g > 0);
const packedBarsTransition = packedFX13Registry.create("barsSwipe", { time: 0.55, angle: 0.2, barOffset: 0.35, width: 1 }).apply(packedGeometrySource, packedTransitionTarget);
assert.notDeepEqual(new IFXSampler(packedBarsTransition).sample({ x: 0.5, y: 0.5 }, "nearest"), new IFXSampler(packedBarsTransition).sample({ x: 3.5, y: 0.5 }, "nearest"));
packedTransitionContext.dispose();
const packedProceduralNames = ["blurredRectangle","roundedRectangleStroke","mesh","lenticularHalo","starShine","sunbeams","textImage","attributedTextImage","bloom","comicEffect","crystallize","depthOfField","edgeWork","gaborGradients","gloom","heightFieldFromMask","hexagonalPixellate","highlightShadowAdjust","lineOverlay","mix","pointillize","shadedMaterial","spotColor","spotLight","cmykHalftone","hatchedScreen","kMeans"];
for (const name of packedProceduralNames) assert.ok(packedFX13Registry.names().includes(name), "missing procedural filter " + name);
const packedProceduralSource = IFXImage.fromPixels(new GFXImage({ width: 4, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([255,0,0,255, 240,16,0,255, 0,16,240,255, 0,0,255,255]) }));
const packedPointillize = packedFX13Registry.create("pointillize", { center: { x: 0, y: 0 }, radius: 1, seed: 42 }).apply(packedProceduralSource);
const packedPointillizeWire = JSON.parse(JSON.stringify(new IFXFilterGraph(packedPointillize).serialize()));
const packedPointillizeRestored = IFXFilterGraph.deserialize(packedPointillizeWire).output;
const packedProceduralContext = new IFXContext("linear-srgb", 100000);
const [packedPointillizePixels, packedPointillizeRestoredPixels] = await Promise.all([
  packedProceduralContext.render(packedPointillize), packedProceduralContext.render(packedPointillizeRestored),
]);
assert.deepEqual([...packedPointillizeRestoredPixels.image.copyData()], [...packedPointillizePixels.image.copyData()]);
const packedCMYK = await packedProceduralContext.render(packedFX13Registry.create("cmykHalftone", { angle: 0.2, center: { x: 0, y: 0 }, grayComponentReplacement: 0.5, sharpness: 0.8, underColorRemoval: 0.5, width: 2 }).apply(packedProceduralSource));
assert.notDeepEqual([...packedCMYK.image.copyData()], [...packedPointillizePixels.image.copyData()]);
const packedMeans = IFXImage.fromPixels(new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([255,0,0,255, 0,0,255,255]) }));
const packedKMeans = packedFX13Registry.create("kMeans", { count: 2, passes: 3, perceptual: false }).apply(packedProceduralSource, packedMeans);
const packedKMeansPixels = await packedProceduralContext.render(packedKMeans);
assert.equal(packedKMeansPixels.image.width, 2); assert.ok(packedKMeansPixels.image.pixel(0,0).r > packedKMeansPixels.image.pixel(0,0).b); assert.ok(packedKMeansPixels.image.pixel(1,0).b > packedKMeansPixels.image.pixel(1,0).r);
packedProceduralContext.dispose();
const packedLargeData = new Uint8Array(16 * 8 * 4);
for (let index = 0; index < packedLargeData.length; index += 4) {
  packedLargeData[index] = 64; packedLargeData[index + 1] = 128; packedLargeData[index + 2] = 192; packedLargeData[index + 3] = 255;
}
const packedLargeImage = IFXImage.fromPixels(new GFXImage({ width: 16, height: 8, alpha: "straight", colourSpace: "srgb", data: packedLargeData }));
const packedBoundedContext = new IFXContext("linear-srgb", 20000, { outputBytes: 64, scratchBytes: 1024, cacheBytes: 1024, work: 200000, tileSize: 4 });
await assert.rejects(packedBoundedContext.render(packedLargeImage), /output.*budget/i);
const packedTiles = [];
const packedTileDestination = new IFXTileRenderDestination(packedLargeImage.extent, { tileSize: 4, write: tile => void packedTiles.push(tile.image) });
const packedTileInfo = await packedBoundedContext.renderTiles(packedLargeImage, packedTileDestination);
assert.equal(packedTileInfo.logicalOutputBytes, 512); assert.equal(packedTileInfo.tileCount, 8); assert.equal(packedTiles.length, 8);
assert.ok(packedTileInfo.peakBytes.output <= 64); assert.ok(packedTileInfo.peakBytes.cache <= 1024);
packedBoundedContext.dispose();
const packedAccumulator = new IFXImageAccumulator({ x: 0, y: 0, width: 2, height: 20 });
const packedAccumulatorContext = new IFXContext("linear-srgb", 20000);
const packedOlderUpdate = packedAccumulator.update(IFXImage.constant(GFXColour.rgba(1,0,0)).cropped(packedAccumulator.extent), packedAccumulatorContext);
const packedNewerUpdate = packedAccumulator.update(IFXImage.constant(GFXColour.rgba(0,1,0)).cropped(packedAccumulator.extent), packedAccumulatorContext);
await assert.rejects(packedOlderUpdate, { name: "AbortError" }); await packedNewerUpdate;
const packedAccumulated = await packedAccumulatorContext.render(packedAccumulator.image);
assert.equal(packedAccumulated.image.pixel(1,10).g, 1); packedAccumulator.dispose(); packedAccumulatorContext.dispose();
const packedProcessor = new IFXProcessorDefinition({
  id: "custom:packedGain", version: 1, inputCount: 1,
  parameters: { gain: { type: "number", default: 1, minimum: 0, maximum: 4 } },
  output: { kind: "first-input" }, roi: { kind: "identity" },
  portableProgram: { kind: "kernel", version: 1, program: { inputCount: 1, instructions: [
    { op: "sample", input: 0 }, { op: "constant", value: [1,1,1,1] }, { op: "multiply", left: 0, right: 1 },
  ], output: 2 }, bindings: [{ parameter: "gain", instruction: 1, components: [0,1,2] }] },
  evaluate(point, access, parameters) { const sample = access.sample(0, point); return { r: sample.r * parameters.gain, g: sample.g, b: sample.b, a: sample.a }; },
});
const packedProcessorRegistry = new IFXFilterRegistry(); packedProcessorRegistry.registerProcessor(packedProcessor);
const packedCodec = new IFXGraphCodec(packedProcessorRegistry);
const packedProcessorGraph = new IFXFilterGraph(packedProcessor.apply({ gain: 0.5 }, packedLargeImage));
const packedProcessorWire = JSON.parse(JSON.stringify(packedCodec.encode(packedProcessorGraph)));
assert.equal(packedProcessorWire.version, 2); assert.equal(packedProcessorWire.nodes.at(-1).processor.id, "custom:packedGain");
assert.equal(packedProcessorWire.nodes.at(-1).processor.program.kind, "kernel");
const packedProcessorContext = new IFXContext("linear-srgb", 20000);
const packedProcessorOutput = await packedProcessorContext.render(packedCodec.decode(packedProcessorWire).output);
assert.ok(packedProcessorOutput.image.pixel(0,0).r > 0.05 && packedProcessorOutput.image.pixel(0,0).r < 0.2);
const packedPortableOutput = await packedProcessorContext.render(new IFXGraphCodec().decode(packedProcessorWire).output);
assert.deepEqual([...packedPortableOutput.image.copyData()], [...packedProcessorOutput.image.copyData()]);
const packedDecisionKernel = new IFXKernel({ inputCount: 1, instructions: [
  { op: "sample", input: 0 },
  { op: "constant", value: [0.9,0.9,0.9,0.9] },
  { op: "compare", relation: "greater", left: 0, right: 1 },
  { op: "constant", value: [1,0,0,1] },
  { op: "constant", value: [0,0,1,1] },
  { op: "select", condition: 2, whenTrue: 3, whenFalse: 4 },
], output: 5 });
const packedDecisionOutput = await packedProcessorContext.render(packedDecisionKernel.apply(packedLargeImage));
assert.equal(packedDecisionOutput.image.pixel(0,0).b, 1); packedProcessorContext.dispose();
const barcodeRegistry = new IFXFilterRegistry();
const qrDescriptor = new IFXQRCodeDescriptor([0x40,0xf5,0x46,0x86,0x96,0xe6,0xb2,0x04,0x46,0x96,0x66,0x66,0x57,0x26,0x56,0xe7,0x40,0xec,0x11], 1, 4, "L");
const descriptorQR = barcodeRegistry.create("barcodeGenerator", { barcodeDescriptor: qrDescriptor.toData() }).apply();
const rawQR = barcodeRegistry.create("qrCodeGenerator", { message: [83,121,110], correctionLevel: "L" }).apply();
const code128 = barcodeRegistry.create("code128BarcodeGenerator", { message: [65,66], barcodeHeight: 24, quietSpace: 10 }).apply();
const aztecDescriptor = new IFXAztecCodeDescriptor([83,121,110,45,65,122,116,101,99], { correctionLevel: 23, layers: 2, compactStyle: true, quietSpace: 2 });
const descriptorAztec = barcodeRegistry.create("barcodeGenerator", { barcodeDescriptor: aztecDescriptor.toData() }).apply();
const pdf417 = barcodeRegistry.create("pdf417BarcodeGenerator", { message: [83,121,110,45,80,68,70], correctionLevel: 2, dataColumns: 3, rows: 8, compactStyle: false, quietSpace: 2 }).apply();
const dataMatrix = barcodeRegistry.create("dataMatrixCodeGenerator", { message: [83,121,110,45,68,77], rows: 14, columns: 14, quietSpace: 2 }).apply();
assert.deepEqual(descriptorQR.extent, { kind: "finite", rect: { x: 0, y: 0, width: 21, height: 21 } });
assert.deepEqual(rawQR.extent, { kind: "finite", rect: { x: 0, y: 0, width: 21, height: 21 } });
assert.deepEqual(code128.extent, { kind: "finite", rect: { x: 0, y: 0, width: 77, height: 24 } });
assert.equal(descriptorAztec.extent.kind, "finite"); assert.equal(pdf417.extent.kind, "finite"); assert.equal(dataMatrix.extent.kind, "finite");
const restoredQR = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(descriptorQR).serialize()))).output;
const restoredAztec = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(descriptorAztec).serialize()))).output;
const barcodeContext = new IFXContext("linear-srgb", 100000);
const [descriptorPixels, rawPixels, code128Pixels, restoredPixels, aztecPixels, restoredAztecPixels, pdf417Pixels, dataMatrixPixels] = await Promise.all([
  barcodeContext.render(descriptorQR), barcodeContext.render(rawQR), barcodeContext.render(code128), barcodeContext.render(restoredQR),
  barcodeContext.render(descriptorAztec), barcodeContext.render(restoredAztec), barcodeContext.render(pdf417), barcodeContext.render(dataMatrix),
]);
assert.equal(descriptorPixels.image.pixel(0,0).r, 0); assert.equal(descriptorPixels.image.pixel(7,0).r, 1);
assert.equal(rawPixels.image.width, 21); assert.equal(rawPixels.image.pixel(0,0).a, 1);
assert.equal(code128Pixels.image.width, 77); assert.equal(code128Pixels.image.pixel(0,0).r, 1); assert.equal(code128Pixels.image.pixel(10,0).r, 0);
for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++)
  assert.deepEqual(restoredPixels.image.pixel(x,y), descriptorPixels.image.pixel(x,y));
assert.deepEqual([...restoredAztecPixels.image.copyData()], [...aztecPixels.image.copyData()]);
assert.ok([...pdf417Pixels.image.copyData()].some((value, index) => index % 4 !== 3 && value === 0));
assert.ok([...dataMatrixPixels.image.copyData()].some((value, index) => index % 4 !== 3 && value === 0));
barcodeContext.dispose();
const packedDetector = new IFXDetector();
assert.deepEqual(packedDetector.capability("rectangle"), { name: "rectangle", state: "available", version: 1, backend: "portable-analysis" });
assert.equal(packedDetector.capability("face").state, "unsupported");
const packedRectangleBytes = new Uint8Array(16 * 12 * 4).fill(255);
for (let y = 3; y < 9; y++) for (let x = 4; x < 13; x++) {
  const offset = (y * 16 + x) * 4;
  packedRectangleBytes[offset] = 0; packedRectangleBytes[offset + 1] = 0; packedRectangleBytes[offset + 2] = 0;
}
const packedRectangleFeatures = await packedDetector.detect(IFXImage.fromPixels(new GFXImage({ width: 16, height: 12, alpha: "opaque", colourSpace: "srgb", data: packedRectangleBytes })), { features: ["rectangle"] });
assert.equal(packedRectangleFeatures.length, 1); assert.deepEqual(packedRectangleFeatures[0].bounds, { x: 4, y: 3, width: 9, height: 6 });
const packedQRFeatures = await packedDetector.detect(rawQR, { features: ["qr"] });
assert.equal(packedQRFeatures.length, 1); assert.equal(packedQRFeatures[0].kind, "qr"); assert.equal(packedQRFeatures[0].payload, "Syn");
await assert.rejects(packedDetector.detect(rawQR, { features: ["face"] }), IFXUnsupportedAnalysisError);
const packedModelBytes = new Uint8Array(new Float32Array([12,0,0,0,-6]).buffer);
const packedModelDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", packedModelBytes));
const packedModelHash = Array.from(packedModelDigest, value => value.toString(16).padStart(2, "0")).join("");
const packedFaceModel = Object.freeze({ format: "ifx-linear-pixel-v1", id: "packed-face-mask", version: 1, purpose: "face-mask", provenance: Object.freeze({ source: "generated installed acceptance fixture", license: "CC0-1.0" }), heads: Object.freeze([Object.freeze({ channels: 1, activation: "sigmoid" })]), data: Object.freeze(Array.from(packedModelBytes)), sha256: packedModelHash });
const packedLearnedDetector = new IFXDetector({ backends: [new IFXModelAnalysisBackend({ face: { model: packedFaceModel, threshold: 0.9, minimumPixels: 4 } })] });
const packedLearnedBytes = new Uint8Array(8 * 8 * 4); for (let index = 0; index < 64; index++) packedLearnedBytes[index * 4 + 3] = 255;
for (let y = 2; y < 5; y++) for (let x = 3; x < 6; x++) packedLearnedBytes[(y * 8 + x) * 4] = 255;
const packedLearnedFeatures = await packedLearnedDetector.detect(IFXImage.fromPixels(new GFXImage({ width: 8, height: 8, alpha: "opaque", colourSpace: "srgb", data: packedLearnedBytes })), { features: ["face"] });
assert.deepEqual(packedLearnedFeatures[0].bounds, { x: 3, y: 2, width: 3, height: 3 });
const packedPersonModel = Object.freeze({ ...packedFaceModel, id: "packed-person-mask", purpose: "person-segmentation", qualityLevel: "balanced" });
const packedPersonMask = new IFXFilterRegistry().create("personSegmentation", { model: packedPersonModel, qualityLevel: "balanced" }).apply(IFXImage.fromPixels(new GFXImage({ width: 2, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([255,0,0,255, 0,0,0,255]) })));
const packedPersonContext = new IFXContext(); const packedPersonResult = await packedPersonContext.render(packedPersonMask);
assert.ok(packedPersonResult.image.pixel(0,0).r > 0.97); assert.ok(packedPersonResult.image.pixel(1,0).r < 0.2); packedPersonContext.dispose();
const attitude = new MFXAttitude({ x: 0, y: 0, z: 0, w: 1 });
assert.ok(Math.abs(attitude.yaw) < 1e-9);
const font = await TFXFont.create(new Uint8Array(readFileSync("font.ttf")), new TFXFontDescriptor({ size: 18 }));
const run = font.shape("office");
assert.ok(run.glyphs.length < 6 && run.glyphs.every(g => g.id > 0));
const setter = new TFXTypesetter(new TFXAttributedString("hello world", [{ start: 0, end: 11, font }]));
const line = setter.createLine(0, 11);
assert.ok(line.width > 0);
const outlines = TFXGlyphDrawing.pathsForLine(line, { x: 10, y: 30 });
assert.ok(outlines.every(item => item.path instanceof GFXPath));
const packedTextImage = createIFXTextImage("office", font, { scaleFactor: 1, padding: 1 });
const packedTextWire = JSON.parse(JSON.stringify(new IFXFilterGraph(packedTextImage).serialize()));
assert.equal(packedTextWire.nodes.at(-1).name, "textImage");
assert.equal(packedTextWire.nodes.at(-1).parameters.paths.length, font.shape("office").glyphs.length);
const pdf = new GFXPDFContext({ title: "Packed shaped glyphs" });
pdf.beginPage({ width: 240, height: 100 });
pdf.drawGlyphOutlines(outlines);
pdf.endPage();
const document = await GFXPDFDocument.open(await pdf.finish());
assert.equal(document.pageCount, 1);
assert.equal(document.page(0).mediaBox.width, 240);
document.dispose();
font.dispose();
const packedTextRestored = IFXFilterGraph.deserialize(packedTextWire).output;
const packedTextContext = new IFXContext("linear-srgb", 200000);
const [packedTextPixels, packedTextRestoredPixels] = await Promise.all([packedTextContext.render(packedTextImage), packedTextContext.render(packedTextRestored)]);
assert.deepEqual([...packedTextRestoredPixels.image.copyData()], [...packedTextPixels.image.copyData()]);
assert.ok([...packedTextPixels.image.copyData()].some((value, index) => index % 4 === 3 && value > 0)); packedTextContext.dispose();
const verticalFont = await TFXFont.create(new Uint8Array(readFileSync("vertical-font.ttf")), new TFXFontDescriptor({ size: 20 }));
const verticalText = "日12本";
const verticalLine = new TFXTypesetter(new TFXAttributedString(verticalText, [{ start: 0, end: verticalText.length, font: verticalFont, language: "ja", verticalOrientation: "auto", textCombine: "digits2" }]), "ltr", "vertical").createLine(0, verticalText.length);
assert.match(TFX_VERTICAL_ORIENTATION_UNICODE_VERSION, /^17\./u);
assert.equal(tfxVerticalOrientationForGrapheme("日"), "upright");
assert.equal(tfxVerticalOrientationForGrapheme("A"), "sideways");
assert.equal(verticalLine.runs.find(run => run.start === 1 && run.end === 3)?.verticalPresentation, "combined");
assert.ok(verticalLine.textPositionForUTF16Offset(2).graphemeBoundary);
assert.equal(verticalLine.offsetForStringIndex(3).primary - verticalLine.offsetForStringIndex(1).primary, verticalFont.descriptor.size);
verticalFont.dispose();
await assert.rejects(import("@syndromatic/syncloudos/nse/animation"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
console.log("FX packed operations passed");
`);
  const output = execFileSync(process.execPath, ["specimen.mjs"], { cwd: fixture, encoding: "utf8", stdio: "pipe" });
  expect(output).toContain("FX packed operations passed");
  const receiptDirectory = resolve(root, ".artifacts/expanded-fx");
  mkdirSync(receiptDirectory, { recursive: true });
  writeFileSync(resolve(receiptDirectory, "packed-specimen-location.txt"), fixture + "\n");
  writeFileSync(resolve(receiptDirectory, "packed-specimen.json"), JSON.stringify({
    schemaVersion: 2,
    kind: "installed-seven-fx-substantive",
    commit: consumer.manifest.commit,
    archiveSha256: consumer.archiveSha256,
    integrity: consumer.integrity,
    sourceSha256: consumer.sourceSha256,
    resourcesSha256: consumer.resourcesSha256,
    consumerRoot: fixture,
    families: ["animation", "graphics", "image", "text", "audio", "haptics", "motion"],
    passed: true,
  }, null, 2) + "\n");
}, 120000);
