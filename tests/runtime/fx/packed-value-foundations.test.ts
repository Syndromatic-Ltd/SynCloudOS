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

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

it("executes and typechecks LocationFX and MIDIFX from an independently installed SDK archive", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-fx-values-packed-");
  const jsdomVersion = JSON.parse(readFileSync(join(process.cwd(), "node_modules/jsdom/package.json"), "utf8")).version as string;
  runNode([
    consumer.npm,
    "install",
    "--prefer-offline",
    "--ignore-scripts",
    "--package-lock=false",
    `jsdom@${jsdomVersion}`,
  ], consumer.root);
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import assert from "node:assert/strict";
import { LFXCoordinate, LFXLocation, lfxCourseRadiansFromDegrees } from "@syndromatic/syncloudos/fx/location";
import { MIFXEncoder, MIFXParser, MIFXProtocolConversion, MIFXScheduler, MIFXUniversalPacket } from "@syndromatic/syncloudos/fx/midi";
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";
import { createSynWare } from "@syndromatic/syncloudos/sdk/testing";
import { createDeterministicRuntimeEnvironment, createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { JSDOM } from "jsdom";

const greenwich = new LFXCoordinate(51.4779, -0.0015);
const paris = new LFXCoordinate(48.8566, 2.3522);
assert.ok(greenwich.distanceTo(paris) > 300000);
const fix = new LFXLocation({
  coordinate: greenwich,
  observedAtUnixMilliseconds: 1700000000000,
  receivedAtMonotonicSeconds: 4.5,
  horizontalAccuracyMetres: 3,
  altitudeMetres: null,
  altitudeAccuracyMetres: null,
  speedMetresPerSecond: 0,
  courseRadians: lfxCourseRadiansFromDegrees(90),
});
assert.equal(fix.altitudeMetres, null);
assert.equal(fix.speedMetresPerSecond, 0);
const deterministic = createDeterministicRuntimeEnvironment();
await assert.rejects(
  deterministic.environment.location.getAuthorizationStatus(),
  (error) => error instanceof DOMException && error.name === "SecurityError",
);
deterministic.adapters.location.allow();
deterministic.adapters.location.setAuthorizationStatus("granted");
deterministic.adapters.location.setLocation(fix);
assert.equal(await deterministic.environment.location.getAuthorizationStatus(), "granted");
assert.equal((await deterministic.environment.location.current({ signal: new AbortController().signal })).speedMetresPerSecond, 0);
const deterministicWatchValues = [];
const deterministicWatchController = new AbortController();
const deterministicWatch = deterministic.environment.location.watch(
  { accuracy: "high", signal: deterministicWatchController.signal },
  (location) => deterministicWatchValues.push(location.receivedAtMonotonicSeconds),
);
deterministic.adapters.location.emitLocation(fix);
assert.deepEqual(deterministicWatchValues, [4.5]);
deterministicWatch.dispose();
deterministic.adapters.location.emitLocation(new LFXLocation({
  coordinate: paris,
  observedAtUnixMilliseconds: 1700000001000,
  receivedAtMonotonicSeconds: 5.5,
  horizontalAccuracyMetres: 3,
  altitudeMetres: null,
  altitudeAccuracyMetres: null,
  speedMetresPerSecond: 0,
  courseRadians: null,
}));
assert.deepEqual(deterministicWatchValues, [4.5]);
assert.equal(deterministic.environment.midi?.isAvailable(), true);
assert.deepEqual(deterministic.adapters.midi.calls(), []);
deterministic.adapters.midi.setAvailable(false);
assert.equal(deterministic.environment.midi?.isAvailable(), false);
deterministic.adapters.midi.setAvailable(true);
deterministic.adapters.midi.allow();
assert.equal(
  await deterministic.environment.midi?.requestAuthorization({ sysex: false, signal: new AbortController().signal }),
  "granted",
);
assert.deepEqual(deterministic.adapters.midi.calls().map((call) => call.operation), ["midi.authorize"]);
deterministic.dispose();

const parser = new MIFXParser();
const parsed = parser.push(new Uint8Array([0x90, 60, 0, 61, 127]));
assert.deepEqual(parsed.filter((event) => event.kind === "message").map((event) => event.message), [
  { kind: "note-on", channel: 0, note: 60, velocity: 0 },
  { kind: "note-on", channel: 0, note: 61, velocity: 127 },
]);
assert.deepEqual([...MIFXEncoder.encode({ kind: "pitch-bend", channel: 15, value: 16383 })], [0xef, 0x7f, 0x7f]);
const ump = new MIFXUniversalPacket([0x41923c00, 0x80000000]);
assert.equal(ump.protocolVersion, "ump-1.1.2");
assert.deepEqual(ump.midi2ChannelVoice(), { kind: "note-on", channel: 2, note: 60, velocity: 0x8000, attributeType: 0, attributeData: 0 });
assert.deepEqual(MIFXProtocolConversion.toMIDI1(ump, { precisionLoss: "allow" }), {
  message: { kind: "note-on", channel: 2, note: 60, velocity: 64 },
  losses: ["velocity-16-to-7-bit"],
});
const synthFormat = new AUFXAudioFormat(48_000, 1);
let synthPeak = 0;
const scheduledParser = new MIFXParser();
const scheduler = new MIFXScheduler({
  clock: {
    now: () => ({ position: MEFXTime.finite(2n, 1), domain: "installed:midi", generation: 0, uncertaintySeconds: 0 }),
    subscribeDiscontinuities: () => () => undefined,
  },
  output: {
    endpoint: { id: "installed", direction: "output", manufacturer: null, name: "Installed synth", version: null, state: "connected", connection: "open", generation: 1 },
    send(data) {
      const event = scheduledParser.push(data).find(entry => entry.kind === "message");
      if (!event || event.kind !== "message" || event.message.kind !== "note-on") return;
      const frequency = 440 * 2 ** ((event.message.note - 69) / 12);
      const buffer = new AUFXAudioPCMBuffer(synthFormat, 240);
      buffer.frameLength = 240;
      for (let frame = 0; frame < buffer.frameLength; frame++) {
        buffer.setSample(0, frame, Math.sin(2 * Math.PI * frequency * frame / synthFormat.sampleRate) * (event.message.velocity / 127));
        synthPeak = Math.max(synthPeak, Math.abs(buffer.getSample(0, frame)));
      }
    },
    dispose() {},
  },
});
assert.equal(scheduler.schedule(new Uint8Array([0x90, 69, 100]), MEFXTime.finite(2n, 1)).state, "submitted");
assert.ok(synthPeak > 0.7);
scheduler.dispose();

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/location" });
Object.defineProperty(dom.window, "requestAnimationFrame", {
  configurable: true,
  value: (callback) => dom.window.setTimeout(() => callback(Date.now()), 0),
});
Object.defineProperty(dom.window, "cancelAnimationFrame", {
  configurable: true,
  value: (handle) => dom.window.clearTimeout(handle),
});
Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
for (const key of ["HTMLElement", "Element", "Node", "Event", "CustomEvent", "MutationObserver"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: dom.window.requestAnimationFrame.bind(dom.window),
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: dom.window.cancelAnimationFrame.bind(dom.window),
});

const mountedApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.packed-location",
    version: "1.0.0",
    title: "Packed Location",
    routes: [{ path: "/packed-location", primary: true }],
    permissions: ["location.read", "location.request"],
  },
  root() { return null; },
});
const host = createSynWareTestHost({ app: mountedApp, document: dom.window.document });
await host.render();
host.adapters.location.allow();
host.adapters.location.setAuthorizationStatus("granted");
host.adapters.permissions.allow();
host.adapters.policy.allow();
const mountedManager = host.appContext.location.createManager();
const mountedWatchValues = [];
mountedManager.watch(
  { accuracy: "high", maximumAgeSeconds: 0, minimumIntervalSeconds: 0 },
  (location) => mountedWatchValues.push(location.receivedAtMonotonicSeconds),
);
host.adapters.location.emitLocation(fix);
assert.deepEqual(mountedWatchValues, [4.5]);
await host.dispose();
host.adapters.location.emitLocation(new LFXLocation({
  coordinate: paris,
  observedAtUnixMilliseconds: 1700000002000,
  receivedAtMonotonicSeconds: 6.5,
  horizontalAccuracyMetres: 3,
  altitudeMetres: null,
  altitudeAccuracyMetres: null,
  speedMetresPerSecond: 0,
  courseRadians: null,
}));
assert.deepEqual(mountedWatchValues, [4.5]);
dom.window.close();
console.log("LocationFX and MIDIFX installed operations passed");
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("LocationFX and MIDIFX installed operations passed");

  writeFileSync(join(consumer.root, "consumer.ts"), `
import { LFXCoordinate, LFXLocation } from "@syndromatic/syncloudos/fx/location";
import type { LFXAccuracy, LFXAuthorizationStatus, LFXLocationDescriptor, LFXLocationManager, LFXLocationRequestOptions, LFXLocationWatchOptions } from "@syndromatic/syncloudos/fx/location";
import { MIFXEncoder, MIFXParser, MIFXProtocolConversion, MIFXScheduler, MIFXUniversalPacket } from "@syndromatic/syncloudos/fx/midi";
import type { MIFXAccess, MIFXCapabilities, MIFXClient, MIFXMessage, MIFXParserEvent, MIFXParserOptions, MIFXProtocolConversionResult } from "@syndromatic/syncloudos/fx/midi";
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
import { useLocation, useMIDI } from "@syndromatic/syncloudos/sdk";
import { createDeterministicRuntimeEnvironment } from "@syndromatic/syncloudos/sdk/testing";

const coordinate = new LFXCoordinate(0, 0);
const descriptor: LFXLocationDescriptor = {
  coordinate,
  observedAtUnixMilliseconds: 0,
  receivedAtMonotonicSeconds: 0,
  horizontalAccuracyMetres: 1,
  altitudeMetres: null,
  altitudeAccuracyMetres: null,
  speedMetresPerSecond: null,
  courseRadians: null,
};
const location = new LFXLocation(descriptor);
const desired: LFXAccuracy = "high";
const authorization: LFXAuthorizationStatus = "unknown";
const request: LFXLocationRequestOptions = { accuracy: desired, maximumAgeSeconds: 2, timeoutSeconds: 5 };
const watchOptions: LFXLocationWatchOptions = { accuracy: desired, maximumAgeSeconds: 2, minimumIntervalSeconds: 0 };
const hook: () => LFXLocationManager = useLocation;
const midiHook: () => MIFXAccess = useMIDI;
const midiCapabilities: MIFXCapabilities = {
  apiAvailable: false,
  transportProtocol: "midi1",
  authorization: "unavailable",
  sysexAuthorization: "unavailable",
  connectedEndpointCount: 0,
};
const acceptsMIDIClient = (_client: MIFXClient) => undefined;
const deterministic = createDeterministicRuntimeEnvironment();
deterministic.adapters.location.setAuthorizationStatus(authorization);
deterministic.adapters.midi.setAvailable(false);
void deterministic.environment.location;
void deterministic.environment.midi;
deterministic.dispose();
const options: MIFXParserOptions = { maxSysExBytes: 1024 };
const parser = new MIFXParser(options);
const message: MIFXMessage = { kind: "note-on", channel: 0, note: 60, velocity: 0 };
const encoded = MIFXEncoder.encode(message);
const events: readonly MIFXParserEvent[] = parser.push(encoded);
const packet = new MIFXUniversalPacket([0x22933c64]);
const converted: MIFXProtocolConversionResult = MIFXProtocolConversion.toMIDI1(packet, { precisionLoss: "reject" });
const scheduler = new MIFXScheduler({
  clock: { now: () => ({ position: MEFXTime.finite(0n, 1), domain: "types", generation: 0, uncertaintySeconds: 0 }), subscribeDiscontinuities: () => () => undefined },
  output: { endpoint: { id: "types", direction: "output", manufacturer: null, name: null, version: null, state: "connected", connection: "open", generation: 0 }, send() {}, dispose() {} },
});
scheduler.dispose();
void location; void desired; void authorization; void request; void watchOptions; void hook; void midiHook; void midiCapabilities; void acceptsMIDIClient; void events; void converted;
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    files: ["consumer.ts"],
  }, null, 2));
  expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
}, 120000);
