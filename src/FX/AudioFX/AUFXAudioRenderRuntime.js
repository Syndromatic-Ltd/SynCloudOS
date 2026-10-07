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

/* Canonical bounded AUFX graph renderer, shared by offline and AudioWorklet paths. */
export const AUFX_RENDER_MAX_FRAMES = 2048;
const MAX_PLAN_NODES = 1152, MAX_PCM_SAMPLES = 16777216, MAX_STATE_BYTES = 67108864;
const finite = value => typeof value === "number" && Number.isFinite(value);
const keyOf = node => node.kind === "effect" ? JSON.stringify(node.effect) : node.kind === "fir" ? node.coefficients.join(",") : node.kind === "timePitch" ? `${node.pitchRatio}:${node.timeScale}:${node.windowFrames}` : node.kind === "connection" ? `${node.sourceSampleRate}:${node.sourceChannelCount}:${node.sampleRate}:${node.channelCount}:${JSON.stringify(node.channelMap)}` : node.kind;
const sampleRateOf = (node, plan) => node.sampleRate ?? plan.sampleRate;
const channelCountOf = (node, plan) => node.channelCount ?? plan.channelCount;
const frameCapacity = (node, plan) => Math.ceil(AUFX_RENDER_MAX_FRAMES * sampleRateOf(node, plan) / plan.sampleRate) + 2;
function parameterValue(parameter, sampleTime) { const events = parameter.events; let low = 0, high = events.length; while (low < high) { const middle = (low + high) >>> 1; if (events[middle].sampleTime <= sampleTime) low = middle + 1; else high = middle; } const previous = low ? events[low - 1] : null, next = events[low], value = previous?.value ?? parameter.initial, time = previous?.sampleTime ?? 0; return next?.ramp && next.sampleTime !== time ? value + (next.value - value) * (sampleTime - time) / (next.sampleTime - time) : value; }
function biquadCoefficients(effect, rate) {
  const omega = 2 * Math.PI * effect.frequency / rate, cosine = Math.cos(omega), alpha = Math.sin(omega) / (2 * (effect.q ?? Math.SQRT1_2)), a0 = 1 + alpha;
  if (effect.type === "bandpass") return [alpha / a0, 0, -alpha / a0, -2 * cosine / a0, (1 - alpha) / a0];
  return [1 / a0, -2 * cosine / a0, 1 / a0, -2 * cosine / a0, (1 - alpha) / a0];
}
function effectState(format, effect) {
  const channels = format.channelCount, rate = format.sampleRate;
  if (effect.type === "delay") return { history: Array.from({ length: channels }, () => new Float32Array(Math.max(1, Math.round(effect.delayTime * rate)))), cursor: 0 };
  if (effect.type === "lowpass" || effect.type === "highpass") return { previousInput: new Float64Array(channels), previousOutput: new Float64Array(channels) };
  if (effect.type === "bandpass" || effect.type === "notch") return { coefficients: biquadCoefficients(effect, rate), biquad: Array.from({ length: channels }, () => new Float64Array(2)) };
  if (effect.type === "equalizer") { const coefficients = effect.bands.map(band => { const a = 10 ** (band.gain / 40), omega = 2 * Math.PI * band.frequency / rate, alpha = Math.sin(omega) / (2 * band.q), a0 = 1 + alpha / a; return [(1 + alpha * a) / a0, -2 * Math.cos(omega) / a0, (1 - alpha * a) / a0, -2 * Math.cos(omega) / a0, (1 - alpha / a) / a0]; }); return { coefficients, eq: Array.from({ length: channels }, () => new Float64Array(coefficients.length * 2)) }; }
  if (effect.type === "reverb") return { combs: Array.from({ length: channels }, (_, channel) => [0.0297, 0.0371, 0.0411, 0.0437].map(delay => { const frames = Math.max(1, Math.round((delay + (channel % 2) * 0.0011) * rate)); return { buffer: new Float32Array(frames), cursor: 0, feedback: 10 ** (-3 * frames / rate / effect.decayTime), filtered: 0 }; })), allpass: Array.from({ length: channels }, () => ({ buffer: new Float32Array(Math.max(1, Math.round(0.005 * rate))), cursor: 0 })) };
  return { gain: 1 };
}
function timePitchState(format, node) {
  const ringLength = node.windowFrames + 4;
  return { ring: Array.from({ length: format.channelCount }, () => new Float32Array(ringLength)), ringLength, writeIndex: 0, totalWritten: 0, phase: 0 };
}
export function validateAUFXRenderPlan(plan, allowBufferReferences = false, allowExternal = false) {
  if (!plan || !Number.isSafeInteger(plan.version) || !finite(plan.sampleRate) || plan.sampleRate < 1 || plan.sampleRate > 384000 || !Number.isInteger(plan.channelCount) || plan.channelCount < 1 || plan.channelCount > 32 || !Array.isArray(plan.nodes) || !plan.nodes.length || plan.nodes.length > MAX_PLAN_NODES) throw new RangeError("Invalid AUFX render plan.");
  const ids = new Set(), seen = new Set(), inputIndexes = new Set(), nodeById = new Map(); let samples = 0, stateBytes = 0, cost = 0, edgeCount = 0, eventCount = 0, quantumWork = 0;
  for (const node of plan.nodes) {
    const nodeSampleRate = sampleRateOf(node, plan), nodeChannelCount = channelCountOf(node, plan);
    if (!Number.isSafeInteger(node.id) || ids.has(node.id) || !finite(nodeSampleRate) || nodeSampleRate < 1 || nodeSampleRate > 384000 || !Number.isInteger(nodeChannelCount) || nodeChannelCount < 1 || nodeChannelCount > 32 || !Array.isArray(node.inputs) || new Set(node.inputs).size !== node.inputs.length || node.inputs.some(id => !seen.has(id))) throw new RangeError("Invalid AUFX graph topology."); ids.add(node.id); seen.add(node.id); nodeById.set(node.id, node); edgeCount += node.inputs.length;
    const capacity = frameCapacity(node, plan); if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("Invalid AUFX node render ratio."); stateBytes += capacity * nodeChannelCount * Float32Array.BYTES_PER_ELEMENT;
    if (node.kind === "player") { if (!Number.isSafeInteger(node.positionRevision) || !Array.isArray(node.schedules) || node.schedules.length > 256 || new Set(node.schedules.map(item => item.id)).size !== node.schedules.length || !finite(node.position) || node.position < 0 || !finite(node.rate) || node.rate <= 0 || node.rate > 4) throw new RangeError("Invalid AUFX player plan."); for (const item of node.schedules) { if (!Number.isSafeInteger(item.id) || !finite(item.time) || item.time < 0 || typeof item.loop !== "boolean") throw new RangeError("Invalid AUFX schedule."); if (item.channels === null && allowBufferReferences) continue; if (!Array.isArray(item.channels) || item.channels.length !== nodeChannelCount || !item.channels[0]?.length || item.channels.some(channel => !(channel instanceof Float32Array) || channel.length !== item.channels[0].length)) throw new RangeError("Invalid AUFX scheduled PCM."); samples += item.channels[0].length * nodeChannelCount; } cost += 1 + node.schedules.length * 4; }
    else if (node.kind === "mixer") { if (typeof node.muted !== "boolean" || !node.volume || !finite(node.volume.initial) || !Array.isArray(node.volume.events) || node.volume.events.length > 4096 || node.volume.events.some((event, index) => !Number.isSafeInteger(event.sampleTime) || event.sampleTime < 0 || !finite(event.value) || typeof event.ramp !== "boolean" || index > 0 && event.sampleTime <= node.volume.events[index - 1].sampleTime)) throw new RangeError("Invalid AUFX automation plan."); eventCount += node.volume.events.length; cost += 1 + Math.ceil(Math.log2(node.volume.events.length + 1)); }
    else if (node.kind === "fir") { if (!Array.isArray(node.coefficients) || !node.coefficients.length || node.coefficients.length > 512 || node.coefficients.some(value => !finite(value) || Math.abs(value) > 16)) throw new RangeError("Invalid AUFX FIR plan."); cost += node.coefficients.length; stateBytes += node.coefficients.length * nodeChannelCount * Float64Array.BYTES_PER_ELEMENT; }
    else if (node.kind === "effect") { const effect = node.effect; if (!effect || typeof effect !== "object") throw new RangeError("Invalid AUFX effect plan."); if (effect.type === "delay") { if (!finite(effect.delayTime) || effect.delayTime < 1 / nodeSampleRate || effect.delayTime > 10 || !finite(effect.feedback) || effect.feedback < 0 || effect.feedback >= 1 || !finite(effect.wet) || effect.wet < 0 || effect.wet > 1) throw new RangeError("Invalid AUFX delay plan."); } else if (effect.type === "lowpass" || effect.type === "highpass") { if (!finite(effect.frequency) || effect.frequency <= 0 || effect.frequency >= nodeSampleRate / 2) throw new RangeError("Invalid AUFX filter plan."); } else if (effect.type === "bandpass" || effect.type === "notch") { if (!finite(effect.frequency) || effect.frequency <= 0 || effect.frequency >= nodeSampleRate / 2 || effect.q !== undefined && (!finite(effect.q) || effect.q < 0.1 || effect.q > 30)) throw new RangeError("Invalid AUFX biquad filter plan."); } else if (effect.type === "equalizer") { if (!Array.isArray(effect.bands) || effect.bands.length > 32 || effect.bands.some(band => !finite(band.frequency) || band.frequency <= 0 || band.frequency >= nodeSampleRate / 2 || !finite(band.gain) || band.gain < -24 || band.gain > 24 || !finite(band.q) || band.q < 0.1 || band.q > 30)) throw new RangeError("Invalid AUFX equalizer plan."); } else if (effect.type === "reverb") { if (!finite(effect.decayTime) || effect.decayTime < 0.1 || effect.decayTime > 20 || !finite(effect.wet) || effect.wet < 0 || effect.wet > 1 || effect.damping !== undefined && (!finite(effect.damping) || effect.damping < 0 || effect.damping > 0.99)) throw new RangeError("Invalid AUFX reverb plan."); } else if (effect.type === "compression") { if (!finite(effect.threshold) || effect.threshold <= 0 || effect.threshold > 1 || !finite(effect.ratio) || effect.ratio < 1 || effect.ratio > 100) throw new RangeError("Invalid AUFX compressor plan."); } else throw new RangeError("Invalid AUFX effect plan."); cost += effect.type === "equalizer" ? Math.max(1, effect.bands.length * 10) : effect.type === "reverb" ? 40 : effect.type === "compression" ? 16 : effect.type === "bandpass" || effect.type === "notch" ? 8 : 4; }
    else if (node.kind === "timePitch") { if (!finite(node.pitchRatio) || node.pitchRatio < 0.5 || node.pitchRatio > 2 || node.timeScale !== 1 || !Number.isInteger(node.windowFrames) || node.windowFrames < 64 || node.windowFrames > 4096) throw new RangeError("Non-unit AUFX time stretch requires finite-buffer processing and realtime pitch parameters must stay within bounds."); cost += 48; stateBytes += (node.windowFrames + 4) * nodeChannelCount * Float32Array.BYTES_PER_ELEMENT; }
    else if (node.kind === "connection") { const source = nodeById.get(node.inputs[0]); if (node.inputs.length !== 1 || !source || node.sourceSampleRate !== sampleRateOf(source, plan) || node.sourceChannelCount !== channelCountOf(source, plan) || !Number.isInteger(node.sourceBus) || node.sourceBus < 0 || !Number.isInteger(node.destinationBus) || node.destinationBus < 0 || !Array.isArray(node.channelMap) || node.channelMap.length !== nodeChannelCount || node.channelMap.some(row => !Array.isArray(row) || row.length !== node.sourceChannelCount || row.some(weight => !finite(weight) || Math.abs(weight) > 16))) throw new RangeError("Invalid AUFX connection plan."); stateBytes += node.sourceChannelCount * Float32Array.BYTES_PER_ELEMENT; cost += node.sourceChannelCount * nodeChannelCount * 2; }
    if (node.kind === "effect" && node.effect.type === "delay") stateBytes += Math.max(1, Math.round(node.effect.delayTime * nodeSampleRate)) * nodeChannelCount * Float32Array.BYTES_PER_ELEMENT;
    if (node.kind === "effect" && (node.effect.type === "lowpass" || node.effect.type === "highpass")) stateBytes += 2 * nodeChannelCount * Float64Array.BYTES_PER_ELEMENT;
    if (node.kind === "effect" && (node.effect.type === "bandpass" || node.effect.type === "notch")) stateBytes += 2 * nodeChannelCount * Float64Array.BYTES_PER_ELEMENT;
    if (node.kind === "effect" && node.effect.type === "equalizer") stateBytes += node.effect.bands.length * 2 * nodeChannelCount * Float64Array.BYTES_PER_ELEMENT;
    if (node.kind === "effect" && node.effect.type === "reverb") for (let channel = 0; channel < nodeChannelCount; channel++) { for (const delay of [0.0297, 0.0371, 0.0411, 0.0437]) stateBytes += Math.max(1, Math.round((delay + (channel % 2) * 0.0011) * nodeSampleRate)) * Float32Array.BYTES_PER_ELEMENT; stateBytes += Math.max(1, Math.round(0.005 * nodeSampleRate)) * Float32Array.BYTES_PER_ELEMENT; }
    if (node.kind === "effect" && node.effect.type === "compression") stateBytes += Float64Array.BYTES_PER_ELEMENT;
    if (node.kind === "effect" && node.effect.type === "compression" && (node.effect.attackTime !== undefined && (!finite(node.effect.attackTime) || node.effect.attackTime < 0 || node.effect.attackTime > 1) || node.effect.releaseTime !== undefined && (!finite(node.effect.releaseTime) || node.effect.releaseTime < 0 || node.effect.releaseTime > 5) || node.effect.knee !== undefined && (!finite(node.effect.knee) || node.effect.knee < 0 || node.effect.knee > 40) || node.effect.makeupGain !== undefined && (!finite(node.effect.makeupGain) || node.effect.makeupGain < -24 || node.effect.makeupGain > 24))) throw new RangeError("Invalid AUFX compressor plan.");
    if (node.kind === "input") { if (node.inputs.length || !Number.isInteger(node.inputIndex) || node.inputIndex < 0 || node.inputIndex >= 4 || inputIndexes.has(node.inputIndex) || nodeSampleRate !== plan.sampleRate) throw new RangeError("Invalid AUFX input node."); inputIndexes.add(node.inputIndex); cost += 1; }
    else if (node.kind === "external") { if (!allowExternal) throw new RangeError("Unsupported AUFX render node."); cost += 1; }
    else if (node.kind !== "player" && node.kind !== "mixer" && node.kind !== "fir" && node.kind !== "effect" && node.kind !== "timePitch" && node.kind !== "connection") throw new RangeError("Unsupported AUFX render node.");
    quantumWork += capacity * nodeChannelCount * Math.max(1, cost);
  }
  if (!Array.isArray(plan.tapIds)) throw new RangeError("Invalid AUFX render plan.");
  for (const tapId of plan.tapIds ?? []) { const tapped = nodeById.get(tapId); if (tapped) stateBytes += frameCapacity(tapped, plan) * channelCountOf(tapped, plan) * Float32Array.BYTES_PER_ELEMENT; }
  const output = nodeById.get(plan.outputId); cost += edgeCount; if (!output || sampleRateOf(output, plan) !== plan.sampleRate || channelCountOf(output, plan) !== plan.channelCount || plan.tapIds.length > 32 || new Set(plan.tapIds).size !== plan.tapIds.length || plan.tapIds.some(id => !ids.has(id)) || samples > MAX_PCM_SAMPLES || stateBytes > MAX_STATE_BYTES || edgeCount > 1024 || eventCount > 4096 || quantumWork > 4194304 * 8) throw new RangeError("AUFX realtime graph exceeds its storage or work budget.");
}
export class AUFXAudioRenderRuntime {
  constructor(plan, externalRenderer = null) { this.sampleTime = 0; this.externalRenderer = externalRenderer; this.plan = null; this.states = new Map(); this.scratch = new Map(); this.frameCounts = new Map(); this.setPlan(plan, false); }
  setExternalRenderer(renderer) { this.externalRenderer = renderer; }
  setPlan(plan, preserve = true) {
    validateAUFXRenderPlan(plan, preserve, !!this.externalRenderer); if (this.plan && plan.version <= this.plan.version) return false; const old = preserve ? this.states : new Map(), states = new Map(), scratch = new Map();
    for (const node of plan.nodes) { const previous = old.get(node.id), key = keyOf(node); let state;
      if (previous?.kind === node.kind && previous.key === key) state = previous;
      else if (node.kind === "effect") state = { kind: node.kind, key, effect: effectState({ sampleRate: sampleRateOf(node, plan), channelCount: channelCountOf(node, plan) }, node.effect) };
      else if (node.kind === "fir") state = { kind: node.kind, key, history: Array.from({ length: channelCountOf(node, plan) }, () => new Float64Array(node.coefficients.length)), cursor: 0 };
      else if (node.kind === "timePitch") state = { kind: node.kind, key, timePitch: timePitchState({ sampleRate: sampleRateOf(node, plan), channelCount: channelCountOf(node, plan) }, node) };
      else if (node.kind === "connection") state = { kind: node.kind, key, lastSource: new Float32Array(node.sourceChannelCount), hasLast: false };
      else state = { kind: node.kind, key };
      if (node.kind === "player") { if (!previous || previous.positionRevision !== node.positionRevision) state.position = node.position; state.positionRevision = node.positionRevision; state.playing = node.playing; state.rate = node.rate; const prior = new Map((state.schedules ?? []).map(item => [item.id, item])); state.schedules = node.schedules.map(item => { const retained = prior.get(item.id); if (retained) return retained; if (!item.channels) throw new RangeError("Unknown AUFX scheduled PCM reference."); return { ...item, channels: item.channels.map(channel => channel instanceof Float32Array ? channel : new Float32Array(channel)) }; }); }
      states.set(node.id, state); scratch.set(node.id, Array.from({ length: channelCountOf(node, plan) }, () => new Float32Array(frameCapacity(node, plan))));
    }
    let retainedSamples = 0; for (const [id, state] of states) if (state.kind === "player") { const node = plan.nodes.find(candidate => candidate.id === id); for (const item of state.schedules) retainedSamples += item.channels[0].length * channelCountOf(node, plan); } if (retainedSamples > MAX_PCM_SAMPLES) throw new RangeError("AUFX realtime graph exceeds its storage budget."); this.plan = plan; this.states = states; this.scratch = scratch; this.frameCounts = new Map(); return true;
  }
  process(frames, target, inputBuses = []) {
    if (!Number.isInteger(frames) || frames < 0 || frames > AUFX_RENDER_MAX_FRAMES) throw new RangeError("Invalid AUFX render quantum."); const completed = [], plan = this.plan; this.frameCounts = new Map();
    for (const node of plan.nodes) { const nodeSampleRate = sampleRateOf(node, plan), nodeChannelCount = channelCountOf(node, plan), nodeStart = Math.floor(this.sampleTime * nodeSampleRate / plan.sampleRate), nodeEnd = Math.floor((this.sampleTime + frames) * nodeSampleRate / plan.sampleRate), nodeFrames = nodeEnd - nodeStart, output = this.scratch.get(node.id); this.frameCounts.set(node.id, nodeFrames); for (const channel of output) channel.fill(0, 0, nodeFrames); const inputs = node.inputs.map(id => this.scratch.get(id)), state = this.states.get(node.id);
      if (node.kind === "input") { const input = inputBuses[node.inputIndex] ?? []; for (let channel = 0; channel < nodeChannelCount; channel++) { const source = input[channel]; if (source) output[channel].set(source.subarray(0, nodeFrames)); } }
      else if (node.kind === "connection") this.renderConnection(node, state, inputs[0], output, nodeFrames, nodeStart, this.frameCounts.get(node.inputs[0]) ?? 0);
      else if (node.kind === "external") { if (!this.externalRenderer) throw new Error("External AUFX nodes are unavailable in the audio worklet."); this.externalRenderer(node.id, inputs, output, nodeFrames, nodeStart); }
      else if (node.kind === "player") this.renderPlayer(node, state, output, nodeFrames, nodeStart, completed);
      else { for (let frame = 0; frame < nodeFrames; frame++) for (let channel = 0; channel < nodeChannelCount; channel++) { let sum = 0; for (const input of inputs) sum += input[channel]?.[frame] ?? 0; output[channel][frame] = sum; } if (node.kind === "mixer") this.renderMixer(node, output, nodeFrames, nodeStart); else if (node.kind === "fir") this.renderFIR(node, state, output, nodeFrames); else if (node.kind === "timePitch") this.renderTimePitch(node, state.timePitch, output, nodeFrames); else this.renderEffect({ ...node, sampleRate: nodeSampleRate }, state.effect, output, nodeFrames); }
    }
    const source = this.scratch.get(plan.outputId); if (target) for (let channel = 0; channel < plan.channelCount; channel++) target[channel].set(source[channel].subarray(0, frames)); this.sampleTime += frames; return { channels: source, completed, sampleTime: this.sampleTime, players: plan.nodes.filter(node => node.kind === "player").map(node => ({ id: node.id, position: this.states.get(node.id).position })) };
  }
  renderConnection(node, state, source, output, frames, destinationStart, sourceFrames) {
    const sourceStart = Math.floor(this.sampleTime * node.sourceSampleRate / this.plan.sampleRate);
    const read = (channel, absolutePosition) => { const local = absolutePosition - sourceStart, lower = Math.floor(local), fraction = local - lower; const sample = index => { if (index < 0) return state.hasLast ? state.lastSource[channel] : source[channel]?.[0] ?? 0; if (index >= sourceFrames) return sourceFrames ? source[channel]?.[sourceFrames - 1] ?? 0 : state.hasLast ? state.lastSource[channel] : 0; return source[channel]?.[index] ?? 0; }; const a = sample(lower), b = sample(lower + 1); return a + (b - a) * fraction; };
    for (let frame = 0; frame < frames; frame++) { const sourcePosition = (destinationStart + frame) * node.sourceSampleRate / node.sampleRate; for (let destinationChannel = 0; destinationChannel < node.channelCount; destinationChannel++) { let value = 0; const row = node.channelMap[destinationChannel]; for (let sourceChannel = 0; sourceChannel < node.sourceChannelCount; sourceChannel++) value += read(sourceChannel, sourcePosition) * row[sourceChannel]; output[destinationChannel][frame] = value; } }
    if (sourceFrames) { for (let channel = 0; channel < node.sourceChannelCount; channel++) state.lastSource[channel] = source[channel]?.[sourceFrames - 1] ?? 0; state.hasLast = true; }
  }
  renderPlayer(node, state, output, frames, _nodeStart, completed) { if (!state.playing) return; const rate = sampleRateOf(node, this.plan), start = state.position; for (let frame = 0; frame < frames; frame++) { const time = start + frame * state.rate / rate; for (const item of state.schedules) { const position = (time - item.time) * rate; if (position < 0 || (!item.loop && position >= item.channels[0].length)) continue; const floor = Math.floor(position), index = floor % item.channels[0].length, next = item.loop ? (index + 1) % item.channels[0].length : Math.min(index + 1, item.channels[0].length - 1), fraction = position - floor; for (let channel = 0; channel < output.length; channel++) output[channel][frame] += item.channels[channel][index] + (item.channels[channel][next] - item.channels[channel][index]) * fraction; } } state.position += frames * state.rate / rate; const finished = state.schedules.filter(item => !item.loop && item.time + item.channels[0].length / rate <= state.position + 1e-12); if (!node.retainForTimeline) state.schedules = state.schedules.filter(item => !finished.includes(item)); for (const item of finished) { if (item.completed) continue; item.completed = true; const localNodeFrames = Math.min(frames, Math.max(0, Math.ceil(((item.time - start) * rate + item.channels[0].length) / state.rate - 1e-9))); completed.push({ nodeId: node.id, scheduleId: item.id, endSampleTime: this.sampleTime + Math.ceil(localNodeFrames * this.plan.sampleRate / rate) }); } }
  renderMixer(node, output, frames, nodeStart = this.sampleTime) { for (let frame = 0; frame < frames; frame++) { const gain = node.muted ? 0 : parameterValue(node.volume, nodeStart + frame); for (const channel of output) channel[frame] *= gain; } }
  renderFIR(node, state, output, frames) { for (let frame = 0; frame < frames; frame++) { for (let channel = 0; channel < output.length; channel++) { const history = state.history[channel]; history[state.cursor] = output[channel][frame]; let value = 0; for (let tap = 0; tap < node.coefficients.length; tap++) value += history[(state.cursor - tap + history.length) % history.length] * node.coefficients[tap]; output[channel][frame] = value; } state.cursor = (state.cursor + 1) % node.coefficients.length; } }
  renderEffect(node, state, output, frames) { const effect = node.effect, rate = node.sampleRate; for (let frame = 0; frame < frames; frame++) { let compressorGain = 1; if (effect.type === "compression") { let peak = 0; for (const channel of output) peak = Math.max(peak, Math.abs(channel[frame])); const delta = 20 * Math.log10(Math.max(1e-12, peak) / effect.threshold), knee = effect.knee ?? 6, gainDB = knee > 0 && Math.abs(delta) < knee / 2 ? (1 / effect.ratio - 1) * (delta + knee / 2) ** 2 / (2 * knee) : delta > 0 ? (1 / effect.ratio - 1) * delta : 0, target = 10 ** (gainDB / 20), time = target < state.gain ? effect.attackTime ?? 0.003 : effect.releaseTime ?? 0.25, coefficient = time === 0 ? 0 : Math.exp(-1 / (time * rate)); state.gain = target + coefficient * (state.gain - target); compressorGain = state.gain * 10 ** ((effect.makeupGain ?? 0) / 20); }
      for (let channel = 0; channel < output.length; channel++) { const value = output[channel][frame]; let processed = value; if (effect.type === "delay") { const history = state.history[channel], delayed = history[state.cursor]; history[state.cursor] = value + delayed * effect.feedback; processed = value * (1 - effect.wet) + delayed * effect.wet; } else if (effect.type === "lowpass" || effect.type === "highpass") { const dt = 1 / rate, rc = 1 / (2 * Math.PI * effect.frequency); processed = effect.type === "lowpass" ? state.previousOutput[channel] + dt / (rc + dt) * (value - state.previousOutput[channel]) : rc / (rc + dt) * (state.previousOutput[channel] + value - state.previousInput[channel]); state.previousInput[channel] = value; state.previousOutput[channel] = processed; } else if (effect.type === "bandpass" || effect.type === "notch") { const c = state.coefficients, z = state.biquad[channel], result = c[0] * value + z[0]; z[0] = c[1] * value - c[3] * result + z[1]; z[1] = c[2] * value - c[4] * result; processed = result; } else if (effect.type === "equalizer") { processed = value; const eq = state.eq[channel]; for (let band = 0; band < state.coefficients.length; band++) { const c = state.coefficients[band], index = band * 2, result = c[0] * processed + eq[index]; eq[index] = c[1] * processed - c[3] * result + eq[index + 1]; eq[index + 1] = c[2] * processed - c[4] * result; processed = result; } } else if (effect.type === "reverb") { let wet = 0; for (const comb of state.combs[channel]) { const delayed = comb.buffer[comb.cursor]; comb.filtered = delayed * (1 - (effect.damping ?? 0.3)) + comb.filtered * (effect.damping ?? 0.3); comb.buffer[comb.cursor] = value + comb.filtered * comb.feedback; comb.cursor = (comb.cursor + 1) % comb.buffer.length; wet += delayed * 0.25; } const ap = state.allpass[channel], delayed = ap.buffer[ap.cursor], diffused = delayed - wet * 0.7; ap.buffer[ap.cursor] = wet + diffused * 0.7; ap.cursor = (ap.cursor + 1) % ap.buffer.length; processed = value * (1 - effect.wet) + diffused * effect.wet; } else processed = value * compressorGain; output[channel][frame] = processed; }
      if (effect.type === "delay") state.cursor = (state.cursor + 1) % state.history[0].length; }
  }
  renderTimePitch(node, state, output, frames) {
    const ratio = node.pitchRatio;
    if (ratio === 1) {
      for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < output.length; channel++) if (!finite(output[channel][frame])) throw new RangeError("AUFX time-pitch input samples must be finite.");
      return;
    }
    const maxDelay = node.windowFrames, minDelay = Math.max(8, Math.min(64, Math.floor(maxDelay / 8))), sweep = maxDelay - minDelay, phaseStep = Math.abs(1 - ratio) / sweep;
    const delayFor = phase => ratio > 1 ? maxDelay - phase * sweep : minDelay + phase * sweep;
    const weightFor = phase => Math.sin(Math.PI * phase) ** 2;
    const read = (channel, delay) => {
      const absolute = state.totalWritten - delay, lower = Math.floor(absolute), fraction = absolute - lower;
      const sample = position => position < 0 || position < state.totalWritten - state.ringLength ? 0 : state.ring[channel][((position % state.ringLength) + state.ringLength) % state.ringLength];
      const a = sample(lower), b = sample(lower + 1); return a + (b - a) * fraction;
    };
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < output.length; channel++) { const value = output[channel][frame]; if (!finite(value)) throw new RangeError("AUFX time-pitch input samples must be finite."); state.ring[channel][state.writeIndex] = value; }
      const phaseA = state.phase, phaseB = (phaseA + 0.5) % 1, weightA = weightFor(phaseA), weightB = weightFor(phaseB), weight = Math.max(Number.EPSILON, weightA + weightB);
      for (let channel = 0; channel < output.length; channel++) output[channel][frame] = (read(channel, delayFor(phaseA)) * weightA + read(channel, delayFor(phaseB)) * weightB) / weight;
      state.totalWritten++; state.writeIndex = (state.writeIndex + 1) % state.ringLength; state.phase = (state.phase + phaseStep) % 1;
    }
  }
}

function fft(real, imaginary, inverse = false) {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) { [real[index], real[reversed]] = [real[reversed], real[index]]; [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]]; }
  }
  for (let span = 2; span <= size; span <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / span, stepReal = Math.cos(angle), stepImaginary = Math.sin(angle), half = span >> 1;
    for (let start = 0; start < size; start += span) {
      let twiddleReal = 1, twiddleImaginary = 0;
      for (let offset = 0; offset < half; offset++) {
        const even = start + offset, odd = even + half, oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary, oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        const evenReal = real[even], evenImaginary = imaginary[even]; real[even] = evenReal + oddReal; imaginary[even] = evenImaginary + oddImaginary; real[odd] = evenReal - oddReal; imaginary[odd] = evenImaginary - oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary; twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal; twiddleReal = nextReal;
      }
    }
  }
  if (inverse) for (let index = 0; index < size; index++) { real[index] /= size; imaginary[index] /= size; }
}
function wrapPhase(value) { while (value > Math.PI) value -= 2 * Math.PI; while (value < -Math.PI) value += 2 * Math.PI; return value; }
function phaseVocoderStretch(input, stretch) {
  if (!input.length) return new Float32Array(0);
  if (Math.abs(stretch - 1) < 1e-12) return new Float32Array(input);
  let windowSize = 1024; while (windowSize > 128 && windowSize > input.length * 2) windowSize >>= 1;
  const analysisHop = Math.max(16, windowSize >> 3), synthesisHop = analysisHop * stretch, padding = windowSize;
  const padded = new Float64Array(input.length + padding * 2); padded.set(input, padding);
  const frameCount = Math.floor((padded.length - windowSize) / analysisHop) + 1, synthesisLength = Math.ceil((frameCount - 1) * synthesisHop) + windowSize + 2;
  const accumulated = new Float64Array(synthesisLength), normalization = new Float64Array(synthesisLength), previousPhase = new Float64Array(windowSize / 2 + 1), synthesisPhase = new Float64Array(windowSize / 2 + 1);
  const window = Float64Array.from({ length: windowSize }, (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / windowSize));
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const real = new Float64Array(windowSize), imaginary = new Float64Array(windowSize), analysisStart = frameIndex * analysisHop;
    for (let index = 0; index < windowSize; index++) real[index] = padded[analysisStart + index] * window[index];
    fft(real, imaginary);
    const outputReal = new Float64Array(windowSize), outputImaginary = new Float64Array(windowSize);
    for (let bin = 0; bin <= windowSize / 2; bin++) {
      const phase = Math.atan2(imaginary[bin], real[bin]), magnitude = Math.hypot(real[bin], imaginary[bin]), expected = 2 * Math.PI * bin * analysisHop / windowSize;
      if (frameIndex === 0) synthesisPhase[bin] = phase;
      else synthesisPhase[bin] += (2 * Math.PI * bin / windowSize + wrapPhase(phase - previousPhase[bin] - expected) / analysisHop) * synthesisHop;
      previousPhase[bin] = phase; outputReal[bin] = magnitude * Math.cos(synthesisPhase[bin]); outputImaginary[bin] = magnitude * Math.sin(synthesisPhase[bin]);
      if (bin > 0 && bin < windowSize / 2) { outputReal[windowSize - bin] = outputReal[bin]; outputImaginary[windowSize - bin] = -outputImaginary[bin]; }
    }
    fft(outputReal, outputImaginary, true);
    const synthesisStart = Math.round(frameIndex * synthesisHop);
    for (let index = 0; index < windowSize; index++) { const target = synthesisStart + index, weight = window[index]; accumulated[target] += outputReal[index] * weight; normalization[target] += weight * weight; }
  }
  const targetLength = Math.max(0, Math.round(input.length * stretch)), cropStart = Math.round(padding * stretch), output = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index++) { const source = cropStart + index, weight = normalization[source]; output[index] = weight > 1e-12 ? accumulated[source] / weight : 0; }
  return output;
}
function resampleExact(input, targetLength) {
  if (!targetLength) return new Float32Array(0);
  if (!input.length) return new Float32Array(targetLength);
  if (input.length === targetLength) return new Float32Array(input);
  const output = new Float32Array(targetLength), ratio = input.length / targetLength;
  for (let frame = 0; frame < targetLength; frame++) { const position = frame * ratio, lower = Math.min(input.length - 1, Math.floor(position)), upper = Math.min(input.length - 1, lower + 1), fraction = position - lower; output[frame] = input[lower] + (input[upper] - input[lower]) * fraction; }
  return output;
}

export function renderAUFXTimePitchBuffer(format, options, channels) {
  if (!format || !finite(format.sampleRate) || !Number.isInteger(format.channelCount) || format.channelCount < 1 || !finite(options?.pitchRatio) || options.pitchRatio < 0.5 || options.pitchRatio > 2 || !finite(options?.timeScale) || options.timeScale < 0.5 || options.timeScale > 2 || !Array.isArray(channels) || channels.length !== format.channelCount || channels.some(channel => !(channel instanceof Float32Array) || channel.length !== channels[0]?.length)) throw new RangeError("Invalid AUFX finite-buffer time-pitch request.");
  const inputFrames = channels[0]?.length ?? 0, outputFrames = Math.round(inputFrames * options.timeScale), sampleCount = inputFrames * format.channelCount, outputSampleCount = outputFrames * format.channelCount;
  if (!Number.isSafeInteger(outputFrames) || sampleCount > 4_194_304 || outputSampleCount > 16_777_216) throw new RangeError("AUFX finite-buffer time-pitch work exceeds its budget.");
  for (const channel of channels) for (let frame = 0; frame < channel.length; frame++) if (!finite(channel[frame])) throw new RangeError("AUFX time-pitch input samples must be finite.");
  const stretch = options.timeScale * options.pitchRatio;
  return Object.freeze({ frameLength: outputFrames, channels: Object.freeze(channels.map(channel => resampleExact(phaseVocoderStretch(channel, stretch), outputFrames))) });
}

export function createAUFXEffectRenderState(format, effect) { return effectState(format, effect); }
export function renderAUFXEffectBlock(format, effect, state, channels, frames) { AUFXAudioRenderRuntime.prototype.renderEffect.call({}, { effect, sampleRate: format.sampleRate }, state, channels, frames); }
export function createAUFXFIRRenderState(format, coefficients) { return { history: Array.from({ length: format.channelCount }, () => new Float64Array(coefficients.length)), cursor: 0 }; }
export function renderAUFXFIRBlock(coefficients, state, channels, frames) { AUFXAudioRenderRuntime.prototype.renderFIR.call({}, { coefficients }, state, channels, frames); }
export function createAUFXTimePitchRenderState(format, node) { return timePitchState(format, node); }
export function renderAUFXTimePitchBlock(node, state, channels, frames) { AUFXAudioRenderRuntime.prototype.renderTimePitch.call({}, node, state, channels, frames); }

// Requiring the AudioWorklet render clock prevents a browser-window import from registering.
if (typeof globalThis.AudioWorkletProcessor === "function" && typeof globalThis.registerProcessor === "function" && typeof globalThis.currentFrame === "number" && typeof globalThis.document === "undefined") {
  class Processor extends globalThis.AudioWorkletProcessor {
    constructor(options) { super(); this.paused = false; this.stopped = false; this.tapOutstanding = false; this.tapDropped = 0; this.quantumCount = 0; this.runtime = new AUFXAudioRenderRuntime(options.processorOptions.plan); this.port.onmessage = event => this.receive(event.data); }
    receive(message) { if (this.stopped) return; try { if (message.type === "stop") this.stopped = true; else if (message.type === "pause") this.paused = !!message.paused; else if (message.type === "tap-ack") this.tapOutstanding = false; else if (message.type === "replace-plan") { this.runtime.setPlan(message.plan, true); this.port.postMessage({ type: "plan-applied", version: this.runtime.plan.version, contextFrame: globalThis.currentFrame, players: this.runtime.plan.nodes.filter(node => node.kind === "player").map(node => ({ id: node.id, position: this.runtime.states.get(node.id).position })) }); } } catch (error) { this.port.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }); } }
    process(inputs, outputs) { if (this.stopped) return false; const output = outputs[0], frames = output[0]?.length ?? 0; for (const channel of output) channel.fill(0); if (this.paused || frames === 0) return true; try { const result = this.runtime.process(frames, output, inputs); for (const completion of result.completed) this.port.postMessage({ type: "complete", ...completion }); if ((++this.quantumCount & 7) === 0) this.port.postMessage({ type: "state", sampleTime: result.sampleTime, players: result.players }); if (this.runtime.plan.tapIds.length) { if (this.tapOutstanding) this.tapDropped++; else { this.tapOutstanding = true; for (const nodeId of this.runtime.plan.tapIds) { const tapFrames = this.runtime.frameCounts.get(nodeId) ?? frames, channels = this.runtime.scratch.get(nodeId).map(channel => channel.slice(0, tapFrames)); this.port.postMessage({ type: "tap", nodeId, channels, dropped: this.tapDropped }, channels.map(channel => channel.buffer)); } this.tapDropped = 0; } } return true; } catch (error) { this.port.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }); return false; } }
  }
  globalThis.registerProcessor("syncloudos-aufx-output", Processor);
}
