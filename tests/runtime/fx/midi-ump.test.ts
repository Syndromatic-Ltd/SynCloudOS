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

import { describe, expect, it } from "vitest";
import {
  MIFXProtocolConversion,
  MIFXProtocolLossError,
  MIFXUniversalPacket,
} from "../../../src/FX/MIDIFX/public";
import { MIDIService } from "../../../src/SynCloudOS/MIDIFX/MIDIService";

const adapter = {
  isAvailable: () => true,
  async requestAuthorization() { return "granted" as const; },
  getEndpoints: () => [],
  subscribeStateChange: () => () => undefined,
  async openInput() { throw new Error("unused"); },
  async openOutput() { throw new Error("unused"); },
  dispose() {},
};

describe("MIDI 2.0 UMP 1.1.2 value subset", () => {
  it("validates utility, system and MIDI 1 channel-voice packet sizes and groups", () => {
    const utility = new MIFXUniversalPacket([0x00000000]);
    expect(utility.protocolVersion).toBe("ump-1.1.2");
    expect(utility.messageType).toBe(0x0);
    expect(utility.group).toBe(0);
    expect(utility.kind).toBe("utility");

    const timingClock = new MIFXUniversalPacket([0x11f80000]);
    expect(timingClock.kind).toBe("system");
    expect(timingClock.group).toBe(1);
    expect(timingClock.toMIDI1Message()).toEqual({ kind: "timing-clock" });

    const noteOn = new MIFXUniversalPacket([0x22933c64]);
    expect(noteOn.kind).toBe("midi1-channel-voice");
    expect(noteOn.group).toBe(2);
    expect(noteOn.toMIDI1Message()).toEqual({ kind: "note-on", channel: 3, note: 60, velocity: 100 });

    expect(() => new MIFXUniversalPacket([])).toThrow(/word/i);
    expect(() => new MIFXUniversalPacket([0x40000000])).toThrow(/word count/i);
    expect(() => new MIFXUniversalPacket([0x20000000, 0])).toThrow(/word count/i);
    expect(() => MIFXUniversalPacket.fromMIDI1Message(16, { kind: "note-on", channel: 0, note: 60, velocity: 64 })).toThrow(/group/i);
  });

  it("parses the declared MIDI 2 channel-voice subset without implying hardware transport", () => {
    const noteOn = new MIFXUniversalPacket([0x41923c00, 0x80000000]);
    expect(noteOn.kind).toBe("midi2-channel-voice");
    expect(noteOn.group).toBe(1);
    expect(noteOn.midi2ChannelVoice()).toEqual({
      kind: "note-on",
      channel: 2,
      note: 60,
      velocity: 0x8000,
      attributeType: 0,
      attributeData: 0,
    });

    const bend = new MIFXUniversalPacket([0x40e00000, 0x80000000]);
    expect(bend.midi2ChannelVoice()).toEqual({ kind: "pitch-bend", channel: 0, value: 0x80000000 });

    const service = new MIDIService(adapter);
    const access = service.createAccess();
    expect(access.getCapabilities().transportProtocol).toBe("midi1");
    access.dispose();
    service.dispose();
  });

  it("rejects reserved message types and unsupported MIDI 2 status values explicitly", () => {
    expect(() => new MIFXUniversalPacket([0x60000000])).toThrow(/unsupported.*message type/i);
    const unsupportedStatus = new MIFXUniversalPacket([0x41403c00, 0]);
    expect(() => unsupportedStatus.midi2ChannelVoice()).toThrow(/unsupported.*status/i);
  });

  it("requires an explicit loss policy when reducing MIDI 2 precision to MIDI 1", () => {
    const exact = new MIFXUniversalPacket([0x41923c00, 0xffff0000]);
    expect(MIFXProtocolConversion.toMIDI1(exact, { precisionLoss: "reject" })).toEqual({
      message: { kind: "note-on", channel: 2, note: 60, velocity: 127 },
      losses: [],
    });

    const lossy = new MIFXUniversalPacket([0x41923c00, 0x80000000]);
    expect(() => MIFXProtocolConversion.toMIDI1(lossy, { precisionLoss: "reject" })).toThrow(MIFXProtocolLossError);
    expect(MIFXProtocolConversion.toMIDI1(lossy, { precisionLoss: "allow" })).toEqual({
      message: { kind: "note-on", channel: 2, note: 60, velocity: 64 },
      losses: ["velocity-16-to-7-bit"],
    });

    const bend = new MIFXUniversalPacket([0x40e00000, 0x80000000]);
    expect(MIFXProtocolConversion.toMIDI1(bend, { precisionLoss: "allow" })).toEqual({
      message: { kind: "pitch-bend", channel: 0, value: 8192 },
      losses: ["pitch-bend-32-to-14-bit"],
    });
  });

  it("round-trips selected specification-derived UMP words losslessly", () => {
    for (const words of [[0x00000000], [0x11f80000], [0x22933c64], [0x41923c00, 0x80000000], [0x40e00000, 0x80000000]]) {
      const packet = new MIFXUniversalPacket(words);
      expect([...packet.words]).toEqual(words);
      expect([...MIFXUniversalPacket.fromBytes(packet.toBytes()).words]).toEqual(words);
    }
    expect(() => MIFXUniversalPacket.fromBytes(new Uint8Array([0x20, 0, 0]))).toThrow(/multiple of four/i);
  });
});
