# MotionFX

MotionFX (`MFX`) is the web-native analogue of Core Motion. It gives an application the orientation and movement of the device it runs on: an attitude (yaw, pitch and roll), rotation rate, gravity, user acceleration and raw accelerometer and gyroscope readings. An interface can use these values to respond when the user tilts or shakes a phone, or to shade a surface as the device turns.

The framework has two halves. The value types are a plain library: `MFXAttitude` is an immutable orientation with quaternion, rotation matrix and Euler-angle views, and the sample types describe what a sensor reported at one instant. The device access is a scoped client that only a mounted SynWare can reach. `useSynWareMotion()` returns a motion manager owned by the component, and `useSynWare().motion.createManager()` returns one you own directly. The host enforces the manifest permissions, shares one set of browser listeners between every session, pauses delivery when the page is hidden and releases everything when the application closes.

MotionFX solves the parts of sensor work that browsers leave to each application. It gives orientation a single right-handed convention with explicit units, keeps quaternion signs continuous so attitudes do not flip, throttles delivery to a cadence you choose, keeps bounded history for gesture detection, and reports availability as data. A desktop without sensors, a hidden tab, a device that needs a permission gesture and a user who declined all produce a capability record rather than a silent failure.

## At a glance

| | |
| --- | --- |
| Prefix | `MFX` |
| Entry | `@syndromatic/syncloudos/fx/motion` |
| Hook | `useSynWareMotion()` from `@syndromatic/syncloudos/sdk` |
| Client | `useSynWare().motion` (`MFXMotionClient`) |
| Permissions | `motion.read` to create a manager and receive samples. `motion.requestAuthorization` in addition to call `requestAuthorization()`. |
| Analogue | Core Motion (`CMMotionManager`, `CMDeviceMotion`, `CMAttitude`) |

The entry exports one class, `MFXAttitude`, and eighteen types. Everything else in the framework is reached through the manager the session hands you.

## Concepts

| Type | Role |
| --- | --- |
| `MFXAttitude` | Immutable orientation. Built from a quaternion, Euler angles or a rotation matrix. |
| `MFXVector3`, `MFXQuaternion`, `MFXRotationMatrix` | Plain value shapes for vectors, quaternions and 3 by 3 matrices. |
| `MFXAttitudeReferenceFrame` | The frame an attitude is measured against. |
| `MFXLogItem`, `MFXDeviceMotion`, `MFXAccelerometerData`, `MFXGyroData` | Timestamped sensor samples. |
| `MFXMotionClient` | Creates managers for one mounted session. |
| `MFXMotionManager` | Owns subscriptions, cadence, the latest samples and recorders. |
| `MFXMotionSubscription`, `MFXMotionRecorder` | A running subscription, and bounded history of device-motion samples. |
| `MFXMotionAuthorization` | The explicit permission request that `MFXMotionManager` extends. |
| `MFXAvailability`, `MFXSampleState`, `MFXSensor`, `MFXCapability`, `MFXMotionCapabilities` | What the host can currently deliver. |

Data flows in one direction. The host listens to the browser's orientation and motion events, converts them to SI units and monotonic seconds, and hands each raw sample to every manager that has a subscription. A manager applies its reference frame and cadence, freezes the sample and calls your handler synchronously. Handlers run in the order the subscriptions were created.

Units are the same everywhere. Angles are radians. Rotation rates are radians per second. Accelerations and gravity are metres per second squared, so gravity at rest has a magnitude near 9.81 (Core Motion reports it in units of g). Timestamps and intervals are seconds. Timestamps come from the browser's monotonic event clock, so they are useful for differences and never as calendar times.

## Attitude

### `MFXVector3`, `MFXQuaternion`, `MFXRotationMatrix` and `MFXAttitudeReferenceFrame`

These are the value shapes the rest of the framework uses.

| Type | Definition | Meaning |
| --- | --- | --- |
| `MFXVector3` | `{ readonly x: number; readonly y: number; readonly z: number }` | A three-component vector. Units depend on the property that carries it. |
| `MFXQuaternion` | `MFXVector3` plus `readonly w: number` | A quaternion with the scalar part in `w`. |
| `MFXRotationMatrix` | Readonly tuple of nine numbers | A 3 by 3 rotation matrix in row-major order: `[m00, m01, m02, m10, m11, m12, m20, m21, m22]`. |
| `MFXAttitudeReferenceFrame` | `"relative"`, `"gravity-aligned"`, `"magnetic-north"` or `"true-north"` | The frame an attitude is measured against. |

`startDeviceMotionUpdates` accepts only `"relative"` at present. It throws for the other three values, which the type keeps so that later hosts can offer them without an API change. In the `"relative"` frame the attitude is measured from the orientation the device reported when the reference was set (see `resetReferenceFrame()`), or from the host's own orientation frame when no reference has been set.

### `MFXAttitude`

An immutable right-handed orientation. An attitude is created once and never changes; `multiply`, `inverse`, `multiplyByInverseOf` and `continuousWith` return new attitudes. The instance and its `quaternion` and `rotationMatrix` are frozen. Euler angles use the intrinsic Z-Y-X convention: yaw about z, then pitch about the rotated y, then roll about the rotated x.

```text
new MFXAttitude(quaternion: MFXQuaternion)
static MFXAttitude.fromEuler(roll: number, pitch: number, yaw: number): MFXAttitude
static MFXAttitude.fromRotationMatrix(matrix: MFXRotationMatrix): MFXAttitude
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `constructor` | `(quaternion: MFXQuaternion)` | Normalises the quaternion to unit length. Throws `RangeError` when any component is not finite or the length is zero. The input object is not retained. |
| `quaternion` | `readonly MFXQuaternion` | The normalised unit quaternion, frozen. |
| `rotationMatrix` | `readonly MFXRotationMatrix` | The equivalent rotation matrix, row-major and frozen. |
| `roll` | `readonly number` | Rotation about x in radians, in the range -π to π. |
| `pitch` | `readonly number` | Rotation about y in radians, in the range -π/2 to π/2. |
| `yaw` | `readonly number` | Rotation about z in radians, in the range -π to π. |
| `multiply(other)` | `(other: MFXAttitude) => MFXAttitude` | The Hamilton product `this × other`, normalised. Composition is not commutative. |
| `inverse()` | `() => MFXAttitude` | The conjugate, which is the inverse for a unit quaternion. |
| `multiplyByInverseOf(other)` | `(other: MFXAttitude) => MFXAttitude` | `this × other⁻¹`. Applying the result after `other` gives back `this`. Use it to compute the change between two attitudes. |
| `continuousWith(previous)` | `(previous: MFXAttitude \| null) => MFXAttitude` | Returns this attitude, or its negated quaternion when the dot product with `previous` is negative. The rotation is identical either way. Pass the previous result of this call, so a series of attitudes never jumps between the two equivalent signs. A `null` argument returns the attitude unchanged. |
| `fromEuler(roll, pitch, yaw)` (static) | `(number, number, number) => MFXAttitude` | Builds an attitude from angles in radians. Note the argument order: roll, pitch, yaw. |
| `fromRotationMatrix(matrix)` (static) | `(matrix: MFXRotationMatrix) => MFXAttitude` | Builds an attitude from a row-major matrix. Throws `RangeError` when the matrix does not hold nine finite numbers, when its rows are not orthonormal (tolerance 1e-6), or when its determinant is not 1 (a reflection). |

Pitch reaches its limits at plus and minus a quarter turn, where roll and yaw describe the same rotation. Read the quaternion or the matrix when you need a stable result near those poles.

```ts
import { MFXAttitude } from "@syndromatic/syncloudos/fx/motion";

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export function describeTilt(rollRadians: number, pitchRadians: number): string {
  const tilted = MFXAttitude.fromEuler(rollRadians, pitchRadians, 0);
  return `roll ${toDegrees(tilted.roll).toFixed(1)}, pitch ${toDegrees(tilted.pitch).toFixed(1)}, yaw ${toDegrees(tilted.yaw).toFixed(1)}`;
}

export function changeBetween(from: MFXAttitude, to: MFXAttitude): MFXAttitude {
  return to.multiplyByInverseOf(from);
}
```

Matrices and series of attitudes need more care. `fromRotationMatrix` validates its input, and `continuousWith` keeps a sequence free of sign flips, which matters when you interpolate or filter quaternions component by component.

```ts
import { MFXAttitude, type MFXRotationMatrix } from "@syndromatic/syncloudos/fx/motion";

const quarterTurnAboutZ: MFXRotationMatrix = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const stretch: MFXRotationMatrix = [2, 0, 0, 0, 1, 0, 0, 0, 1];

export function safeAttitude(matrix: MFXRotationMatrix): MFXAttitude | null {
  try {
    return MFXAttitude.fromRotationMatrix(matrix);
  } catch (error) {
    if (error instanceof RangeError) return null; // not a proper rotation
    throw error;
  }
}

export function unwrapSeries(attitudes: readonly MFXAttitude[]): MFXAttitude[] {
  const result: MFXAttitude[] = [];
  let previous: MFXAttitude | null = null;
  for (const attitude of attitudes) {
    const continuous = attitude.continuousWith(previous);
    result.push(continuous);
    previous = continuous;
  }
  return result;
}

export function demonstrate(): { yaw: number; rejected: boolean } {
  const turned = safeAttitude(quarterTurnAboutZ);
  return { yaw: turned?.yaw ?? 0, rejected: safeAttitude(stretch) === null };
}
```

## Samples

Every sample is frozen and carries a `timestamp` in seconds. A handler receives the same object that later appears as the manager's latest-sample property, so you can keep it without copying.

### `MFXLogItem`

The base of every sample.

| Field | Type | Meaning |
| --- | --- | --- |
| `timestamp` | `number` | Seconds on the browser's monotonic event clock. The manager drops samples whose timestamp is negative, not finite or earlier than one it has already delivered. |

### `MFXDeviceMotion`

A fused device-motion sample. It extends `MFXLogItem`.

| Field | Type | Meaning |
| --- | --- | --- |
| `attitude` | `MFXAttitude \| null` | Orientation in `referenceFrame`, adjusted for the current screen orientation. `null` when this sample carries no orientation. |
| `rotationRate` | `MFXVector3 \| null` | Angular velocity in radians per second. `null` when unavailable. |
| `gravity` | `MFXVector3 \| null` | Gravity in metres per second squared. The host derives it only when the acceleration with and without gravity arrive together, so it is often `null`. |
| `userAcceleration` | `MFXVector3 \| null` | Acceleration from the user's movement, with gravity removed, in metres per second squared. `null` when unavailable. |
| `referenceFrame` | `MFXAttitudeReferenceFrame` | The frame you requested. Currently always `"relative"`. |
| `timestamp` | `number` | Inherited. Seconds. |

Browsers deliver orientation and motion as two independent event streams, so one device-motion sample usually carries the attitude or the rate and acceleration channels, and each missing channel is `null`. Check each channel you use. The update interval applies to the two streams independently, so an orientation event never uses up the slot of a motion event.

### `MFXAccelerometerData`

| Field | Type | Meaning |
| --- | --- | --- |
| `acceleration` | `MFXVector3` | Acceleration in metres per second squared. |
| `includesGravity` | `boolean` | `true` when the value includes gravity. The manager prefers the reading that includes gravity and falls back to user acceleration. |
| `timestamp` | `number` | Inherited from `MFXLogItem`. |

### `MFXGyroData`

| Field | Type | Meaning |
| --- | --- | --- |
| `rotationRate` | `MFXVector3` | Angular velocity in radians per second. |
| `timestamp` | `number` | Inherited from `MFXLogItem`. |

Each stream delivers a sample only when the source has the channel it needs. A host that reports no acceleration produces no accelerometer samples, and one that reports no rotation rate produces no gyro samples.

## The client and the manager

### `MFXMotionClient`

The factory a mounted session exposes as `useSynWare().motion`. It creates managers that belong to that session.

| Member | Type or signature | Description |
| --- | --- | --- |
| `createManager(signal?)` | `(signal?: AbortSignal) => MFXMotionManager` | Creates a manager. Aborting `signal` disposes it. Throws a `SecurityError` `DOMException` when the manifest does not declare `motion.read`, throws the abort reason when the session is closing or `signal` has already aborted, and throws a `QuotaExceededError` `DOMException` when the session already holds eight live managers. |

Creating a manager is passive. It starts no sensor and shows no prompt.

### `MFXMotionManager`

The object you work with. It extends `MFXMotionAuthorization`. One manager belongs to one session (or one component, when it comes from the hook) and its lifetime ends when you call `dispose()`, when the signal you passed to `createManager` aborts, or when the session closes. After that, every member that starts or configures something throws, `capabilities` reports `"disposed"` and the latest-sample properties are `null`.

Subscriptions are passive. Starting one never triggers a permission prompt. If the device needs explicit authorisation, or the page is hidden, the subscription stays alive and simply receives no samples until the situation changes.

| Member | Type or signature | Description |
| --- | --- | --- |
| `capabilities` | `readonly MFXMotionCapabilities` | A new frozen snapshot of what the host can deliver for each sensor on every read. It does not notify you of changes, so read it again when you need it. See [Capabilities and permissions](#capabilities-and-permissions). |
| `deviceMotion` | `readonly MFXDeviceMotion \| null` | The latest sample delivered to a device-motion subscriber. `null` while no device-motion subscription is active, after `stopDeviceMotionUpdates()`, and after `resetReferenceFrame()` until the next sample. |
| `accelerometerData` | `readonly MFXAccelerometerData \| null` | The latest accelerometer sample. `null` while no accelerometer subscription is active. |
| `gyroData` | `readonly MFXGyroData \| null` | The latest gyro sample. `null` while no gyro subscription is active. |
| `deviceMotionUpdateInterval` | `readonly number` | Minimum seconds between device-motion samples. Defaults to 1/60. |
| `accelerometerUpdateInterval` | `readonly number` | Minimum seconds between accelerometer samples. Defaults to 1/60. |
| `gyroUpdateInterval` | `readonly number` | Minimum seconds between gyro samples. Defaults to 1/60. |
| `observedUpdateInterval` | `readonly number \| null` | Seconds between the last two delivered device-motion samples. `null` until two samples have arrived and after the last device-motion subscription ends. It reports what the host actually delivers, which can be slower than the interval you asked for. |
| `setDeviceMotionUpdateInterval(seconds)` | `(seconds: number) => void` | Sets the minimum spacing. Throws `RangeError` unless `seconds` is finite, greater than 0 and at most 3600. Throws `SynCloudOSLifecycleError` with code `MFX_MOTION_MANAGER_DISPOSED` when the manager is disposed. Takes effect on the next sample. |
| `setAccelerometerUpdateInterval(seconds)` | `(seconds: number) => void` | As above, for the accelerometer. |
| `setGyroUpdateInterval(seconds)` | `(seconds: number) => void` | As above, for the gyroscope. |
| `startDeviceMotionUpdates(options, handler)` | `(options: Readonly<{ referenceFrame: MFXAttitudeReferenceFrame; signal?: AbortSignal }>, handler: (sample: MFXDeviceMotion) => void) => MFXMotionSubscription` | Subscribes to device motion. Throws `Error` for any `referenceFrame` other than `"relative"`, and `SynCloudOSLifecycleError` with code `MFX_MOTION_MANAGER_DISPOSED` when the manager is disposed. |
| `startAccelerometerUpdates(handler, signal?)` | `(handler: (sample: MFXAccelerometerData) => void, signal?: AbortSignal) => MFXMotionSubscription` | Subscribes to accelerometer readings. |
| `startGyroUpdates(handler, signal?)` | `(handler: (sample: MFXGyroData) => void, signal?: AbortSignal) => MFXMotionSubscription` | Subscribes to gyroscope readings. |
| `stopDeviceMotionUpdates()` | `() => void` | Disposes every device-motion subscription and every recorder on this manager, and clears `deviceMotion`. |
| `stopAccelerometerUpdates()` | `() => void` | Disposes every accelerometer subscription and clears `accelerometerData`. |
| `stopGyroUpdates()` | `() => void` | Disposes every gyroscope subscription and clears `gyroData`. |
| `resetReferenceFrame()` | `() => void` | Makes the current orientation the zero for later `"relative"` attitudes, and clears `deviceMotion` until the next sample. Throws when the manager is disposed. |
| `createRecorder(options?)` | `(options?: Readonly<{ maximumSamples?: number; maximumAge?: number; signal?: AbortSignal }>) => MFXMotionRecorder` | Starts device-motion updates in the `"relative"` frame into a bounded history. See [`MFXMotionRecorder`](#mfxmotionrecorder). |
| `requestAuthorization()` | `() => Promise<MFXAvailability>` | Asks the user for sensor access. See [Authorisation](#authorisation). |
| `dispose()` | `() => void` | Ends the manager and everything it owns. Safe to call more than once. |

The three `stop` methods act only on this manager's subscriptions. Another component's manager keeps receiving samples.

The `start` methods share these rules:

- The handler runs synchronously when a sample is delivered. If it throws, the manager swallows the error so that other subscribers still receive the sample. Catch and report errors in your own handler.
- A signal that has already aborted returns an inert subscription and never calls the handler. A signal that aborts later disposes the subscription.
- One manager holds at most 128 live subscriptions, recorders included. The next `start` call throws `RangeError`.
- Each subscription applies the manager's interval to its own delivery, so two subscriptions to the same stream keep independent timing.
- Changing an interval changes the spacing for the subscriptions already running.

#### Device-motion options

The options argument of `startDeviceMotionUpdates` is an inline object type with these fields.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `referenceFrame` | `MFXAttitudeReferenceFrame` | Required | The frame to measure attitude in. Only `"relative"` is supported. |
| `signal` | `AbortSignal` | None | Disposes the subscription when it aborts. |

#### Recorder options

The options argument of `createRecorder` is an inline object type. Every field is optional.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `maximumSamples` | `number` | 120 | The most samples the history keeps. An integer from 1 to 10000. |
| `maximumAge` | `number` | 10 | The oldest a kept sample may be, in seconds, measured against the newest sample's timestamp. Greater than 0 and at most 3600. |
| `signal` | `AbortSignal` | None | Disposes the recorder when it aborts. |

### `MFXMotionSubscription`

A running subscription.

| Member | Type or signature | Description |
| --- | --- | --- |
| `dispose()` | `() => void` | Stops delivery to this handler. Safe to call more than once. When the last subscription on the manager ends, the manager releases the host's listeners and clears the matching latest-sample properties. |

### `MFXMotionRecorder`

A bounded history of device-motion samples. It extends `MFXMotionSubscription`, so `dispose()` is the way to stop it. A recorder covers the active session only: it has no samples from before it was created and none from a time when the page was hidden. `createRecorder` returns a frozen object, and reading its properties always reflects the current state.

| Member | Type or signature | Description |
| --- | --- | --- |
| `maximumSamples` | `readonly number` | The sample cap in force (default 120). |
| `maximumAge` | `readonly number` | The age cap in seconds in force (default 10). |
| `samples` | `readonly MFXDeviceMotion[]` | A new frozen array of the kept samples, oldest first, on every read. Read it once per use. |
| `clear()` | `() => void` | Empties the history and keeps recording. |
| `dispose()` | `() => void` | Stops recording, releases the underlying subscription and empties the history. Safe to call more than once. After disposal `samples` stays empty. |

The recorder applies the manager's device-motion interval and reference frame. It prunes when a sample arrives: it drops samples older than `maximumAge` relative to the new sample, then keeps the newest `maximumSamples`. `createRecorder` throws `RangeError` for out-of-range options before it subscribes to anything. Because a recorder is a device-motion subscription, it counts towards the manager's limit of 128, and `stopDeviceMotionUpdates()` disposes it.

```ts
import type { MFXDeviceMotion, MFXMotionManager } from "@syndromatic/syncloudos/fx/motion";

export interface ShakeRecording {
  readonly peakRotation: () => number | null;
  readonly stop: () => void;
}

function peakRotation(samples: readonly MFXDeviceMotion[]): number | null {
  let peak: number | null = null;
  for (const sample of samples) {
    if (!sample.rotationRate) continue;
    const { x, y, z } = sample.rotationRate;
    const magnitude = Math.hypot(x, y, z);
    if (peak === null || magnitude > peak) peak = magnitude;
  }
  return peak;
}

export function recordShake(manager: MFXMotionManager, signal: AbortSignal): ShakeRecording {
  manager.setDeviceMotionUpdateInterval(1 / 30);
  const recorder = manager.createRecorder({ maximumSamples: 300, maximumAge: 5, signal });
  return {
    peakRotation: () => peakRotation(recorder.samples),
    stop: () => recorder.dispose(),
  };
}
```

## Reading motion

### In a component

`useSynWareMotion()` is the usual entry. It returns a stable `MFXMotionManager` whose lifetime follows the component. The host manager is acquired after React commits and disposed when the component unmounts.

```tsx
import { useEffect, useState } from "react";
import { useSynWareMotion } from "@syndromatic/syncloudos/sdk";

interface Tilt {
  readonly roll: number;
  readonly pitch: number;
}

export function TiltReadout() {
  const motion = useSynWareMotion();
  const [tilt, setTilt] = useState<Tilt | null>(null);

  useEffect(() => {
    motion.setDeviceMotionUpdateInterval(1 / 30);
    const subscription = motion.startDeviceMotionUpdates(
      { referenceFrame: "relative" },
      (sample) => {
        if (sample.attitude) {
          setTilt({ roll: sample.attitude.roll, pitch: sample.attitude.pitch });
        }
      },
    );
    return () => subscription.dispose();
  }, [motion]);

  if (!tilt) return <p>Waiting for motion data.</p>;
  return (
    <p>
      Roll {((tilt.roll * 180) / Math.PI).toFixed(0)} degrees, pitch{" "}
      {((tilt.pitch * 180) / Math.PI).toFixed(0)} degrees.
    </p>
  );
}
```

Start subscriptions in `useEffect`. The hook acquires the host manager in a layout effect, and a child's layout effects run before its parent's. Passive effects run after every layout effect in the tree, so the manager exists by then. Calling `start`, `set...Interval`, `resetReferenceFrame`, `createRecorder` or `requestAuthorization` before the manager is acquired throws `Error("The component motion owner is not mounted.")`. Before that point the facade reports every sensor as unavailable, every latest-sample property as `null` and every interval as 1/60. The `stop` methods and `dispose()` do nothing.

If the manifest does not declare `motion.read`, acquisition throws a `SecurityError` while React commits the component, and your error boundary receives it. Declare the permission before you use the hook.

In React strict mode the component mounts, unmounts and mounts again. The hook acquires a new manager on each mount, and your effect runs again against it, so an effect that subscribes and disposes in its cleanup is correct without further work.

### Outside React

`useSynWare().motion.createManager()` creates a manager you own. Pass an `AbortSignal` to tie its life to your own cancellation. The session disposes any manager still alive when the application closes.

```ts
import type { MFXMotionClient } from "@syndromatic/syncloudos/fx/motion";

export function peakRotationRate(
  client: MFXMotionClient,
  durationSeconds: number,
  signal?: AbortSignal,
): Promise<number | null> {
  return new Promise((resolve) => {
    const manager = client.createManager(signal);
    manager.setGyroUpdateInterval(1 / 50);
    let peak = 0;
    let seen = false;
    let startedAt: number | null = null;

    const finish = (): void => {
      manager.dispose();
      resolve(seen ? peak : null);
    };

    manager.startGyroUpdates((sample) => {
      startedAt ??= sample.timestamp;
      const { x, y, z } = sample.rotationRate;
      peak = Math.max(peak, Math.hypot(x, y, z));
      seen = true;
      if (sample.timestamp - startedAt >= durationSeconds) finish();
    }, signal);

    signal?.addEventListener("abort", finish, { once: true });
  });
}
```

The promise rejects when `createManager` throws, for example with a `SecurityError` when `motion.read` is missing. It resolves `null` when the signal aborts before any gyro sample arrives. Disposing the manager from inside a handler is safe: the manager finishes the current delivery round and skips subscriptions that have ended.

### Reference frames and resetting

Attitudes arrive in the `"relative"` frame. Call `resetReferenceFrame()` to make the device's current orientation the zero point, for example when a game starts or the user taps "centre". The reset uses the latest orientation the manager has seen, so it has an effect only while at least one device-motion subscription (or recorder) is running. The reference ends when the last device-motion subscription ends. After a reset, `deviceMotion` is `null` until the next sample arrives.

Attitudes a manager delivers keep quaternion signs continuous within each subscription, so component-wise filtering and interpolation do not jump.

## Capabilities and permissions

### Types

| Type | Values | Meaning |
| --- | --- | --- |
| `MFXAvailability` | `"available"`, `"permission-required"`, `"denied"`, `"unavailable"`, `"suspended"`, `"disposed"` | `available`: the host can deliver samples. `permission-required`: the device needs an explicit authorisation request. `denied`: the user or host refused. `unavailable`: the host has no support for the sensor. `suspended`: delivery is paused, for example while the page is hidden. `disposed`: the manager has ended. |
| `MFXSampleState` | `"no-samples"`, `"active"`, `"stale"` | Whether samples have arrived: none yet, one within the last second, or the newest more than a second old. |
| `MFXSensor` | `"deviceMotion"`, `"accelerometer"`, `"gyroscope"`, `"magnetometer"`, `"headphone"`, `"altimeter"`, `"pressure"`, `"submersion"`, `"pedometer"`, `"activity"`, `"fall"`, `"clinical"`, `"historical"` | The sensors and services the capability record covers. |
| `MFXMotionCapabilities` | `Readonly<Record<MFXSensor, MFXCapability>>` | One `MFXCapability` for every sensor. |

### `MFXCapability`

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `MFXAvailability` | The availability of the sensor now. |
| `reason` | `string \| null` | A short explanation for display or diagnostics, or `null` when there is nothing to add. The wording can change, so do not match on it. |
| `apiPresent` | `boolean` | Whether the browser exposes the API that backs the sensor. |
| `samples` | `MFXSampleState` | Whether samples have arrived recently. |

A present API says nothing about whether a sensor exists. A desktop browser exposes the device-motion API and delivers nothing, so the record reads `state: "available"`, `apiPresent: true` and `samples: "no-samples"`. Treat `samples` as the evidence that data is flowing.

### What the browser host reports

| Sensor | Reported by the browser host |
| --- | --- |
| `deviceMotion` | Available when either the browser's device-motion or device-orientation permission allows it. `permission-required` when the browser needs a user gesture to grant access. |
| `accelerometer`, `gyroscope` | Follow the device-motion permission. |
| `magnetometer`, `headphone`, `altimeter`, `pressure`, `submersion`, `pedometer`, `activity`, `fall`, `clinical`, `historical` | Always `unavailable` with `apiPresent: false`. |

While a manager has a subscription and the page is hidden, an otherwise available sensor reports `suspended`. The host detaches its browser listeners for the duration, and delivery resumes when the page is visible again. A host that has no motion support at all reports every sensor `unavailable`.

Design for empty data in every case. A desktop, a hidden tab, a device waiting for a permission gesture and a user who declined all produce no samples, and the interface should hold a sensible static state.

```tsx
import { useEffect, useState } from "react";
import { useSynWareMotion } from "@syndromatic/syncloudos/sdk";
import type { MFXCapability } from "@syndromatic/syncloudos/fx/motion";

function describe(capability: MFXCapability): string {
  switch (capability.state) {
    case "available":
      return capability.samples === "active"
        ? "Motion is flowing."
        : "Motion is allowed but no readings have arrived yet.";
    case "permission-required":
      return "Tap Enable Motion to allow access.";
    case "denied":
      return "Motion access was declined.";
    case "suspended":
      return "Motion is paused while this page is hidden.";
    case "disposed":
      return "Motion has stopped.";
    default:
      return "This device does not report motion.";
  }
}

export function MotionStatus() {
  const motion = useSynWareMotion();
  const [message, setMessage] = useState("Checking motion support.");

  useEffect(() => {
    const refresh = (): void => setMessage(describe(motion.capabilities.deviceMotion));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [motion]);

  return <p role="status">{message}</p>;
}
```

### Manifest permissions

| Permission | Grants |
| --- | --- |
| `motion.read` | Creating a manager, and with it every subscription, recorder and capability query. |
| `motion.requestAuthorization` | Calling `requestAuthorization()`. Requires `motion.read` as well. |

Manager creation checks `motion.read` at the moment you call `createManager`, and throws a `SecurityError` `DOMException` when the application has not declared it. An application that declares only `motion.read` can read samples but `requestAuthorization()` rejects with an `Error`.

## Authorisation

Some browsers, such as Safari on iOS, ask the user for motion access through an explicit prompt that only appears in response to a gesture. Subscriptions never trigger it. When `capabilities.deviceMotion.state` is `"permission-required"`, offer a control and call `requestAuthorization()` from its click handler.

### `MFXMotionAuthorization`

| Member | Type or signature | Description |
| --- | --- | --- |
| `requestAuthorization()` | `() => Promise<MFXAvailability>` | Asks the host to request sensor access and resolves with the resulting `deviceMotion` availability. |

Behaviour of the returned promise:

- It rejects with `Error` when the manifest lacks `motion.requestAuthorization`, and with `SynCloudOSLifecycleError` (`MFX_MOTION_MANAGER_DISPOSED`) when the manager is disposed. See [Errors and outcomes](../errors.md).
- It rejects with `Error` when the browser reports no active user gesture. Call it synchronously from a click, tap or key handler.
- It resolves with the availability after the browser's prompt: `"available"` when the user allows access, `"denied"` when they decline. On a browser that has no prompt it resolves with the current state.
- Calls made while a request is pending share the same request.
- It resolves `"disposed"` when the manager ends while the prompt is open.
- Called from a component before the hook's manager is acquired, it throws synchronously (the hook facade cannot defer it).

```tsx
import { useEffect, useState } from "react";
import { useSynWareMotion } from "@syndromatic/syncloudos/sdk";
import type { MFXAvailability } from "@syndromatic/syncloudos/fx/motion";

export function EnableMotionButton() {
  const motion = useSynWareMotion();
  const [state, setState] = useState<MFXAvailability | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setState(motion.capabilities.deviceMotion.state);
  }, [motion]);

  if (state !== "permission-required") return null;

  const request = async (): Promise<void> => {
    setProblem(null);
    try {
      setState(await motion.requestAuthorization());
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Motion access could not be requested.");
    }
  };

  return (
    <div>
      <button type="button" onClick={() => void request()}>
        Enable Motion
      </button>
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}
```

The click handler calls `requestAuthorization()` before it awaits anything, so the browser still sees the gesture. When the result is `"denied"`, keep the static presentation and say so.

## Errors and edge cases

| Situation | Result |
| --- | --- |
| `new MFXAttitude` with a non-finite or zero quaternion | `RangeError` |
| `MFXAttitude.fromRotationMatrix` with a wrong length, a non-finite entry, a non-orthonormal matrix or a reflection | `RangeError` |
| `createManager` without `motion.read` | `SecurityError` `DOMException` |
| `createManager` with an aborted signal or a closing session | The abort reason is thrown |
| `createManager` with eight live managers in the session | `QuotaExceededError` `DOMException` |
| Interval outside (0, 3600] or not finite | `RangeError` |
| `startDeviceMotionUpdates` with a frame other than `"relative"` | `Error` |
| More than 128 live subscriptions on one manager | `RangeError` |
| `createRecorder` with `maximumSamples` outside 1 to 10000 or not an integer, or `maximumAge` outside (0, 3600] | `RangeError` |
| Any `start`, `set...Interval`, `resetReferenceFrame` or `createRecorder` call after `dispose()` | `Error` |
| `requestAuthorization()` without `motion.requestAuthorization`, without a user gesture, or after disposal | Rejected promise with `Error` |
| A handler that throws | The error is swallowed and other subscribers still receive the sample |
| A subscription with an already aborted signal | An inert subscription, and the handler is never called |
| Timestamps that are negative, not finite or older than one already delivered | The sample is dropped |

Other points to design for:

- **Missing channels.** In `MFXDeviceMotion` every channel is nullable. A browser sample commonly has the attitude or the motion channels, and never both.
- **Cadence.** The interval is a minimum spacing applied at delivery. It cannot make a host sample faster than its own rate. Compare `observedUpdateInterval` with the interval you requested to see what you are getting.
- **Stale readings.** When a page is hidden and shown again, the host restarts its listeners and the capability reports `no-samples` until a new reading arrives.
- **Handler failures.** Because the manager hides handler errors, wrap the handler body in your own `try` and `catch` when a failure matters.

```ts
import type { MFXDeviceMotion, MFXMotionManager, MFXMotionSubscription } from "@syndromatic/syncloudos/fx/motion";

export function startSafely(
  manager: MFXMotionManager,
  handler: (sample: MFXDeviceMotion) => void,
  report: (message: string) => void,
): MFXMotionSubscription | null {
  try {
    return manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, (sample) => {
      try {
        handler(sample);
      } catch (error) {
        report(error instanceof Error ? error.message : "Motion handler failed.");
      }
    });
  } catch (error) {
    if (error instanceof RangeError) {
      report("This manager has too many active motion subscriptions.");
      return null;
    }
    report(error instanceof Error ? error.message : "Motion could not start.");
    return null;
  }
}
```

## Lifetimes and disposal

| Object | Ends when |
| --- | --- |
| Manager from `useSynWareMotion()` | The component unmounts, or the session closes. Its `dispose()` also ends it. |
| Manager from `createManager(signal)` | You call `dispose()`, `signal` aborts or the session closes. |
| Subscription | You call `dispose()`, its own `signal` aborts, the matching `stop...Updates()` runs, or the manager ends. |
| Recorder | You call `dispose()`, its `signal` aborts, `stopDeviceMotionUpdates()` runs, or the manager ends. |
| Host listeners | The last subscription across every session ends. One shared set of browser listeners serves every manager. |

Disposal is idempotent throughout. Ending a manager disposes its recorders and subscriptions, empties the latest-sample properties and makes `capabilities` report `disposed`. The latest-sample properties of a subscription stream are cleared as soon as its last subscriber ends, so a stale value cannot outlive the stream.

Ordering guarantees:

- Handlers for one sample run synchronously and in subscription order.
- Attitudes within one subscription are sign-continuous.
- A subscription is never called after `dispose()` returns.

## Material lighting

NSE uses MotionFX for the light direction on metallic materials. Sliders and toggles accept `thumbMaterial="metal"`, and `NSEMaterialLightingProvider` from `@syndromatic/syncloudos/nse/appearance` binds one shared, passive lighting controller. The controller requests device motion at 30 samples per second in the `"relative"` frame and maps pitch and roll to a light offset with a short smoothing time. It never calls `requestAuthorization()`. Reduced motion, hidden pages, disabled controls and missing or stale samples all give a static light. See [Appearance](../appearance.md).

## Related

- [FX frameworks](README.md), the overview of the twelve frameworks and the session model.
- [HapticsFX](haptics.md), for touch feedback that pairs well with motion gestures.
- [LocationFX](location.md), which follows the same capability and authorisation conventions.
- [AnimationFX](animation.md), for animating an interface from the values MotionFX reports.
- [Appearance](../appearance.md), for materials and lighting.
- [SynWare SDK](../synware-sdk.md), for the hooks and the session client.
- [SynWare manifest](../synware-manifest.md), for declaring permissions.
- [Testing SynWare](../testing-synware.md), for deterministic hosts and fakes.
