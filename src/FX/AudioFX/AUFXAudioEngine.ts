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

import { AUFXAudioFormat } from "./AUFXAudioFormat";
import { AUFXAudioNode } from "./AUFXAudioNode";
import { AUFXAudioMixerNode } from "./AUFXAudioMixerNode";
import { AUFXAudioConnection, type AUFXAudioConnectionOptions } from "./AUFXAudioConnection";
import { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { AUFXAudioPlayerNode } from "./AUFXAudioPlayerNode";
import type { AUFXAudioTimelineCommand, AUFXAudioTimelineReceipt, AUFXAudioTimelineTransport } from "./AUFXAudioTimelineTransport";
import { AUFXAudioChunkStream, type AUFXAudioChunkStreamOptions } from "./AUFXAudioChunkStream";
import { AUFXClockObservation } from "./AUFXClockObservation";
import type { AUFXAudioGraphOutput, AUFXAudioRealtimeInput, AUFXAudioRealtimeSource } from "./AUFXAudioGraphOutput";
import { getAUFXRealtimeNode, type AUFXRenderEvent, type AUFXRenderPlan } from "./AUFXAudioRenderPlan";
import { AUFXAudioRenderRuntime, AUFX_RENDER_MAX_FRAMES, validateAUFXRenderPlan } from "./AUFXAudioRenderRuntime.js";
export interface AUFXAudioTap { dispose(): void; }
const nodeOwners = new WeakMap<AUFXAudioNode, AUFXAudioEngine>();
type AUFXGraphSnapshot = Readonly<{
  connections: Set<AUFXAudioConnection>;
  taps: Map<AUFXAudioNode, Set<(buffer: AUFXAudioPCMBuffer) => void>>;
  nodes: Set<AUFXAudioNode>;
  nodeIds: Map<AUFXAudioNode, number>;
}>;

/** Deterministic portable graph. Audible playback remains owned by the scoped host client. */
export class AUFXAudioEngine {
  readonly mainMixerNode: AUFXAudioMixerNode;
  private readonly nodes = new Set<AUFXAudioNode>();
  private readonly graphConnections = new Set<AUFXAudioConnection>();
  private readonly taps = new Map<AUFXAudioNode, Set<(buffer: AUFXAudioPCMBuffer) => void>>();
  private readonly nodeIds = new Map<AUFXAudioNode, number>();
  private readonly planListeners = new Set<(plan: AUFXRenderPlan) => void>();
  private nodeSubscriptions: (() => void)[] = [];
  private nextNodeId = 1;
  private nextConnectionId = 1;
  private planVersion = 0;
  private offlineRuntime: AUFXAudioRenderRuntime | null = null;
  private liveFallbackRuntime: AUFXAudioRenderRuntime | null = null;
  private disposed = false;
  private rendering = false;
  private renderAbort: AbortController | null = null;
  private sampleTime = 0;
  private discontinuityGeneration = 0;
  private offlineStreamOwner: object | null = null;
  private timelineMutation = false;
  private readonly timelinePlayers = new Set<AUFXAudioPlayerNode>();
  private readonly timelineReleases = new Set<() => void>();
  #output: AUFXAudioGraphOutput | null;
  #live: AbortController | null = null;
  #lastError: unknown = null;
  #liveInputSignature: string | null = null;
  readonly #inputCapability: object | null;
  get isRunning() { return this.#live !== null; }
  get lastError() { return this.#lastError; }
  get connections(): readonly AUFXAudioConnection[] { return Object.freeze([...this.graphConnections]); }
  observeOutputClock() { this.assertActive(); return this.#output?.observeClock?.() ?? null; }

  constructor(readonly format: AUFXAudioFormat, output?: AUFXAudioGraphOutput, inputCapability?: object) { this.#output = output ?? null; this.#inputCapability = inputCapability ?? null; this.mainMixerNode = new AUFXAudioMixerNode(format); this.attach(this.mainMixerNode); }
  private assertActive() { if (this.disposed) throw new Error("Audio engine is disposed."); if (this.rendering) throw new Error("Audio graph is rendering."); }
  private nodeForId(id: number) { for (const [node, candidate] of this.nodeIds) if (candidate === id) return node; return null; }

  async start(signal?: AbortSignal) {
    this.assertActive(); signal?.throwIfAborted(); if (!this.#output) throw new Error("Live audio output is unavailable."); if (this.#live) throw new Error("Audio engine is already running.");
    const initialPlan = this.compilePlan(); validateAUFXRenderPlan(initialPlan); const inputSignature = this.inputSignature(initialPlan);
    const controller = new AbortController(); this.#live = controller; this.#lastError = null; this.#liveInputSignature = inputSignature; this.refreshSubscriptions();
    const abort = () => controller.abort(signal?.reason); signal?.addEventListener("abort", abort, { once: true });
    const stopped = (error?: unknown) => {
      signal?.removeEventListener("abort", abort);
      if (this.#live !== controller) return;
      this.#live = null; this.#liveInputSignature = null; this.#lastError = error ?? null;
      for (const release of [...this.timelineReleases]) { try { release(); } catch { /* Revoke every timeline after output loss. */ } }
      this.clearSubscriptions();
    };
    try { await this.#output.start(this.format, this.realtimeSource(controller.signal), stopped, controller.signal); } catch (error) { stopped(error); throw error; }
  }
  stop() { const live = this.#live; this.#live = null; this.#liveInputSignature = null; for (const release of [...this.timelineReleases]) { try { release(); } catch (error) { this.#lastError = error; } } try { live?.abort(); } catch (error) { this.#lastError = error; } try { this.#output?.stop(); } catch (error) { this.#lastError = error; } this.clearSubscriptions(); }

  private realtimeSource(signal: AbortSignal): AUFXAudioRealtimeSource { return Object.freeze({ snapshot: () => this.compilePlan(), subscribe: (listener: (plan: AUFXRenderPlan) => void) => { this.planListeners.add(listener); return () => this.planListeners.delete(listener); }, receive: (event: AUFXRenderEvent) => this.receiveRealtime(event), renderFallback: (frames: number) => this.renderLiveBlock(frames, signal), inputs: (plan: AUFXRenderPlan) => this.realtimeInputs(plan) }); }
  private realtimeInputs(plan: AUFXRenderPlan): readonly AUFXAudioRealtimeInput[] { return Object.freeze(plan.nodes.filter(node => node.kind === "input").map(node => { const binding = getAUFXRealtimeNode(this.nodeForId(node.id)!); if (!binding?.input || binding.input.capability !== this.#inputCapability) throw new DOMException("Audio input does not belong to this mounted graph.", "SecurityError"); return Object.freeze({ nodeId: node.id, inputIndex: node.inputIndex, ...binding.input }); })); }
  private receiveRealtime(event: AUFXRenderEvent) {
    if (event.type === "tap") { const node = this.nodeForId(event.nodeId); if (!node) return; const frames = event.channels[0]?.length ?? 0, pcm = new AUFXAudioPCMBuffer(node.format, frames); pcm.frameLength = frames; for (let channel = 0; channel < node.format.channelCount; channel++) for (let frame = 0; frame < frames; frame++) pcm.setSample(channel, frame, event.channels[channel]![frame]!); for (const tap of this.taps.get(node) ?? []) tap(pcm.copy()); return; }
    if (event.type === "state") { this.sampleTime = Math.max(this.sampleTime, event.sampleTime); for (const state of event.players) { const node = this.nodeForId(state.id); if (node) getAUFXRealtimeNode(node)?.receive?.({ ...event, players: [state] }); } return; }
    const node = this.nodeForId(event.nodeId); if (node) getAUFXRealtimeNode(node)?.receive?.(event);
  }
  private clearSubscriptions() { for (const unsubscribe of this.nodeSubscriptions.splice(0)) { try { unsubscribe(); } catch { /* Observer teardown is isolated. */ } } this.planListeners.clear(); }
  private refreshSubscriptions() { for (const unsubscribe of this.nodeSubscriptions.splice(0)) { try { unsubscribe(); } catch (error) { this.#lastError = error; } } for (const node of this.nodes) { const binding = getAUFXRealtimeNode(node); if (binding) { try { this.nodeSubscriptions.push(binding.subscribe(() => this.publishPlan())); } catch (error) { this.#lastError = error; } } } }
  private publishPlan() { if (!this.#live || this.timelineMutation) return; try { const plan = this.compilePlan(); for (const listener of [...this.planListeners]) listener(plan); } catch (error) { this.#lastError = error; this.stop(); } }

  /** One exclusive lease per selected player; implicit selection is single-player only. */
  createTimelineTransport(selected?: readonly AUFXAudioPlayerNode[], signal?: AbortSignal): AUFXAudioTimelineTransport {
    this.assertActive(); signal?.throwIfAborted();
    if (this.offlineStreamOwner) throw new DOMException("An offline chunk stream owns the current graph snapshot.", "InvalidStateError");
    if (this.timelineReleases.size >= 8) throw new DOMException("Audio timeline transport limit exceeded.", "QuotaExceededError");
    const initial = this.compilePlan();
    const available = initial.nodes.filter(node => node.kind === "player").map(node => this.nodeForId(node.id) as AUFXAudioPlayerNode);
    const players = selected ? [...selected] : available;
    if (!selected && players.length > 1) throw new DOMException("Select the timeline audio players explicitly in a multi-player graph.", "NotSupportedError");
    if (new Set(players).size !== players.length || players.some(player => !(player instanceof AUFXAudioPlayerNode) || !available.includes(player)))
      throw new DOMException("Timeline players must belong to and be connected in this engine.", "InvalidAccessError");
    if (players.some(player => this.timelinePlayers.has(player))) throw new DOMException("An audio player already has a timeline transport.", "InvalidStateError");
    const lease = new AbortController();
    const retention: (() => void)[] = [];
    try { for (const player of players) retention.push(player.retainTimelineSchedules()); }
    catch (error) { for (const release of retention) release(); throw error; }
    let pending = false, released = false;
    for (const player of players) this.timelinePlayers.add(player);
    const dispose = () => {
      if (released) return;
      released = true; lease.abort(); signal?.removeEventListener("abort", dispose); this.timelineReleases.delete(dispose);
      for (const release of retention) { try { release(); } catch { /* Continue every retained schedule lease. */ } }
      for (const player of players) { this.timelinePlayers.delete(player); try { player.pause(); } catch { /* Continue independent player teardown. */ } }
    };
    this.timelineReleases.add(dispose); signal?.addEventListener("abort", dispose, { once: true });
    if (signal?.aborted || this.disposed) { dispose(); throw new DOMException("Timeline acquisition was revoked.", "AbortError"); }
    const apply = (command: AUFXAudioTimelineCommand): AUFXAudioTimelineReceipt | Promise<AUFXAudioTimelineReceipt> => {
      lease.signal.throwIfAborted(); this.assertActive();
      if (this.offlineStreamOwner) throw new DOMException("An offline chunk stream owns the current graph snapshot.", "InvalidStateError");
      if (pending) throw new DOMException("Await the pending audio timeline transition before another transition.", "InvalidStateError");
      if (!players.length) throw new DOMException("No audio player is bound to this clock-only coordinator.", "NotSupportedError");
      const planBefore = this.compilePlan();
      if (players.some(player => nodeOwners.get(player) !== this || !planBefore.nodes.some(node => node.id === this.nodeIds.get(player))))
        throw new DOMException("A timeline player was detached.", "InvalidAccessError");
      // Stateful effects retain pre-seek audio. Do not claim a flush contract
      // until those nodes expose a selective reset/acknowledgement boundary.
      if (planBefore.nodes.some(node => !["player", "mixer", "connection"].includes(node.kind)))
        throw new DOMException("Timeline transport currently supports player/mixer graphs without stateful DSP or live input.", "NotSupportedError");
      if (planBefore.nodes.some(node => node.kind === "connection" && node.sourceSampleRate !== node.sampleRate))
        throw new DOMException("Timeline transport cannot flush a sample-rate converter's retained history.", "NotSupportedError");
      if (command.kind !== "seek" && players.some(player => player.currentTime !== players[0]!.currentTime))
        throw new DOMException("Seek the selected timeline players to a common content position first.", "InvalidStateError");
      if ((command.kind === "play" || command.kind === "rate") && (!Number.isFinite(command.rate) || command.rate <= 0 || command.rate > 4))
        throw new DOMException("Timeline playback supports positive rates through 4; reverse playback is unavailable.", "NotSupportedError");
      if (command.kind === "seek" && (!Number.isFinite(command.positionSeconds) || command.positionSeconds < 0 || players.some(player => command.positionSeconds * player.format.sampleRate > Number.MAX_SAFE_INTEGER)))
        throw new RangeError("Timeline seek must be a bounded nonnegative content position.");
      const output = this.#output;
      if (this.#live && (!output?.applyTimelinePlan || !output.supportsTimelineTransport?.()))
        throw new DOMException("This live audio output has no acknowledged timeline transport.", "NotSupportedError");
      this.timelineMutation = true;
      try {
        for (const player of players) {
          if (command.kind === "pause") player.pause();
          else if (command.kind === "seek") player.seek(command.positionSeconds);
          else { player.playbackRate = command.rate; player.play(); }
        }
      } finally { this.timelineMutation = false; }
      const plan = this.compilePlan();
      if (!this.#live) return Object.freeze({ version: plan.version, backend: "offline", positionSeconds: players[0]!.currentTime, audioAnchor: null });
      const outputGeneration = output!.observeClock?.()?.discontinuityGeneration;
      pending = true;
      let acknowledgement: ReturnType<NonNullable<AUFXAudioGraphOutput["applyTimelinePlan"]>>;
      try { acknowledgement = output!.applyTimelinePlan!(plan, lease.signal); }
      catch (error) { pending = false; this.#lastError = error; this.stop(); throw error; }
      const applied = acknowledgement.then(ack => {
        lease.signal.throwIfAborted();
        const position = ack.players.find(player => player.id === this.nodeIds.get(players[0]!))?.position;
        const observed = output!.observeClock?.();
        if (ack.version !== plan.version || position === undefined || !Number.isFinite(position) || !observed || observed.discontinuityGeneration !== outputGeneration || !output!.supportsTimelineTransport?.() ||
            players.some(player => ack.players.find(value => value.id === this.nodeIds.get(player))?.position !== position))
          throw new DOMException("Audio timeline acknowledgement has no matching output position.", "InvalidStateError");
        for (const player of players) getAUFXRealtimeNode(player)?.receive?.({ type: "state", sampleTime: this.sampleTime, players: [{ id: this.nodeIds.get(player)!, position }] });
        return Object.freeze({ version: ack.version, backend: "audio-worklet" as const, positionSeconds: position,
          audioAnchor: new AUFXClockObservation({ samplePosition: ack.contextFrame, sampleRate: this.format.sampleRate, domain: "output", hostAnchorSeconds: null,
            uncertaintySeconds: observed.uncertaintySeconds, discontinuityGeneration: observed.discontinuityGeneration }) });
      }).catch(error => { this.#lastError = error; this.stop(); throw error; }).finally(() => { pending = false; });
      // Keep ignored legacy void-style calls from creating an unhandled rejection;
      // callers still receive and can await the original rejecting promise.
      void applied.catch(() => {});
      return applied;
    };
    return Object.freeze({ signal: lease.signal, apply, dispose });
  }
  private inputSignature(plan: AUFXRenderPlan) { return plan.nodes.filter(node => node.kind === "input").map(node => `${node.id}:${node.inputIndex}`).join(","); }
  private preflightLiveMutation(change: (connections: Set<AUFXAudioConnection>, taps: Map<AUFXAudioNode, Set<(buffer: AUFXAudioPCMBuffer) => void>>, nodes: Set<AUFXAudioNode>, nodeIds: Map<AUFXAudioNode, number>) => void) {
    if (!this.#live) return;
    const connections = new Set(this.graphConnections), taps = new Map([...this.taps].map(([node, callbacks]) => [node, new Set(callbacks)])), nodes = new Set(this.nodes), nodeIds = new Map(this.nodeIds); change(connections, taps, nodes, nodeIds);
    const plan = this.compilePlan(false, { connections, taps, nodes, nodeIds }, false); validateAUFXRenderPlan(plan);
  }
  private compilePlan(allowExternal = false, graph?: AUFXGraphSnapshot, advanceVersion = true): AUFXRenderPlan {
    const graphConnections = graph?.connections ?? this.graphConnections, graphTaps = graph?.taps ?? this.taps, graphIds = graph?.nodeIds ?? this.nodeIds;
    const ordered: AUFXAudioNode[] = [], visiting = new Set<AUFXAudioNode>(), visited = new Set<AUFXAudioNode>();
    const incoming = (node: AUFXAudioNode) => [...graphConnections].filter(connection => connection.destination === node).sort((left, right) => left.destinationBus - right.destinationBus || left.id - right.id);
    const visit = (node: AUFXAudioNode) => { if (visited.has(node)) return; if (visiting.has(node)) throw new Error("Audio graph cycle."); visiting.add(node); for (const connection of incoming(node)) visit(connection.source); visiting.delete(node); visited.add(node); ordered.push(node); };
    visit(this.mainMixerNode); for (const tapped of graphTaps.keys()) visit(tapped);
    let inputIndex = 0;
    const plans: any[] = [];
    for (const node of ordered) {
      const nodeInputs: number[] = [];
      for (const connection of incoming(node)) {
        const sourceId = graphIds.get(connection.source)!;
        const connectionId = -connection.id;
        plans.push(Object.freeze({ id: connectionId, kind: "connection", inputs: Object.freeze([sourceId]), sampleRate: connection.destinationFormat.sampleRate, channelCount: connection.destinationFormat.channelCount, sourceSampleRate: connection.sourceFormat.sampleRate, sourceChannelCount: connection.sourceFormat.channelCount, sourceBus: connection.sourceBus, destinationBus: connection.destinationBus, channelMap: connection.channelMap }));
        nodeInputs.push(connectionId);
      }
      const binding = getAUFXRealtimeNode(node);
      if (!binding && !allowExternal) { const error = new Error(`Audio node ${node.constructor.name} has no portable realtime renderer.`); error.name = "AUFXUnsupportedRealtimeNodeError"; throw error; }
      let snapshot: any = binding?.snapshot() ?? { kind: "external" };
      if (snapshot.kind === "input") { if (!binding?.input || !this.#inputCapability || binding.input.capability !== this.#inputCapability) throw new DOMException("Audio input does not belong to this mounted graph.", "SecurityError"); if (inputIndex >= 4) throw new RangeError("Audio graph input-node limit exceeded."); snapshot = { ...snapshot, inputIndex: inputIndex++ }; }
      plans.push(Object.freeze({ ...snapshot, id: graphIds.get(node)!, inputs: Object.freeze(nodeInputs), sampleRate: node.format.sampleRate, channelCount: node.format.channelCount }));
    }
    return Object.freeze({ version: advanceVersion ? ++this.planVersion : this.planVersion + 1, sampleRate: this.format.sampleRate, channelCount: this.format.channelCount, outputId: graphIds.get(this.mainMixerNode)!, nodes: Object.freeze(plans), tapIds: Object.freeze([...graphTaps.keys()].filter(node => visited.has(node)).map(node => graphIds.get(node)!)) });
  }

  private renderLiveBlock(frames: number, signal: AbortSignal) {
    signal.throwIfAborted(); this.assertActive(); const cost = [...this.nodes].reduce((sum, node) => sum + node.processingCost, 0); if (frames * this.format.channelCount * cost > 4194304) throw new RangeError("Live audio graph exceeds its work budget.");
    const plan = this.compilePlan(false);
    if (this.liveFallbackRuntime) this.liveFallbackRuntime.setPlan(plan, true); else { this.liveFallbackRuntime = new AUFXAudioRenderRuntime(plan); (this.liveFallbackRuntime as any).sampleTime = this.sampleTime; }
    const result = this.liveFallbackRuntime.process(frames), output = new AUFXAudioPCMBuffer(this.format, frames); output.frameLength = frames;
    for (let channel = 0; channel < this.format.channelCount; channel++) for (let frame = 0; frame < frames; frame++) output.setSample(channel, frame, result.channels[channel]![frame]!);
    for (const completion of result.completed) this.receiveRealtime({ type: "complete", ...completion }); this.receiveRealtime({ type: "state", sampleTime: result.sampleTime, players: result.players });
    for (const nodeId of this.liveFallbackRuntime.plan.tapIds) { const tapFrames = this.liveFallbackRuntime.frameCounts.get(nodeId) ?? frames; this.receiveRealtime({ type: "tap", nodeId, channels: this.liveFallbackRuntime.scratch.get(nodeId)!.map(channel => channel.slice(0, tapFrames)), dropped: 0 }); }
    return output;
  }

  attach(node: AUFXAudioNode) { this.assertActive(); if (this.nodes.size >= 128) throw new RangeError("Audio graph node limit exceeded."); const owner = nodeOwners.get(node); if (owner && owner !== this) throw new Error("Audio node belongs to another engine."); nodeOwners.set(node, this); this.nodes.add(node); if (!this.nodeIds.has(node)) this.nodeIds.set(node, this.nextNodeId++); if (this.#live) { this.refreshSubscriptions(); this.publishPlan(); } }
  detach(node: AUFXAudioNode) { this.assertActive(); if (node === this.mainMixerNode) throw new Error("Cannot detach main mixer."); this.preflightLiveMutation((connections, taps, nodes, ids) => { nodes.delete(node); taps.delete(node); ids.delete(node); for (const connection of [...connections]) if (connection.source === node || connection.destination === node) connections.delete(connection); }); if (nodeOwners.get(node) === this) nodeOwners.delete(node); this.nodes.delete(node); this.taps.delete(node); this.nodeIds.delete(node); for (const connection of [...this.graphConnections]) if (connection.source === node || connection.destination === node) this.graphConnections.delete(connection); if (this.#live) { this.refreshSubscriptions(); this.publishPlan(); } }
  connect(source: AUFXAudioNode, destination: AUFXAudioNode, options: AUFXAudioConnectionOptions = {}) {
    this.assertActive(); if (!this.nodes.has(source) || !this.nodes.has(destination)) throw new Error("Node is not attached to this engine.");
    const sourceBus = options.sourceBus ?? 0, destinationBus = options.destinationBus ?? 0;
    if ([...this.graphConnections].some(connection => connection.source === source && connection.destination === destination && connection.sourceBus === sourceBus && connection.destinationBus === destinationBus)) throw new Error("Duplicate audio graph connection.");
    const connection = new AUFXAudioConnection(this.nextConnectionId, source, destination, sourceBus, destinationBus, source.format, destination.format, options.channelMap);
    const candidate = new Set(this.graphConnections); candidate.add(connection);
    const reaches = (node: AUFXAudioNode, target: AUFXAudioNode, visiting = new Set<AUFXAudioNode>()): boolean => {
      if (node === target) return true;
      if (visiting.has(node)) return false;
      visiting.add(node);
      for (const edge of candidate) if (edge.source === node && reaches(edge.destination, target, visiting)) return true;
      visiting.delete(node);
      return false;
    };
    if (reaches(destination, source)) throw new Error("Audio graph cycle.");
    this.preflightLiveMutation(connections => connections.add(connection));
    this.nextConnectionId++; this.graphConnections.add(connection); this.publishPlan(); return connection;
  }
  disconnect(connection: AUFXAudioConnection): void;
  disconnect(source: AUFXAudioNode, destination?: AUFXAudioNode): void;
  disconnect(sourceOrConnection: AUFXAudioNode | AUFXAudioConnection, destination?: AUFXAudioNode) {
    this.assertActive();
    const matches = (connection: AUFXAudioConnection) => sourceOrConnection instanceof AUFXAudioConnection ? connection === sourceOrConnection : connection.source === sourceOrConnection && (!destination || connection.destination === destination);
    const removed = [...this.graphConnections].filter(matches); if (!removed.length) return;
    this.preflightLiveMutation(connections => { for (const connection of removed) connections.delete(connection); });
    for (const connection of removed) this.graphConnections.delete(connection); this.publishPlan();
  }
  installTap(node: AUFXAudioNode, callback: (buffer: AUFXAudioPCMBuffer) => void): AUFXAudioTap { this.assertActive(); if (!this.nodes.has(node)) throw new Error("Tap node is not attached to this engine."); if ([...this.taps.values()].reduce((sum, taps) => sum + taps.size, 0) >= 32) throw new RangeError("Audio tap budget exceeded."); this.preflightLiveMutation((_connections, taps) => { if (!taps.has(node)) taps.set(node, new Set()); taps.get(node)!.add(callback); }); if (!this.taps.has(node)) this.taps.set(node, new Set()); const taps = this.taps.get(node)!; taps.add(callback); this.publishPlan(); let disposed = false; return Object.freeze({ dispose: () => { if (disposed) return; this.preflightLiveMutation((_connections, candidateTaps) => { const values = candidateTaps.get(node); values?.delete(callback); if (!values?.size) candidateTaps.delete(node); }); disposed = true; taps.delete(callback); if (!taps.size) this.taps.delete(node); this.publishPlan(); } }); }

  async renderOffline(frames: number, signal?: AbortSignal): Promise<AUFXAudioPCMBuffer> {
    this.assertActive(); signal?.throwIfAborted(); if (this.#live) throw new Error("Audio engine is running."); if (this.offlineStreamOwner) throw new DOMException("An offline audio chunk stream is active.", "InvalidStateError"); const cost = [...this.nodes].reduce((sum, node) => sum + node.processingCost, 0); if (!Number.isSafeInteger(frames) || frames < 0 || frames * this.format.channelCount > 16777216 || frames * this.format.channelCount * cost > 67108864) throw new RangeError("Offline render exceeds frame/memory/work budget."); const plan = this.compilePlan(true); if (plan.nodes.some(node => node.kind === "input")) { const error = new Error("Live audio input cannot be rendered offline."); error.name = "AUFXUnsupportedOfflineInputError"; throw error; }
    const controller = new AbortController(), abort = () => controller.abort(signal?.reason); signal?.addEventListener("abort", abort, { once: true }); this.renderAbort = controller;
    const external = (nodeId: number, inputChannels: Float32Array[][], outputChannels: Float32Array[], blockFrames: number, blockSampleTime: number) => { const node = this.nodeForId(nodeId); if (!node) throw new Error("Detached external audio node."); controller.signal.throwIfAborted(); const inputs = inputChannels.map(channels => { const pcm = new AUFXAudioPCMBuffer(node.format, blockFrames); pcm.frameLength = blockFrames; for (let channel = 0; channel < channels.length; channel++) for (let frame = 0; frame < blockFrames; frame++) pcm.setSample(channel, frame, channels[channel]![frame]!); return pcm; }), rendered = node.render(inputs, blockFrames, blockSampleTime / node.format.sampleRate, controller.signal); if (!rendered.format.isEqual(node.format) || rendered.frameLength < blockFrames) throw new RangeError("External audio node returned an invalid bus."); for (let channel = 0; channel < outputChannels.length; channel++) for (let frame = 0; frame < blockFrames; frame++) outputChannels[channel]![frame] = rendered.getSample(channel, frame); };
    if (this.offlineRuntime) { this.offlineRuntime.setExternalRenderer(external); this.offlineRuntime.setPlan(plan, true); } else { this.offlineRuntime = new AUFXAudioRenderRuntime(plan, external); (this.offlineRuntime as any).sampleTime = this.sampleTime; } const runtime = this.offlineRuntime;
    this.rendering = true;
    try { const output = new AUFXAudioPCMBuffer(this.format, frames); output.frameLength = frames; for (let offset = 0; offset < frames; offset += 128) { if (offset % 1024 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); controller.signal.throwIfAborted(); const count = Math.min(128, frames - offset), result = runtime.process(count); for (let channel = 0; channel < this.format.channelCount; channel++) for (let frame = 0; frame < count; frame++) output.setSample(channel, offset + frame, result.channels[channel]![frame]!); for (const completion of result.completed) this.receiveRealtime({ type: "complete", ...completion }); this.receiveRealtime({ type: "state", sampleTime: result.sampleTime, players: result.players }); for (const nodeId of runtime.plan.tapIds) { const tapFrames = runtime.frameCounts.get(nodeId) ?? count; this.receiveRealtime({ type: "tap", nodeId, channels: runtime.scratch.get(nodeId)!.map(channel => channel.slice(0, tapFrames)), dropped: 0 }); } } return output; } finally { signal?.removeEventListener("abort", abort); this.renderAbort = null; this.rendering = false; }
  }
  renderOfflineChunks(frames: number, options: AUFXAudioChunkStreamOptions = {}) {
    this.assertActive();
    if (this.#live) throw new Error("Audio engine is running.");
    const chunkFrames = options.chunkFrames ?? AUFX_RENDER_MAX_FRAMES;
    if (!Number.isSafeInteger(frames) || frames < 0) throw new RangeError("Invalid offline audio stream frame count.");
    if (!Number.isSafeInteger(chunkFrames) || chunkFrames < 1 || chunkFrames > AUFX_RENDER_MAX_FRAMES) throw new RangeError(`Audio chunk size must be between 1 and ${AUFX_RENDER_MAX_FRAMES} frames.`);
    const cost = [...this.nodes].reduce((sum, node) => sum + node.processingCost, 0);
    if (chunkFrames * this.format.channelCount * cost > 4_194_304) throw new RangeError("Offline audio chunk exceeds its work budget.");
    const plan = this.compilePlan(true);
    if (plan.nodes.some(node => node.kind === "input")) { const error = new Error("Live audio input cannot be rendered offline."); error.name = "AUFXUnsupportedOfflineInputError"; throw error; }
    const generation = this.discontinuityGeneration;
    const owner = {};
    const engine = this;
    return new AUFXAudioChunkStream(async function* (streamSignal: AbortSignal) {
      streamSignal.throwIfAborted();
      if (engine.offlineStreamOwner) throw new DOMException("An offline audio chunk stream is already active.", "InvalidStateError");
      engine.offlineStreamOwner = owner;
      const external = (nodeId: number, inputChannels: Float32Array[][], outputChannels: Float32Array[], blockFrames: number, blockSampleTime: number) => {
        const node = engine.nodeForId(nodeId);
        if (!node) throw new Error("Detached external audio node.");
        streamSignal.throwIfAborted();
        const inputs = inputChannels.map(channels => { const pcm = new AUFXAudioPCMBuffer(node.format, blockFrames); pcm.frameLength = blockFrames; for (let channel = 0; channel < channels.length; channel++) for (let frame = 0; frame < blockFrames; frame++) pcm.setSample(channel, frame, channels[channel]![frame]!); return pcm; });
        const rendered = node.render(inputs, blockFrames, blockSampleTime / node.format.sampleRate, streamSignal);
        if (!rendered.format.isEqual(node.format) || rendered.frameLength < blockFrames) throw new RangeError("External audio node returned an invalid bus.");
        for (let channel = 0; channel < outputChannels.length; channel++) for (let frame = 0; frame < blockFrames; frame++) outputChannels[channel]![frame] = rendered.getSample(channel, frame);
      };
      const runtime = new AUFXAudioRenderRuntime(plan, external);
      (runtime as any).sampleTime = engine.sampleTime;
      try {
        for (let renderedFrames = 0; renderedFrames < frames;) {
          streamSignal.throwIfAborted();
          if (generation !== engine.discontinuityGeneration) throw new DOMException("Audio chunk stream belongs to an obsolete discontinuity generation.", "InvalidStateError");
          const count = Math.min(chunkFrames, frames - renderedFrames);
          engine.rendering = true;
          let result;
          try { result = runtime.process(count); }
          finally { engine.rendering = false; }
          const buffer = new AUFXAudioPCMBuffer(engine.format, count); buffer.frameLength = count;
          for (let channel = 0; channel < engine.format.channelCount; channel++) for (let frame = 0; frame < count; frame++) buffer.setSample(channel, frame, result.channels[channel]![frame]!);
          for (const completion of result.completed) engine.receiveRealtime({ type: "complete", ...completion });
          engine.receiveRealtime({ type: "state", sampleTime: result.sampleTime, players: result.players });
          for (const nodeId of runtime.plan.tapIds) { const tapFrames = runtime.frameCounts.get(nodeId) ?? count; engine.receiveRealtime({ type: "tap", nodeId, channels: runtime.scratch.get(nodeId)!.map(channel => channel.slice(0, tapFrames)), dropped: 0 }); }
          const observation = new AUFXClockObservation({ samplePosition: result.sampleTime - count, sampleRate: engine.format.sampleRate, domain: "render", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: generation });
          renderedFrames += count;
          yield Object.freeze({ buffer, observation });
          if ((renderedFrames & 8191) === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        engine.offlineRuntime = runtime;
      } finally {
        engine.rendering = false;
        if (engine.offlineStreamOwner === owner) engine.offlineStreamOwner = null;
      }
    }, options.signal);
  }
  reset() { this.assertActive(); this.stop(); this.offlineRuntime = null; this.liveFallbackRuntime = null; this.discontinuityGeneration++; for (const node of this.nodes) node.reset(); this.sampleTime = 0; }
  dispose() { if (this.disposed) return; this.disposed = true; const output = this.#output, live = this.#live, render = this.renderAbort, nodes = [...this.nodes]; this.offlineRuntime = null; this.liveFallbackRuntime = null; this.#output = null; this.#live = null; this.renderAbort = null; this.clearSubscriptions(); this.taps.clear(); this.graphConnections.clear(); this.nodes.clear(); this.nodeIds.clear(); for (const node of nodes) nodeOwners.delete(node); const errors: unknown[] = [], cleanup = (action: () => void) => { try { action(); } catch (error) { errors.push(error); } }; for (const release of [...this.timelineReleases]) cleanup(release); cleanup(() => live?.abort()); cleanup(() => render?.abort(new Error("Audio engine disposed during rendering."))); cleanup(() => output?.stop()); cleanup(() => output?.dispose()); for (const node of nodes) cleanup(() => node.dispose()); if (errors.length) this.#lastError = new AggregateError(errors, "Audio graph cleanup encountered errors."); }
}
