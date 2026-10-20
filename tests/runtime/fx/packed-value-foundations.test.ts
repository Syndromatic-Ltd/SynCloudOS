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
  writeFileSync(join(consumer.root, "specimen.mjs"), "\nimport assert from \"node:assert/strict\";\nimport { LFXCoordinate, LFXLocation, lfxCourseRadiansFromDegrees } from \"@syndromatic/syncloudos/fx/location\";\nimport { MIFXEncoder, MIFXParser, MIFXProtocolConversion, MIFXScheduler, MIFXUniversalPacket } from \"@syndromatic/syncloudos/fx/midi\";\nimport { MEFXTime } from \"@syndromatic/syncloudos/fx/media\";\nimport { AUFXAudioFormat, AUFXAudioPCMBuffer } from \"@syndromatic/syncloudos/fx/audio\";\nimport { createSynWare } from \"@syndromatic/syncloudos/sdk/testing\";\nimport { createDeterministicRuntimeEnvironment, createSynWareTestHost } from \"@syndromatic/syncloudos/sdk/testing\";\nimport { JSDOM } from \"jsdom\";\n\nconst greenwich = new LFXCoordinate(51.4779, -0.0015);\nconst paris = new LFXCoordinate(48.8566, 2.3522);\nassert.ok(greenwich.distanceTo(paris) > 300000);\nconst fix = new LFXLocation({\n  coordinate: greenwich,\n  observedAtUnixMilliseconds: 1700000000000,\n  receivedAtMonotonicSeconds: 4.5,\n  horizontalAccuracyMetres: 3,\n  altitudeMetres: null,\n  altitudeAccuracyMetres: null,\n  speedMetresPerSecond: 0,\n  courseRadians: lfxCourseRadiansFromDegrees(90),\n});\nassert.equal(fix.altitudeMetres, null);\nassert.equal(fix.speedMetresPerSecond, 0);\nconst deterministic = createDeterministicRuntimeEnvironment();\nawait assert.rejects(\n  deterministic.environment.location.getAuthorizationStatus(),\n  (error) => error instanceof DOMException && error.name === \"SecurityError\",\n);\ndeterministic.adapters.location.allow();\ndeterministic.adapters.location.setAuthorizationStatus(\"granted\");\ndeterministic.adapters.location.setLocation(fix);\nassert.equal(await deterministic.environment.location.getAuthorizationStatus(), \"granted\");\nassert.equal((await deterministic.environment.location.current({ signal: new AbortController().signal })).speedMetresPerSecond, 0);\nconst deterministicWatchValues = [];\nconst deterministicWatchController = new AbortController();\nconst deterministicWatch = deterministic.environment.location.watch(\n  { accuracy: \"high\", signal: deterministicWatchController.signal },\n  (location) => deterministicWatchValues.push(location.receivedAtMonotonicSeconds),\n);\ndeterministic.adapters.location.emitLocation(fix);\nassert.deepEqual(deterministicWatchValues, [4.5]);\ndeterministicWatch.dispose();\ndeterministic.adapters.location.emitLocation(new LFXLocation({\n  coordinate: paris,\n  observedAtUnixMilliseconds: 1700000001000,\n  receivedAtMonotonicSeconds: 5.5,\n  horizontalAccuracyMetres: 3,\n  altitudeMetres: null,\n  altitudeAccuracyMetres: null,\n  speedMetresPerSecond: 0,\n  courseRadians: null,\n}));\nassert.deepEqual(deterministicWatchValues, [4.5]);\nassert.equal(deterministic.environment.midi?.isAvailable(), true);\nassert.deepEqual(deterministic.adapters.midi.calls(), []);\ndeterministic.adapters.midi.setAvailable(false);\nassert.equal(deterministic.environment.midi?.isAvailable(), false);\ndeterministic.adapters.midi.setAvailable(true);\ndeterministic.adapters.midi.allow();\nassert.equal(\n  await deterministic.environment.midi?.requestAuthorization({ sysex: false, signal: new AbortController().signal }),\n  \"granted\",\n);\nassert.deepEqual(deterministic.adapters.midi.calls().map((call) => call.operation), [\"midi.authorize\"]);\ndeterministic.dispose();\n\nconst parser = new MIFXParser();\nconst parsed = parser.push(new Uint8Array([0x90, 60, 0, 61, 127]));\nassert.deepEqual(parsed.filter((event) => event.kind === \"message\").map((event) => event.message), [\n  { kind: \"note-on\", channel: 0, note: 60, velocity: 0 },\n  { kind: \"note-on\", channel: 0, note: 61, velocity: 127 },\n]);\nassert.deepEqual([...MIFXEncoder.encode({ kind: \"pitch-bend\", channel: 15, value: 16383 })], [0xef, 0x7f, 0x7f]);\nconst ump = new MIFXUniversalPacket([0x41923c00, 0x80000000]);\nassert.equal(ump.protocolVersion, \"ump-1.1.2\");\nassert.deepEqual(ump.midi2ChannelVoice(), { kind: \"note-on\", channel: 2, note: 60, velocity: 0x8000, attributeType: 0, attributeData: 0 });\nassert.deepEqual(MIFXProtocolConversion.toMIDI1(ump, { precisionLoss: \"allow\" }), {\n  message: { kind: \"note-on\", channel: 2, note: 60, velocity: 64 },\n  losses: [\"velocity-16-to-7-bit\"],\n});\nconst synthFormat = new AUFXAudioFormat(48_000, 1);\nlet synthPeak = 0;\nconst scheduledParser = new MIFXParser();\nconst scheduler = new MIFXScheduler({\n  clock: {\n    now: () => ({ position: MEFXTime.finite(2n, 1), domain: \"installed:midi\", generation: 0, uncertaintySeconds: 0 }),\n    subscribeDiscontinuities: () => () => undefined,\n  },\n  output: {\n    endpoint: { id: \"installed\", direction: \"output\", manufacturer: null, name: \"Installed synth\", version: null, state: \"connected\", connection: \"open\", generation: 1 },\n    send(data) {\n      const event = scheduledParser.push(data).find(entry => entry.kind === \"message\");\n      if (!event || event.kind !== \"message\" || event.message.kind !== \"note-on\") return;\n      const frequency = 440 * 2 ** ((event.message.note - 69) / 12);\n      const buffer = new AUFXAudioPCMBuffer(synthFormat, 240);\n      buffer.frameLength = 240;\n      for (let frame = 0; frame < buffer.frameLength; frame++) {\n        buffer.setSample(0, frame, Math.sin(2 * Math.PI * frequency * frame / synthFormat.sampleRate) * (event.message.velocity / 127));\n        synthPeak = Math.max(synthPeak, Math.abs(buffer.getSample(0, frame)));\n      }\n    },\n    dispose() {},\n  },\n});\nassert.equal(scheduler.schedule(new Uint8Array([0x90, 69, 100]), MEFXTime.finite(2n, 1)).state, \"submitted\");\nassert.ok(synthPeak > 0.7);\nscheduler.dispose();\n\nconst dom = new JSDOM(\"<!doctype html><html><body></body></html>\", { url: \"https://example.test/location\" });\nObject.defineProperty(dom.window, \"requestAnimationFrame\", {\n  configurable: true,\n  value: (callback) => dom.window.setTimeout(() => callback(Date.now()), 0),\n});\nObject.defineProperty(dom.window, \"cancelAnimationFrame\", {\n  configurable: true,\n  value: (handle) => dom.window.clearTimeout(handle),\n});\nObject.defineProperty(globalThis, \"window\", { configurable: true, value: dom.window });\nObject.defineProperty(globalThis, \"document\", { configurable: true, value: dom.window.document });\nObject.defineProperty(globalThis, \"navigator\", { configurable: true, value: dom.window.navigator });\nfor (const key of [\"HTMLElement\", \"Element\", \"Node\", \"Event\", \"CustomEvent\", \"MutationObserver\"]) {\n  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });\n}\nObject.defineProperty(globalThis, \"requestAnimationFrame\", {\n  configurable: true,\n  value: dom.window.requestAnimationFrame.bind(dom.window),\n});\nObject.defineProperty(globalThis, \"cancelAnimationFrame\", {\n  configurable: true,\n  value: dom.window.cancelAnimationFrame.bind(dom.window),\n});\n\nconst mountedApp = createSynWare({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.syndromatic.packed-location\",\n    version: \"1.0.0\",\n    displayName: \"Packed Location\",\n    routes: [{ path: \"/packed-location\", primary: true }],\n    permissions: [\"location.read\", \"location.request\"],\n  },\n  root() { return null; },\n});\nconst host = createSynWareTestHost({ app: mountedApp, document: dom.window.document });\nawait host.render();\nhost.adapters.location.allow();\nhost.adapters.location.setAuthorizationStatus(\"granted\");\nhost.adapters.permissions.allow();\nhost.adapters.policy.allow();\nconst mountedManager = host.appContext.location.createManager();\nconst mountedWatchValues = [];\nmountedManager.watch(\n  { accuracy: \"high\", maximumAgeSeconds: 0, minimumIntervalSeconds: 0 },\n  (location) => mountedWatchValues.push(location.receivedAtMonotonicSeconds),\n);\nhost.adapters.location.emitLocation(fix);\nassert.deepEqual(mountedWatchValues, [4.5]);\nawait host.dispose();\nhost.adapters.location.emitLocation(new LFXLocation({\n  coordinate: paris,\n  observedAtUnixMilliseconds: 1700000002000,\n  receivedAtMonotonicSeconds: 6.5,\n  horizontalAccuracyMetres: 3,\n  altitudeMetres: null,\n  altitudeAccuracyMetres: null,\n  speedMetresPerSecond: 0,\n  courseRadians: null,\n}));\nassert.deepEqual(mountedWatchValues, [4.5]);\ndom.window.close();\nconsole.log(\"LocationFX and MIDIFX installed operations passed\");\n");
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
