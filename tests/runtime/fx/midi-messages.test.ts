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

import { MIFXEncoder } from "../../../src/FX/MIDIFX/MIFXEncoder";
import { MIFXParser } from "../../../src/FX/MIDIFX/MIFXParser";
import type { MIFXMessage, MIFXParserEvent } from "../../../src/FX/MIDIFX/MIFXMessage";

const messages = (events: readonly MIFXParserEvent[]) => events
  .filter((event): event is Extract<MIFXParserEvent, { kind: "message" }> => event.kind === "message")
  .map((event) => event.message);

const errors = (events: readonly MIFXParserEvent[]) => events
  .filter((event): event is Extract<MIFXParserEvent, { kind: "error" }> => event.kind === "error")
  .map((event) => event.error);

describe("MIDIFX MIDI 1 messages", () => {
  it("roundtrips the fixed channel/system corpus without semantic normalization", () => {
    const corpus: readonly [readonly number[], MIFXMessage][] = [
      [[0x80, 60, 7], { kind: "note-off", channel: 0, note: 60, velocity: 7 }],
      [[0x90, 60, 0], { kind: "note-on", channel: 0, note: 60, velocity: 0 }],
      [[0xaf, 64, 99], { kind: "polyphonic-key-pressure", channel: 15, note: 64, pressure: 99 }],
      [[0xb4, 1, 127], { kind: "control-change", channel: 4, controller: 1, value: 127 }],
      [[0xc2, 42], { kind: "program-change", channel: 2, program: 42 }],
      [[0xd9, 55], { kind: "channel-pressure", channel: 9, pressure: 55 }],
      [[0xef, 0x7f, 0x7f], { kind: "pitch-bend", channel: 15, value: 16_383 }],
      [[0xf1, 0x12], { kind: "time-code-quarter-frame", value: 0x12 }],
      [[0xf2, 0x01, 0x40], { kind: "song-position", position: 8_193 }],
      [[0xf3, 7], { kind: "song-select", song: 7 }],
      [[0xf6], { kind: "tune-request" }],
      [[0xf8], { kind: "timing-clock" }],
      [[0xfa], { kind: "start" }],
      [[0xfb], { kind: "continue" }],
      [[0xfc], { kind: "stop" }],
      [[0xfe], { kind: "active-sensing" }],
      [[0xff], { kind: "reset" }],
      [[0xf0, 0x01, 0x02, 0x7f, 0xf7], { kind: "sysex", data: new Uint8Array([0x01, 0x02, 0x7f]) }],
    ];

    for (const [wire, expected] of corpus) {
      const parser = new MIFXParser();
      const parsed = messages(parser.push(new Uint8Array(wire)));
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(expected);
      expect(MIFXEncoder.encode(parsed[0]!)).toEqual(new Uint8Array(wire));
    }

    for (let channel = 0; channel < 16; channel += 1) {
      const wire = new Uint8Array([0x90 | channel, 72, 100]);
      const parsed = messages(new MIFXParser().push(wire));
      expect(parsed[0]).toEqual({ kind: "note-on", channel, note: 72, velocity: 100 });
    }
  });

  it("preserves all 14 pitch-bend bits and validates complete output messages", () => {
    expect(MIFXEncoder.encode({ kind: "pitch-bend", channel: 3, value: 8_192 })).toEqual(new Uint8Array([0xe3, 0x00, 0x40]));
    expect(() => MIFXEncoder.encode({ kind: "pitch-bend", channel: 3, value: 16_384 } as MIFXMessage)).toThrow(/pitch bend/i);
    expect(() => MIFXEncoder.encode({ kind: "note-on", channel: 16, note: 1, velocity: 1 } as MIFXMessage)).toThrow(/channel/i);
    expect(() => MIFXEncoder.encode({ kind: "note-on", channel: 0, note: 128, velocity: 1 } as MIFXMessage)).toThrow(/note/i);
    expect(() => MIFXEncoder.encode({ kind: "sysex", data: new Uint8Array([0x01, 0x80]) })).toThrow(/sysex.*data/i);
  });

  it("parses running status across fragments while realtime bytes stay out-of-band", () => {
    const parser = new MIFXParser();
    const first = parser.push(new Uint8Array([0x90, 60, 100, 61, 0, 0xf8, 62]));
    expect(messages(first)).toEqual([
      { kind: "note-on", channel: 0, note: 60, velocity: 100 },
      { kind: "note-on", channel: 0, note: 61, velocity: 0 },
      { kind: "timing-clock" },
    ]);
    expect(errors(first)).toEqual([]);

    const second = parser.push(new Uint8Array([90, 0xc1, 10, 11, 0xf6, 12]));
    expect(messages(second)).toEqual([
      { kind: "note-on", channel: 0, note: 62, velocity: 90 },
      { kind: "program-change", channel: 1, program: 10 },
      { kind: "program-change", channel: 1, program: 11 },
      { kind: "tune-request" },
    ]);
    expect(errors(second)).toEqual([
      expect.objectContaining({ code: "unexpected-data", offset: 12, recovery: "drop-byte" }),
    ]);
  });

  it("keeps realtime messages interleaved with fragmented SysEx without terminating it", () => {
    const parser = new MIFXParser();
    expect(parser.push(new Uint8Array([0xf0, 0x01]))).toEqual([]);
    expect(parser.push(new Uint8Array([0xf8, 0x02]))).toEqual([
      { kind: "message", offset: 2, message: { kind: "timing-clock" } },
    ]);
    expect(parser.push(new Uint8Array([0xfe, 0xf7]))).toEqual([
      { kind: "message", offset: 4, message: { kind: "active-sensing" } },
      { kind: "message", offset: 0, message: { kind: "sysex", data: new Uint8Array([0x01, 0x02]) } },
    ]);
  });

  it("reports exact malformed/truncated offsets and resynchronizes at later statuses", () => {
    const parser = new MIFXParser();
    const events = parser.push(new Uint8Array([
      0x01,
      0xf4,
      0x90, 60,
      0xf1, 0x07,
      0xf7,
      0x90, 64, 1,
    ]));

    expect(errors(events)).toEqual([
      expect.objectContaining({ code: "unexpected-data", offset: 0, recovery: "drop-byte" }),
      expect.objectContaining({ code: "invalid-status", offset: 1, recovery: "drop-byte" }),
      expect.objectContaining({ code: "truncated-message", offset: 4, messageStartOffset: 2, recovery: "restart-at-status" }),
      expect.objectContaining({ code: "unexpected-eox", offset: 6, recovery: "drop-byte" }),
    ]);
    expect(messages(events)).toEqual([
      { kind: "time-code-quarter-frame", value: 0x07 },
      { kind: "note-on", channel: 0, note: 64, velocity: 1 },
    ]);

    const truncated = new MIFXParser();
    truncated.push(new Uint8Array([0xe2, 0x01]));
    expect(errors(truncated.finish())).toEqual([
      expect.objectContaining({ code: "truncated-message", offset: 0, messageStartOffset: 0, recovery: "reset-at-end" }),
    ]);
  });

  it("bounds unterminated SysEx storage and recovers after overflow", () => {
    const parser = new MIFXParser({ maxSysExBytes: 5 });
    const overflow = parser.push(new Uint8Array([0xf0, 1, 2, 3, 4]));
    expect(errors(overflow)).toEqual([
      expect.objectContaining({ code: "sysex-too-large", offset: 4, messageStartOffset: 0, recovery: "discard-sysex" }),
    ]);
    expect(parser.bufferedByteCount).toBe(0);

    const hugeContinuation = new Uint8Array(100_000).fill(1);
    expect(parser.push(hugeContinuation)).toEqual([]);
    expect(parser.bufferedByteCount).toBe(0);

    const recovered = parser.push(new Uint8Array([0xf8, 0xf7, 0x9f, 7, 8]));
    expect(messages(recovered)).toEqual([
      { kind: "timing-clock" },
      { kind: "note-on", channel: 15, note: 7, velocity: 8 },
    ]);
    expect(errors(recovered)).toEqual([]);
  });
});
