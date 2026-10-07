# MIDIFX

MIDIFX (`MIFX`) is the web-native analogue of Core MIDI. It connects an application to MIDI hardware and software instruments, turns raw bytes into typed messages and back, speaks the Universal MIDI Packet (UMP) format of MIDI 2.0, converts MIDI 2.0 messages down to MIDI 1.0 without hiding what that costs, and sends events at precise times against a shared clock.

The framework separates three concerns.

- **Messages.** `MIFXMessage` is a plain tagged value for every MIDI 1.0 message. `MIFXEncoder` turns a message into wire bytes and `MIFXParser` turns a byte stream back into messages, with defined recovery from corrupt input. These are pure code with no browser dependency.
- **Packets.** `MIFXUniversalPacket` models the 32-bit words of UMP, and `MIFXProtocolConversion` converts MIDI 2.0 channel voice messages to MIDI 1.0 with an explicit policy for lost precision.
- **Devices.** `MIFXAccess` lists endpoints, receives input and gives exclusive output leases. It comes from the mounted session, so the host can require the user's permission and release everything when your application closes.

Browsers expose MIDI through the Web MIDI API, which carries MIDI 1.0 bytes, and several browsers do not offer it at all. MIDIFX reports what the environment supports, so an application can explain a missing device instead of failing silently.

```ts
import { MIFXEncoder, MIFXParser } from "@syndromatic/syncloudos/fx/midi";
```

## At a glance

| | |
| --- | --- |
| Prefix | `MIFX` |
| Entry | `@syndromatic/syncloudos/fx/midi` |
| Hook | `useSynWareMIDI`, from `@syndromatic/syncloudos/sdk` |
| Permissions | `midi.access` for devices, and `midi.sysex` in addition for system exclusive access |
| Analogue | Core MIDI (`MIDIClientRef`, `MIDIEndpointRef`, `MIDIEventList`, UMP conversion) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Messages | `MIFXMessage`, `MIFXEncoder` |
| Parsing | `MIFXParser`, `MIFXParserOptions`, `MIFXParserEvent`, `MIFXParseError`, `MIFXParserErrorCode`, `MIFXParserRecovery` |
| Universal packets | `MIFXUniversalPacket`, `MIFXUniversalPacketKind`, `MIFXMIDI2ChannelVoice`, `MIFX_UMP_PROTOCOL_VERSION` |
| Conversion | `MIFXProtocolConversion`, `MIFXProtocolConversionOptions`, `MIFXProtocolConversionResult`, `MIFXPrecisionLossPolicy`, `MIFXProtocolLossError` |
| Devices | `MIFXClient`, `MIFXAccess`, `MIFXCapabilities`, `MIFXAuthorizationRequest`, `MIFXAuthorizationResult`, `MIFXAuthorizationState`, `MIFXEndpointSnapshot`, `MIFXEndpointDirection`, `MIFXEndpointState`, `MIFXEndpointConnection`, `MIFXEndpointListener`, `MIFXInputListener`, `MIFXInputPacket`, `MIFXInputSubscription`, `MIFXOutputLease`, `MIFXSubscription` |
| Timing | `MIFXScheduler`, `MIFXSchedulerOptions`, `MIFXScheduledSend`, `MIFXScheduledSendState` |

## Messages

### `MIFXMessage`

A discriminated union on `kind`. Every value is immutable data.

| Kind | Fields | Range |
| --- | --- | --- |
| `"note-on"`, `"note-off"` | `channel`, `note`, `velocity` | channel 0 to 15, others 0 to 127 |
| `"polyphonic-key-pressure"` | `channel`, `note`, `pressure` | 0 to 127 |
| `"control-change"` | `channel`, `controller`, `value` | 0 to 127 |
| `"program-change"` | `channel`, `program` | 0 to 127 |
| `"channel-pressure"` | `channel`, `pressure` | 0 to 127 |
| `"pitch-bend"` | `channel`, `value` | 0 to 16383, where 8192 is centre |
| `"time-code-quarter-frame"` | `value` | 0 to 127 |
| `"song-position"` | `position` | 0 to 16383 |
| `"song-select"` | `song` | 0 to 127 |
| `"tune-request"`, `"timing-clock"`, `"start"`, `"continue"`, `"stop"`, `"active-sensing"`, `"reset"` | none | |
| `"sysex"` | `data: Uint8Array` | 7-bit bytes, without the `F0` and `F7` framing |

Channels are numbered from 0, so the value 0 is what a musician calls channel 1.

### `MIFXEncoder`

A stateless encoder.

| Member | Description |
| --- | --- |
| `static encode(message)` | Returns the wire bytes for a message. A channel message gives two or three bytes, and a `sysex` message gives `F0`, the data and `F7`. Throws `TypeError` for a value that is not a known message and `RangeError` for a field outside its range or a system exclusive byte above 127. |

### `MIFXParser`

A streaming parser that turns bytes from a device or file into events. It carries state between calls, so a message split across two reads still parses. It follows MIDI 1.0 rules: running status (a repeated channel status byte may be omitted), real-time bytes that may interrupt any message, and system exclusive messages that run until `F7`.

```text
new MIFXParser(options?: MIFXParserOptions)
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `push(bytes)` | `(bytes: Uint8Array) => readonly MIFXParserEvent[]` | Feeds bytes and returns the events they completed, in order. |
| `finish()` | `() => readonly MIFXParserEvent[]` | Signals the end of input. An incomplete message becomes a `"truncated-message"` error, and the parser resets. |
| `bufferedByteCount` | `number` | Data bytes held for an incomplete message. |

`MIFXParserOptions` has one field, `maxSysExBytes`, the largest complete system exclusive message accepted, counting `F0` and `F7`. It defaults to 65,536 and must be an integer of at least 2. A larger message produces a `"sysex-too-large"` error, and the parser discards the rest of it.

An event is either `{ kind: "message", offset, message }` or `{ kind: "error", error }`. The offset is the position of the message's first byte in the whole stream since the parser was created. A `MIFXParseError` has:

| Field | Description |
| --- | --- |
| `code` | `"unexpected-data"` (a data byte with no status to attach it to), `"invalid-status"` (a status byte MIDIFX does not accept), `"truncated-message"` (a new status arrived before a message finished, or input ended), `"unexpected-eox"` (an `F7` outside a system exclusive message), `"sysex-too-large"`. |
| `offset` | Where the problem was detected. |
| `messageStartOffset` | Where the affected message began, when there was one. |
| `recovery` | What the parser did: `"drop-byte"`, `"restart-at-status"`, `"discard-sysex"` or `"reset-at-end"`. |

The parser never throws for bad device data. It reports an error event and continues, so one glitch does not stop a session.

```ts
import { MIFXEncoder, MIFXParser } from "@syndromatic/syncloudos/fx/midi";

const bytes = MIFXEncoder.encode({ kind: "note-on", channel: 0, note: 60, velocity: 100 }); // 90 3C 64
const parser = new MIFXParser();

// A message split across two reads, then a second note that uses running status.
const events = [
  ...parser.push(bytes.slice(0, 2)),
  ...parser.push(new Uint8Array([bytes[2]!, 62, 100])),
  ...parser.finish(),
];

for (const event of events) {
  if (event.kind === "message") console.log(event.offset, event.message);
  else console.warn("MIDI parse problem", event.error.code, event.error.recovery);
}
```

## Universal MIDI Packets

### `MIFXUniversalPacket`

A UMP is one to four 32-bit words. The top nibble of the first word gives the message type, and the next nibble gives the group (0 to 15) that selects one of sixteen independent 16-channel streams. MIDIFX supports the utility, system, MIDI 1.0 channel voice and MIDI 2.0 channel voice types, following UMP 1.1.2 (`MIFX_UMP_PROTOCOL_VERSION`). Other types throw `TypeError`.

```text
new MIFXUniversalPacket(words: readonly number[] | Uint32Array)
```

The constructor checks that each word is an unsigned 32-bit integer and that the word count matches the message type: one word for utility, system and MIDI 1.0 packets and two for MIDI 2.0 channel voice. It throws `RangeError` for a wrong count.

| Member | Type or signature | Description |
| --- | --- | --- |
| `protocolVersion` | `"ump-1.1.2"` | The UMP revision the class implements. |
| `words` | `readonly number[]` | The words, frozen. |
| `messageType` | `number` | The message type nibble. |
| `group` | `number` | The group, 0 to 15. |
| `kind` | `MIFXUniversalPacketKind` | `"utility"`, `"system"`, `"midi1-channel-voice"` or `"midi2-channel-voice"`. |
| `toBytes()` | `Uint8Array` | The words as big-endian bytes. |
| `toMIDI1Message()` | `MIFXMessage` | Decodes a system or MIDI 1.0 channel voice packet. Throws `TypeError` for other kinds. |
| `midi2ChannelVoice()` | `MIFXMIDI2ChannelVoice` | Decodes a MIDI 2.0 channel voice packet. Throws `RangeError` when reserved bits are set. |
| static `fromBytes(bytes)` | `MIFXUniversalPacket` | Reads big-endian bytes. The length must be a multiple of four, at most 16. |
| static `fromMIDI1Message(group, message)` | `MIFXUniversalPacket` | Wraps a MIDI 1.0 message in a one-word packet. System exclusive messages are not supported and throw `TypeError`. |

`MIFXMIDI2ChannelVoice` is a union with the higher-resolution fields of MIDI 2.0:

| Kind | Fields |
| --- | --- |
| `"note-on"`, `"note-off"` | `channel`, `note`, `velocity` (16 bits), `attributeType`, `attributeData` |
| `"polyphonic-key-pressure"` | `channel`, `note`, `pressure` (32 bits) |
| `"control-change"` | `channel`, `controller`, `value` (32 bits) |
| `"channel-pressure"` | `channel`, `pressure` (32 bits) |
| `"pitch-bend"` | `channel`, `value` (32 bits) |

## Converting MIDI 2.0 to MIDI 1.0

### `MIFXProtocolConversion`

MIDI 2.0 values have more bits than MIDI 1.0 can hold: 16-bit velocity becomes 7 bits, 32-bit controllers become 7 bits and 32-bit pitch bend becomes 14 bits. A conversion is therefore lossy in general, and the framework does not choose silently. You pass a policy.

```text
MIFXProtocolConversion.toMIDI1(packet: MIFXUniversalPacket, options: MIFXProtocolConversionOptions): MIFXProtocolConversionResult
```

| Option | Values | Meaning |
| --- | --- | --- |
| `precisionLoss` | `"reject"` | Throw `MIFXProtocolLossError` when any precision would be lost. |
| | `"allow"` | Scale the value with rounding and report the losses in the result. |

A packet that is already MIDI 1.0 passes through with no losses. Utility packets have no conversion and throw `TypeError`. A missing policy throws `TypeError`.

`MIFXProtocolConversionResult` holds `message` (the `MIFXMessage`) and `losses` (a list of names such as `"velocity-16-to-7-bit"`, `"controller-32-to-7-bit"`, `"pressure-32-to-7-bit"`, `"pitch-bend-32-to-14-bit"` and `"note-attribute-unrepresentable"`). Values that scale exactly, such as full-range 65535 velocity to 127, report no loss.

`MIFXProtocolLossError` extends `RangeError`. Its `losses` array lists the same names, so a handler can decide what to do with a specific loss.

```ts
import {
  MIFXProtocolConversion,
  MIFXProtocolLossError,
  MIFXUniversalPacket,
} from "@syndromatic/syncloudos/fx/midi";

// MIDI 2.0 note-on, group 0, channel 0, note 60, 16-bit velocity 40000.
const packet = new MIFXUniversalPacket([0x4090_3c00, (40000 << 16) >>> 0]);

try {
  MIFXProtocolConversion.toMIDI1(packet, { precisionLoss: "reject" });
} catch (error) {
  if (error instanceof MIFXProtocolLossError) console.log("would lose", error.losses);
}

const { message, losses } = MIFXProtocolConversion.toMIDI1(packet, { precisionLoss: "allow" });
console.log(message, losses);
```

## Devices

### `MIFXClient` and `MIFXAccess`

`useSynWareMIDI()` returns an `MIFXAccess` for your component. Mounting it creates a passive owner and requests nothing from the browser. Only `requestAuthorization()` prompts the user. The underlying `MIFXClient` (`createAccess(signal?)`) belongs to the session.

| Method | Type or signature | Description |
| --- | --- | --- |
| `getCapabilities()` | `() => MIFXCapabilities` | The current environment. Available at any time. |
| `getEndpoints()` | `() => readonly MIFXEndpointSnapshot[]` | The known inputs and outputs. Empty until access is granted. |
| `requestAuthorization(request?)` | `(request?: MIFXAuthorizationRequest) => Promise<MIFXAuthorizationResult>` | Asks for access. Resolves with the outcome and never rejects for a refusal. |
| `subscribeEndpoints(listener)` | `(listener: MIFXEndpointListener) => MIFXSubscription` | Calls the listener with the endpoint list when devices connect, disconnect or change. |
| `subscribeInput(endpoint, listener)` | `(endpoint, listener: MIFXInputListener) => Promise<MIFXInputSubscription>` | Opens an input and delivers each received packet. |
| `acquireOutput(endpoint)` | `(endpoint) => Promise<MIFXOutputLease>` | Opens an output for sending. |
| `dispose()` | `() => void` | Releases every subscription and lease the access holds. |

Before the component mounts, the hook's `getCapabilities()` reports `apiAvailable: false` and `getEndpoints()` is empty. The methods that need a live access throw until mount.

**Capabilities.** `MIFXCapabilities`:

| Field | Description |
| --- | --- |
| `apiAvailable` | True when the browser offers Web MIDI. |
| `transportProtocol` | `"midi1"`. The browser transport carries MIDI 1.0 bytes. |
| `authorization` | `MIFXAuthorizationState` for normal access. |
| `sysexAuthorization` | The same for system exclusive access. |
| `connectedEndpointCount` | How many endpoints are connected. |

`MIFXAuthorizationState` is `"unknown"` (not asked yet), `"granted"`, `"denied"` (the user refused), `"policy-denied"` (the host's policy or the manifest does not allow it) or `"unavailable"` (the browser has no Web MIDI).

**Authorisation.** `MIFXAuthorizationRequest` has `sysex` (default false) and `signal`. `MIFXAuthorizationResult` has `state` (one of the states above except `"unknown"`) and `sysex`, the sysex access actually granted. A request needs `midi.access` in the manifest, and `sysex: true` needs `midi.sysex` as well. Without them the result is `"policy-denied"`. Browsers gate system exclusive access more strictly, so request it only when you send or receive sysex messages.

**Endpoints.** An `MIFXEndpointSnapshot` is a frozen description of one port at one moment:

| Field | Description |
| --- | --- |
| `id` | A stable identifier for the port. |
| `direction` | `"input"` or `"output"` (`MIFXEndpointDirection`). |
| `manufacturer`, `name`, `version` | Device strings, or `null` when the device gives none. |
| `state` | `"connected"` or `"disconnected"` (`MIFXEndpointState`). |
| `connection` | `"open"`, `"closed"` or `"pending"` (`MIFXEndpointConnection`). |
| `generation` | Increases when the port changes, so you can tell a snapshot has gone stale. |

**Input.** The listener receives an `MIFXInputPacket` with the `endpoint`, the raw `data` bytes and `receivedAtMilliseconds` (a host timestamp, or `null`). Feed `data` to an `MIFXParser` per input. The returned `MIFXInputSubscription` has the `endpoint` and `dispose()`.

**Output.** `MIFXOutputLease` has the `endpoint`, `send(data, timestampMilliseconds?)` and `dispose()`. `send` takes wire bytes, for example from `MIFXEncoder.encode`. A timestamp in the host's millisecond clock asks the device to play at that time, and omitting it sends now. Hold the lease while you need the port and dispose it afterwards.

`MIFXSubscription` (`dispose()`), `MIFXEndpointListener` and `MIFXInputListener` are the callback and handle types.

```tsx
import { useEffect, useState } from "react";
import { MIFXEncoder, MIFXParser, type MIFXEndpointSnapshot } from "@syndromatic/syncloudos/fx/midi";
import { useSynWareMIDI } from "@syndromatic/syncloudos/sdk";

export function Keyboard() {
  const midi = useSynWareMIDI();
  const [state, setState] = useState("Not authorised");
  const [endpoints, setEndpoints] = useState<readonly MIFXEndpointSnapshot[]>([]);
  const [lastNote, setLastNote] = useState<number | null>(null);

  async function connect() {
    const result = await midi.requestAuthorization({ sysex: false });
    setState(result.state);
    if (result.state === "granted") setEndpoints(midi.getEndpoints());
  }

  useEffect(() => {
    if (state !== "granted") return;
    const stopWatching = midi.subscribeEndpoints(setEndpoints);
    const parsers = new Map<string, MIFXParser>();
    const inputs: Array<Promise<{ dispose(): void }>> = [];
    for (const endpoint of midi.getEndpoints().filter((entry) => entry.direction === "input")) {
      inputs.push(midi.subscribeInput(endpoint, (packet) => {
        const parser = parsers.get(packet.endpoint.id) ?? new MIFXParser();
        parsers.set(packet.endpoint.id, parser);
        for (const event of parser.push(packet.data)) {
          if (event.kind === "message" && event.message.kind === "note-on" && event.message.velocity > 0) {
            setLastNote(event.message.note);
          }
        }
      }));
    }
    return () => {
      stopWatching.dispose();
      for (const input of inputs) void input.then((subscription) => subscription.dispose());
    };
  }, [midi, state]);

  async function playMiddleC() {
    const output = endpoints.find((entry) => entry.direction === "output");
    if (!output) return;
    const lease = await midi.acquireOutput(output);
    lease.send(MIFXEncoder.encode({ kind: "note-on", channel: 0, note: 60, velocity: 100 }));
    window.setTimeout(() => {
      lease.send(MIFXEncoder.encode({ kind: "note-off", channel: 0, note: 60, velocity: 0 }));
      lease.dispose();
    }, 500);
  }

  return (
    <div>
      <button onClick={() => void connect()}>Connect ({state})</button>
      <button onClick={() => void playMiddleC()}>Play middle C</button>
      <p>{lastNote === null ? "No note yet" : `Last note: ${lastNote}`}</p>
    </div>
  );
}
```

The manifest for this component declares the permission:

```ts
export default {
  schemaVersion: 1,
  id: "com.example.keys",
  version: "1.0.0",
  title: "Keys",
  routes: [{ path: "/keys", primary: true }],
  permissions: ["midi.access"],
} as const;
```

## Scheduling

### `MIFXScheduler`

Sends messages at a future time on a [MediaFX](media.md) clock. Web MIDI has no reliable timing of its own, and a JavaScript timer can be late when the page is busy. The scheduler keeps a queue ordered by target time, arms one host timer for the earliest event, and sends each event with a host timestamp so the device can smooth out timer jitter. Events that are due now are sent at once. Because the target is a `MEFXTime` on a clock you choose, MIDI can follow the same timebase as audio and video, and a seek or rate change on that timebase cancels queued events instead of sending stale ones.

```text
new MIFXScheduler(options: MIFXSchedulerOptions)
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `clock` | `MEFXClock` | required | The clock that target times refer to, usually a timebase from `useSynWareMedia().createTimebase()`. |
| `output` | `MIFXOutputLease` | required | Where events are sent. |
| `ownerSignal` | `AbortSignal` | none | When it aborts, queued events are cancelled and the scheduler is disposed. |
| `maximumQueuedEvents` | `number` | 256 | The most pending events, an integer from 1 to 65,536. |
| `hostNowMilliseconds` | `() => number` | `performance.now` | The host clock used for timestamps. |
| `scheduleHostCallback`, `cancelHostCallback` | functions | `setTimeout` and `clearTimeout` | The timer pair. Replace them in tests. |

| Member | Description |
| --- | --- |
| `schedule(data, target)` | Queues raw MIDI bytes to send when the clock reaches the target time. `data` is copied and cannot be empty. The target must be a finite `MEFXTime` in the clock's epoch. Returns an `MIFXScheduledSend`. Throws `QuotaExceededError` when the queue is full. |
| `queuedCount` | The number of events still waiting. |
| `dispose()` | Cancels every queued event and unsubscribes from the clock. |

`MIFXScheduledSend` reports `state` (`MIFXScheduledSendState`: `"queued"`, `"submitted"`, `"cancelled"` or `"failed"`), `error` (the failure, when `state` is `"failed"`) and `cancel()`, which returns true when it cancelled a still-queued event. Events with equal targets keep the order in which you scheduled them.

```tsx
import { useEffect } from "react";
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
import { MIFXEncoder, MIFXScheduler } from "@syndromatic/syncloudos/fx/midi";
import { useSynWareMedia, useSynWareMIDI } from "@syndromatic/syncloudos/sdk";

export function Arpeggio() {
  const midi = useSynWareMIDI();
  const media = useSynWareMedia();

  useEffect(() => {
    const controller = new AbortController();
    let scheduler: MIFXScheduler | undefined;

    void (async () => {
      const output = midi.getEndpoints().find((endpoint) => endpoint.direction === "output");
      if (!output) return;
      const lease = await midi.acquireOutput(output);
      if (controller.signal.aborted) return lease.dispose();

      const timebase = media.createTimebase({}, controller.signal);
      scheduler = new MIFXScheduler({ clock: timebase, output: lease, ownerSignal: controller.signal });

      const now = timebase.now().position;
      [60, 64, 67, 72].forEach((note, index) => {
        const start = now.addDuration(MEFXTime.finite(BigInt(index), 4)); // a quarter of a second apart
        const stop = start.addDuration(MEFXTime.finite(1n, 8));
        scheduler!.schedule(MIFXEncoder.encode({ kind: "note-on", channel: 0, note, velocity: 96 }), start);
        scheduler!.schedule(MIFXEncoder.encode({ kind: "note-off", channel: 0, note, velocity: 0 }), stop);
      });
    })();

    return () => {
      controller.abort();
      scheduler?.dispose();
    };
  }, [midi, media]);

  return null;
}
```

## Errors

| Situation | Error |
| --- | --- |
| A malformed message, packet or option | `TypeError` |
| A field outside its range, a UMP with the wrong word count | `RangeError` |
| A lossy conversion under the `"reject"` policy | `MIFXProtocolLossError` (a `RangeError`) |
| A device stream with corrupt bytes | Parser error events, never exceptions |
| Access refused by the user, the policy or the browser | A result with state `"denied"`, `"policy-denied"` or `"unavailable"` |
| A call on a device method after `dispose` | `DOMException` named `AbortError` |
| A permission missing on a subscribe or acquire call | `DOMException` named `SecurityError` |
| A full scheduler queue | `DOMException` named `QuotaExceededError` |

## Related

- [FX overview](README.md)
- [MediaFX](media.md), for the clocks and time values the scheduler uses
- [AudioFX](audio.md), for keeping MIDI aligned with audio
- [Manifest reference](../synware-manifest.md)
