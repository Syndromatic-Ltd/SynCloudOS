# LocationFX

LocationFX (`LFX`) is the web-native analogue of Core Location. It answers where the device is, how sure the host is about that answer, and whether the user has allowed the question to be asked. Positions are immutable values, requests take an `AbortSignal`, and every source of updates has an explicit owner that you dispose.

The framework has two halves. The value types (`LFXCoordinate`, `LFXLocation`) are plain library code that you can construct, compare and test anywhere, including in a unit test with no browser. The manager types (`LFXLocationManager`, `LFXLocationWatch`, `LFXLocationClient`) describe a service that the mounted SynWare session provides. You reach the service through `useSynWareLocation()`, and the host applies your manifest permissions, its own policy and the browser's Geolocation prompt before any fix reaches you.

LocationFX covers foreground positioning: one-shot fixes and continuous updates while your application is visible and active. It reports the facilities that native Core Location offers and the web does not (background delivery, region monitoring, visits and similar) through `LFXNativeOnlyCapabilities`, so your code can decide what to offer instead of discovering the gap at runtime.

```ts
import { LFXCoordinate, LFXLocation } from "@syndromatic/syncloudos/fx/location";
```

## At a glance

| | |
| --- | --- |
| Prefix | `LFX` |
| Entry | `@syndromatic/syncloudos/fx/location` |
| Hook | `useSynWareLocation()` from `@syndromatic/syncloudos/sdk`, returning an `LFXLocationManager` |
| Manifest permissions | `location.read` (create the manager, read authorisation status), `location.request` (request fixes, start watches) |
| Session client | `LFXLocationClient`, available as `useSynWare().location` |
| Apple analogue | Core Location (`CLLocationManager`, `CLLocation`, `CLLocationCoordinate2D`) |
| Runs in | Value types: any JavaScript environment. Manager: the mounted session, on a secure (HTTPS) page |

## What LocationFX exports

| Export | Kind | Role |
| --- | --- | --- |
| `LFXCoordinate` | class | Validated latitude and longitude in degrees, with distance and bearing. |
| `LFXLocation` | class | One position fix: coordinate, accuracy, altitude, speed, course and two timestamps. |
| `LFXLocationDescriptor` | interface | The plain-data shape you pass to `new LFXLocation(...)`. |
| `lfxCourseRadiansFromDegrees` | function | Converts a compass heading in degrees to normalised radians. |
| `LFXAccuracy` | type alias | `"balanced"` or `"high"`, the accuracy preference of a request. |
| `LFXAuthorizationStatus` | type alias | `"unknown"`, `"prompt"`, `"granted"`, `"denied"` or `"unavailable"`. |
| `LFXLocationManager` | interface | The owner-scoped object that reads authorisation, requests fixes and starts watches. |
| `LFXLocationRequestOptions` | interface | Options for a one-shot `current()` request. |
| `LFXLocationWatchOptions` | interface | Options for a continuous `watch()`. |
| `LFXLocationWatch` | interface | The handle for one running watch. |
| `LFXLocationClient` | interface | The session factory that creates managers. |
| `LFXNativeOnlyCapabilities` | constant | The table of facilities the portable host does not provide. |
| `LFXNativeOnlyCapability` | type alias | The keys of that table. |
| `LFXNativeOnlyCapabilityDisposition` | interface | One entry of that table. |
| `LFXNativeOnlyReason` | type alias | The machine-readable reason attached to each entry. |

## Coordinates

### `LFXCoordinate`

An `LFXCoordinate` is an immutable latitude and longitude pair on the WGS84 datum, the datum that GPS and the browser Geolocation API use. The constructor validates both values and freezes the instance, so a coordinate that exists is always in range. Coordinates have no lifetime concerns: create as many as you like and share them freely.

```text
new LFXCoordinate(latitude: number, longitude: number)
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `latitude` | `readonly number` | Degrees north of the equator, in the range -90 to 90 inclusive. |
| `longitude` | `readonly number` | Degrees east of the prime meridian, in the range -180 to 180 inclusive. |
| `distanceTo(other)` | `(other: LFXCoordinate) => number` | Distance in metres along the WGS84 ellipsoid, computed with an iterative inverse geodesic solution. If the iteration does not converge (nearly antipodal points), the method falls back to a great-circle distance on a sphere of the ellipsoid's authalic radius. Identical points give `0`. Throws `TypeError` when `other` is not an `LFXCoordinate`. |
| `initialBearingTo(other)` | `(other: LFXCoordinate) => number` | The bearing you would set out on from this coordinate to reach `other`, in radians clockwise from true north, normalised to the range 0 up to (not including) 2π. Identical points give `0`. Throws `TypeError` when `other` is not an `LFXCoordinate`. |

The constructor throws `RangeError` when either value is `NaN`, infinite or outside its range. It stores negative zero as `0`. Longitudes wrap correctly inside `distanceTo` and `initialBearingTo`, so two points either side of the antimeridian measure as close together. The results are approximate in the sense that the geodesic solution stops when successive iterations agree to about 1e-12 radians, far below the accuracy of any consumer positioning source.

```ts
import { LFXCoordinate } from "@syndromatic/syncloudos/fx/location";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function describeLeg(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number): string {
  const from = new LFXCoordinate(fromLatitude, fromLongitude);
  const to = new LFXCoordinate(toLatitude, toLongitude);
  const kilometres = from.distanceTo(to) / 1000;
  const bearing = from.initialBearingTo(to);
  const sector = Math.round(bearing / (Math.PI / 4)) % COMPASS.length;
  return `${kilometres.toFixed(1)} km ${COMPASS[sector]}`;
}

export const londonToParis = describeLeg(51.5074, -0.1278, 48.8566, 2.3522);
```

Validate untrusted input at the boundary and catch the `RangeError` there. A coordinate typed by a user, read from a file or received from a server is the usual source.

```ts
import { LFXCoordinate } from "@syndromatic/syncloudos/fx/location";

export function parseCoordinate(text: string): LFXCoordinate | null {
  const [latitudeText, longitudeText] = text.split(",");
  if (latitudeText === undefined || longitudeText === undefined) return null;
  try {
    return new LFXCoordinate(Number(latitudeText.trim()), Number(longitudeText.trim()));
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
```

## Location fixes

### `LFXLocation`

An `LFXLocation` is one immutable position fix. Managers create these for you; you construct one yourself mainly in tests, previews and when you restore a saved position. A fix carries two timestamps on purpose. `observedAtUnixMilliseconds` is wall-clock time and can jump when the user or the network changes the clock. `receivedAtMonotonicSeconds` is a monotonic reading taken when the host received the fix, so differences between two fixes are always meaningful. Use the wall-clock value for display and storage, and the monotonic value for age and ordering.

```text
new LFXLocation(value: LFXLocationDescriptor)
```

| Member | Type | Description |
| --- | --- | --- |
| `coordinate` | `readonly LFXCoordinate` | The position. |
| `observedAtUnixMilliseconds` | `readonly number` | When the position source produced the fix, in milliseconds since the Unix epoch. Any finite number is accepted. |
| `receivedAtMonotonicSeconds` | `readonly number` | When the host received the fix, in seconds on the host's monotonic clock (in the browser host, `performance.now() / 1000`). Nonnegative. |
| `horizontalAccuracyMetres` | `readonly number` | Radius of the horizontal uncertainty circle in metres. Nonnegative. Smaller is better. |
| `altitudeMetres` | `readonly number \| null` | Altitude in metres above the WGS84 reference, or `null` when the source reports none. |
| `altitudeAccuracyMetres` | `readonly number \| null` | Vertical uncertainty in metres, or `null` when absent. Nonnegative when present. |
| `speedMetresPerSecond` | `readonly number \| null` | Ground speed in metres per second, or `null` when absent. Nonnegative when present. |
| `courseRadians` | `readonly number \| null` | Direction of travel in radians clockwise from true north, in the range 0 up to (not including) 2π, or `null` when absent. |

Each optional channel is either a valid number or `null`. LocationFX never substitutes `0` for a channel the source did not report, because `0` metres per second and "speed unknown" mean different things. Check for `null` before you use a channel.

The constructor accepts only plain data. It throws:

- `TypeError` when the argument is not a plain object (a class instance, including another `LFXLocation`, is rejected), has symbol keys, has accessor properties, or does not have exactly the eight descriptor keys.
- `TypeError` when `coordinate` is not an `LFXCoordinate`.
- `RangeError` when a number is not finite, when a nonnegative field is negative, or when `courseRadians` is outside 0 up to 2π.

It stores negative zero as `0` and freezes the instance. To derive a fix from an existing one, spread it into a new plain object, which copies the eight data properties.

```ts
import { LFXCoordinate, LFXLocation, lfxCourseRadiansFromDegrees } from "@syndromatic/syncloudos/fx/location";

export function fixture(): LFXLocation {
  return new LFXLocation({
    coordinate: new LFXCoordinate(37.3349, -122.009),
    observedAtUnixMilliseconds: Date.UTC(2026, 8, 29, 9, 30),
    receivedAtMonotonicSeconds: 120.5,
    horizontalAccuracyMetres: 12,
    altitudeMetres: 21,
    altitudeAccuracyMetres: 8,
    speedMetresPerSecond: 1.4,
    courseRadians: lfxCourseRadiansFromDegrees(-90),
  });
}

export function withAccuracy(fix: LFXLocation, horizontalAccuracyMetres: number): LFXLocation {
  return new LFXLocation({ ...fix, horizontalAccuracyMetres });
}

export function ageSeconds(fix: LFXLocation, nowMonotonicSeconds: number): number {
  return Math.max(0, nowMonotonicSeconds - fix.receivedAtMonotonicSeconds);
}

export function isUsable(fix: LFXLocation, maximumAccuracyMetres: number, maximumAgeSeconds: number): boolean {
  const now = performance.now() / 1000;
  return fix.horizontalAccuracyMetres <= maximumAccuracyMetres && ageSeconds(fix, now) <= maximumAgeSeconds;
}
```

### `LFXLocationDescriptor`

The input to `LFXLocation`. `LFXLocation` implements it, so a fix satisfies the type structurally, although the constructor still requires a plain object.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `coordinate` | `LFXCoordinate` | required | The position. |
| `observedAtUnixMilliseconds` | `number` | required | Wall-clock observation time in milliseconds since the Unix epoch. |
| `receivedAtMonotonicSeconds` | `number` | required | Monotonic receipt time in seconds. Nonnegative. |
| `horizontalAccuracyMetres` | `number` | required | Horizontal uncertainty radius in metres. Nonnegative. |
| `altitudeMetres` | `number \| null` | required | Altitude in metres, or `null`. |
| `altitudeAccuracyMetres` | `number \| null` | required | Vertical uncertainty in metres (nonnegative), or `null`. |
| `speedMetresPerSecond` | `number \| null` | required | Ground speed in metres per second (nonnegative), or `null`. |
| `courseRadians` | `number \| null` | required | Course in radians in 0 up to 2π, or `null`. |

Every field is required. Pass `null` explicitly for an absent channel.

### `lfxCourseRadiansFromDegrees`

```text
lfxCourseRadiansFromDegrees(value: number | null): number | null
```

Converts a heading in degrees (the unit the browser Geolocation API reports) into the normalised radians that `LFXLocation.courseRadians` requires. `null` returns `null`, so an absent heading stays absent. Any finite number is wrapped into 0 up to (not including) 360 degrees first, so `-90` gives 3π/2 radians (270 degrees) and `360` gives `0`. It throws `RangeError` for `NaN` or an infinite value.

```ts
import { lfxCourseRadiansFromDegrees } from "@syndromatic/syncloudos/fx/location";

export function headingToRadians(degrees: number | null | undefined): number | null {
  if (degrees === null || degrees === undefined || Number.isNaN(degrees)) return null;
  return lfxCourseRadiansFromDegrees(degrees);
}
```

## Preferences and status

### `LFXAccuracy`

```text
type LFXAccuracy = "balanced" | "high";
```

The accuracy preference of a request. `"balanced"` is the default everywhere. `"high"` asks the host for the most precise source it has, which usually costs more battery and time to first fix. It is a preference: the host may return a coarse fix, and `high` does not unlock any facility listed in [Native-only capabilities](#native-only-capabilities). Any other string is rejected with a `TypeError` by `watch`.

### `LFXAuthorizationStatus`

```text
type LFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
```

| Value | Meaning |
| --- | --- |
| `"granted"` | The user has allowed location for this page. |
| `"prompt"` | The user has not decided. The browser prompts on the next request. |
| `"denied"` | The user or the host refused. This also reports a missing or policy-denied `location.read` permission. |
| `"unavailable"` | The host cannot provide location: the page is not in a secure context, the browser has no Geolocation API, or the component's manager is not mounted. |
| `"unknown"` | The host cannot tell. The browser has no Permissions API for geolocation, or the query failed. A request may still succeed. |

Reading the status never starts a positioning source and never triggers the browser prompt.

## The manager

### `LFXLocationManager`

An `LFXLocationManager` is a mount-scoped foreground location service. Creating one is passive: it does not prompt, start a watch or read the device. The manager owns everything you start through it. Disposing the manager cancels its pending requests and ends its watches. In a component you receive one from `useSynWareLocation()` and never create or dispose it yourself.

| Member | Type or signature | Description |
| --- | --- | --- |
| `getAuthorizationStatus()` | `() => Promise<LFXAuthorizationStatus>` | Resolves the current status without prompting. Resolves `"denied"` when the manifest does not declare `location.read` or host policy refuses it. Rejects with `AbortError` after the manager is disposed. |
| `current(options?)` | `(options?: LFXLocationRequestOptions) => Promise<LFXLocation>` | Requests one fix. Requires `location.request`. Resolves with the first fix the host delivers and stops its positioning source straight after. May trigger the browser permission prompt. Rejections are listed in [Errors and edge cases](#errors-and-edge-cases). |
| `watch(options, listener)` | `(options: LFXLocationWatchOptions, listener: (location: LFXLocation) => void) => LFXLocationWatch` | Starts continuous updates and returns a handle immediately. Requires `location.request`. Throws synchronously for invalid options, a missing permission, an aborted signal or an unavailable host. |
| `dispose()` | `() => void` | Ends the manager. Pending `current` requests reject with `AbortError`, every watch stops delivering, and later calls fail with `AbortError`. Safe to call more than once. |

The manager is frozen, and its methods do not depend on `this`, so you can pass `manager.current` around as a plain function.

### `LFXLocationRequestOptions`

The options for `current()`. Every field is optional.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `accuracy` | `LFXAccuracy` | `"balanced"` | Accuracy preference. `"high"` asks for the most precise source. |
| `maximumAgeSeconds` | `number` | `0` | The oldest cached position, in seconds, that you will accept. `0` requires a fresh fix. Finite and nonnegative. |
| `timeoutSeconds` | `number` | `10` | How long to wait for a fix, in seconds, before rejecting with `TimeoutError`. Finite and positive; `0` is rejected. |
| `signal` | `AbortSignal` | none | Cancels the request. The promise rejects with the signal's reason, or an `AbortError` when the signal has none. |

`maximumAgeSeconds` and `timeoutSeconds` are converted to whole milliseconds for the browser. A value that does not come to a whole number of milliseconds (for example `0.0005`), or that is too large to represent, is rejected with `RangeError`. The request also ends when the owning manager is disposed, whatever the state of `signal`.

### `LFXLocationWatchOptions`

The options for `watch()`. Every field is optional.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `accuracy` | `LFXAccuracy` | `"balanced"` | Accuracy preference. |
| `maximumAgeSeconds` | `number` | `0` | If your application already received a fix from the shared watch within this many seconds (measured on the monotonic clock), the listener receives that fix immediately on subscription. `0` disables the early delivery. Finite and nonnegative. |
| `minimumIntervalSeconds` | `number` | `0` | The least time between two fixes delivered to this listener, measured between `receivedAtMonotonicSeconds` values. A fix that arrives sooner is dropped, not held back. `0` delivers every fix. Finite and nonnegative. |
| `signal` | `AbortSignal` | none | Ends the watch when it aborts. Passing an already aborted signal makes `watch` throw. |

The first fix a listener receives always passes the interval check, since there is no previous delivery to compare with.

### `LFXLocationWatch`

The handle for one running watch.

| Member | Type | Description |
| --- | --- | --- |
| `dispose()` | `() => void` | Stops delivery to this listener and releases the watch. Idempotent. When no watch in the session remains active, the host stops its positioning source. |

A watch also ends when its `signal` aborts, when its manager is disposed, and when the application closes. The listener has no error channel: if the position source fails or the user revokes permission mid-watch, updates stop and no error is delivered. Read `getAuthorizationStatus()` to find out why. An exception thrown by your listener is caught and discarded, so it cannot break other listeners or other applications.

Several watches can run at once. The host shares one positioning source across all of them and uses `"high"` accuracy whenever at least one active watch asks for it, so a `"balanced"` watch can receive precise fixes while another watch is running. `minimumIntervalSeconds` and `maximumAgeSeconds` are applied per watch, so each listener sees its own cadence.

### Requesting one fix

```tsx
import { useCallback, useRef, useState } from "react";
import { useSynWareLocation } from "@syndromatic/syncloudos/sdk";
import type { LFXAuthorizationStatus, LFXLocation } from "@syndromatic/syncloudos/fx/location";

function explain(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError": return "Location access was declined.";
      case "SecurityError": return "This application is not permitted to read location.";
      case "TimeoutError": return "No position arrived in time.";
      case "NotFoundError": return "No position is available on this device.";
      case "AbortError": return "The request was cancelled.";
      default: return error.message;
    }
  }
  return error instanceof Error ? error.message : "Unknown location error.";
}

export function LocateButton() {
  const location = useSynWareLocation();
  const pending = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<LFXAuthorizationStatus>("unknown");
  const [fix, setFix] = useState<LFXLocation | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const locate = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setMessage(null);
    try {
      const current = await location.getAuthorizationStatus();
      setStatus(current);
      if (current === "denied" || current === "unavailable") {
        setMessage("Location is not available. Enter your position by hand instead.");
        return;
      }
      const result = await location.current({
        accuracy: "balanced",
        maximumAgeSeconds: 30,
        timeoutSeconds: 8,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setFix(result);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(explain(error));
    }
  }, [location]);

  return (
    <section>
      <button onClick={() => void locate()}>Find my position</button>
      <button onClick={() => pending.current?.abort()}>Cancel</button>
      <p>Status: {status}</p>
      {fix ? (
        <p>
          {fix.coordinate.latitude.toFixed(5)}, {fix.coordinate.longitude.toFixed(5)}
          {" "}(within {Math.round(fix.horizontalAccuracyMetres)} m)
        </p>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}
```

Ask in response to a user action and say why you need the position. The browser prompt is easy to dismiss and hard to reverse.

### Watching for updates

A watch belongs to the component that starts it. Start it in an effect, tie it to an `AbortController` and dispose it in the cleanup. Check the status first when the feature has a sensible fallback.

```tsx
import { useEffect, useState } from "react";
import { useSynWareLocation } from "@syndromatic/syncloudos/sdk";
import type { LFXLocation, LFXLocationWatch } from "@syndromatic/syncloudos/fx/location";

export function LiveTrack({ tracking }: { readonly tracking: boolean }) {
  const location = useSynWareLocation();
  const [latest, setLatest] = useState<LFXLocation | null>(null);
  const [trail, setTrail] = useState<readonly LFXLocation[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!tracking) return undefined;
    const controller = new AbortController();
    let watch: LFXLocationWatch | null = null;

    location
      .getAuthorizationStatus()
      .then((status) => {
        if (controller.signal.aborted) return;
        if (status === "denied" || status === "unavailable") {
          setNote(`Location is ${status}.`);
          return;
        }
        watch = location.watch(
          { accuracy: "high", minimumIntervalSeconds: 2, signal: controller.signal },
          (fix) => {
            setLatest(fix);
            setTrail((previous) => [...previous, fix].filter((_, index, all) => index >= all.length - 100));
          },
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setNote(error instanceof Error ? error.message : "Location failed.");
      });

    return () => {
      controller.abort();
      watch?.dispose();
    };
  }, [location, tracking]);

  let metres = 0;
  for (let index = 1; index < trail.length; index += 1)
    metres += trail[index - 1]!.coordinate.distanceTo(trail[index]!.coordinate);

  return (
    <div>
      <p>{latest ? `${latest.coordinate.latitude.toFixed(5)}, ${latest.coordinate.longitude.toFixed(5)}` : "Waiting for a fix"}</p>
      <p>Travelled about {Math.round(metres)} m over {trail.length} fixes.</p>
      {note ? <p role="alert">{note}</p> : null}
    </div>
  );
}
```

The `AbortController` in this example covers the gap between starting the status query and creating the watch: if the component unmounts in that gap, the `then` callback sees the aborted signal and never starts the watch.

## The SynWare hook

### `useSynWareLocation`

```text
useSynWareLocation(): LFXLocationManager
```

The hook returns a stable, frozen manager facade for the component. It creates the underlying manager when the component mounts (in a layout effect) and disposes it when the component unmounts, so you never call `dispose()` on it. The facade has the same four members as `LFXLocationManager`, with these differences:

- Before the component mounts, `current()` and `watch()` throw `Error("The component location owner is not mounted.")`, and `getAuthorizationStatus()` resolves `"unavailable"`. After unmount the same applies. Call the manager from effects and event handlers, not during render.
- The facade does not change between renders, so it is safe in dependency arrays.
- Mounting never requests a fix.
- Creating the underlying manager requires `location.read`. When the manifest does not declare it, or host policy refuses it, creation throws a `SecurityError` `DOMException` from the mount effect. Declare the permission before you use the hook.
- One application can hold at most eight managers at a time. A ninth creation throws a `QuotaExceededError` `DOMException`. A component that uses the hook holds one.

```json
{
  "permissions": ["location.read", "location.request"]
}
```

See the [SynWare manifest](../synware-manifest.md) for where `permissions` sits in the manifest.

### `LFXLocationClient`

The client is the session-level factory behind the hook. It is available as `useSynWare().location` when you need a manager whose lifetime you control yourself, for example a manager shared by several components, or one bound to a task rather than a mount. Most components use the hook instead.

```text
createManager(signal?: AbortSignal): LFXLocationManager
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `createManager(signal?)` | `(signal?: AbortSignal) => LFXLocationManager` | Creates a manager. Requires `location.read`; throws a `SecurityError` `DOMException` when the manifest does not declare it or policy refuses it. Throws `QuotaExceededError` when the application already holds eight managers, and throws when `signal` is already aborted. When `signal` aborts, the manager is disposed. Every manager also ends when the application unmounts or closes. Dispose the manager when you finish with it to free its slot. |

```tsx
import { useEffect, useState } from "react";
import { useSynWare } from "@syndromatic/syncloudos/sdk";
import type { LFXLocation, LFXLocationManager } from "@syndromatic/syncloudos/fx/location";

export function useSharedFix(): LFXLocation | null {
  const { location } = useSynWare();
  const [fix, setFix] = useState<LFXLocation | null>(null);

  useEffect(() => {
    const lifetime = new AbortController();
    let manager: LFXLocationManager | null = null;
    try {
      manager = location.createManager(lifetime.signal);
      manager.watch({ minimumIntervalSeconds: 5, signal: lifetime.signal }, setFix);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      // SecurityError or QuotaExceededError: leave the fix empty.
    }
    return () => {
      lifetime.abort();
      manager?.dispose();
    };
  }, [location]);

  return fix;
}
```

## Native-only capabilities

Core Location on a native platform offers facilities that a browser page cannot provide. `LFXNativeOnlyCapabilities` lists them, so a feature can check for a capability and choose a fallback in one place instead of scattering user-agent tests.

### `LFXNativeOnlyCapabilities`

```text
const LFXNativeOnlyCapabilities: Readonly<Record<LFXNativeOnlyCapability, LFXNativeOnlyCapabilityDisposition>>
```

A deeply frozen record with one entry per `LFXNativeOnlyCapability`. On the portable (web) host every entry has `state: "unavailable-on-portable-host"`. Requesting `"high"` accuracy does not change any entry.

| Key (`LFXNativeOnlyCapability`) | `reason` (`LFXNativeOnlyReason`) | Native counterpart |
| --- | --- | --- |
| `"precise-accuracy-authorization"` | `"native-precise-accuracy-authorization-unavailable"` | Separate user choice between precise and approximate location. |
| `"background-updates"` | `"native-background-delivery-unavailable"` | Location delivery while the application is not in the foreground. |
| `"significant-change-monitoring"` | `"native-significant-change-monitoring-unavailable"` | Low-power notification when the device moves a large distance. |
| `"visits"` | `"native-visit-monitoring-unavailable"` | Notification when the user arrives at or leaves a place. |
| `"beacons"` | `"native-beacon-monitoring-unavailable"` | Ranging and monitoring of nearby beacons. |
| `"floor-metadata"` | `"native-floor-metadata-unavailable"` | The building floor for indoor fixes. |
| `"service-sessions"` | `"native-service-session-unavailable"` | Explicit sessions that declare a use of location services. |
| `"geofencing"` | `"native-geofence-delivery-unavailable"` | Circular region entry and exit notifications. |

### `LFXNativeOnlyCapabilityDisposition`

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `"unavailable-on-portable-host"` | The only value the portable host reports. |
| `reason` | `LFXNativeOnlyReason` | A stable string identifying why the facility is absent. Use it as a key for messages or diagnostics. |

Each disposition object is frozen.

### `LFXNativeOnlyCapability` and `LFXNativeOnlyReason`

String-literal unions. `LFXNativeOnlyCapability` names the eight keys above and `LFXNativeOnlyReason` names the eight reason strings, one per key. Use them to type your own tables, for example a record of user-facing explanations.

```ts
import { LFXNativeOnlyCapabilities } from "@syndromatic/syncloudos/fx/location";
import type { LFXNativeOnlyCapability, LFXNativeOnlyReason } from "@syndromatic/syncloudos/fx/location";

const MESSAGES: Readonly<Record<LFXNativeOnlyCapability, string>> = {
  "precise-accuracy-authorization": "Accuracy is whatever the browser grants.",
  "background-updates": "Location updates only while this app is open.",
  "significant-change-monitoring": "Open the app to refresh your position.",
  visits: "Places you visit are not recorded automatically.",
  beacons: "Nearby beacons cannot be detected.",
  "floor-metadata": "Floor numbers are not available.",
  "service-sessions": "No session setup is needed.",
  geofencing: "Arrival alerts are not available.",
};

export function unsupportedFeatures(): ReadonlyArray<{ capability: LFXNativeOnlyCapability; reason: LFXNativeOnlyReason; message: string }> {
  const keys = Object.keys(LFXNativeOnlyCapabilities) as LFXNativeOnlyCapability[];
  return keys
    .filter((key) => LFXNativeOnlyCapabilities[key].state === "unavailable-on-portable-host")
    .map((key) => ({ capability: key, reason: LFXNativeOnlyCapabilities[key].reason, message: MESSAGES[key] }));
}

export function canGeofence(): boolean {
  return LFXNativeOnlyCapabilities.geofencing.state !== "unavailable-on-portable-host";
}
```

A feature such as arrival alerts can be built in the foreground: watch with a modest `minimumIntervalSeconds`, compare each fix with `LFXCoordinate.distanceTo`, and tell the user that alerts work only while the application is open.

## Capabilities and permissions

Three independent gates decide whether a fix reaches your code.

1. **The manifest.** `location.read` lets you create a manager and read the authorisation status. `location.request` lets you call `current()` and `watch()`. An application that requests fixes needs both.
2. **Host policy.** The host can refuse a declared permission. The result looks the same as an undeclared permission.
3. **The browser.** The page must be a secure context, the browser must support Geolocation, and the user must grant access when the browser prompts.

| Situation | What you see |
| --- | --- |
| `location.read` not declared or refused by policy | `getAuthorizationStatus()` resolves `"denied"`. Creating a manager (including mounting the hook) throws `SecurityError`. |
| `location.request` not declared or refused by policy | `current()` rejects and `watch()` throws, both with `SecurityError`. |
| Page is not a secure context | `getAuthorizationStatus()` resolves `"unavailable"`. `current()` rejects and `watch()` throws with `SecurityError`. |
| Browser has no Geolocation | `getAuthorizationStatus()` resolves `"unavailable"`. `current()` rejects and `watch()` throws with `NotFoundError`. |
| User denied the browser prompt | `getAuthorizationStatus()` resolves `"denied"`. `current()` rejects with `NotAllowedError`. |
| The host has no location service installed | `getAuthorizationStatus()` resolves `"unavailable"`. `current()` and `watch()` fail with `NotFoundError`. |

Permissions are checked on every call, so a permission that host policy revokes while the application runs takes effect on the next request.

## Errors and edge cases

Every failure surfaces as a standard exception. `current()` returns a rejected promise. `watch()`, the constructors and `createManager()` throw synchronously.

| Error | Raised by | Cause |
| --- | --- | --- |
| `RangeError` | `LFXCoordinate`, `LFXLocation`, `lfxCourseRadiansFromDegrees`, `current`, `watch` | A number is not finite, is out of range, or is negative where a nonnegative value is required. Also a `timeoutSeconds` of `0`, or a duration that is not a whole number of milliseconds. |
| `TypeError` | `LFXLocation`, `LFXCoordinate`, `watch` | The descriptor is not plain data, `coordinate` or the argument to `distanceTo` and `initialBearingTo` is not an `LFXCoordinate`, `accuracy` is not `"balanced"` or `"high"`, or the listener is not a function. |
| `SecurityError` (`DOMException`) | `createManager`, `current`, `watch` | A permission is not declared or is refused by policy, or the page is not a secure context. |
| `NotAllowedError` (`DOMException`) | `current` | The user denied the browser prompt. |
| `NotFoundError` (`DOMException`) | `current`, `watch` | The position is unavailable, the browser has no Geolocation, or no location service is installed. |
| `TimeoutError` (`DOMException`) | `current` | No fix arrived within `timeoutSeconds`. |
| `OperationError` (`DOMException`) | `current` | The browser reported a failure that is none of the above. |
| `AbortError` (`DOMException`) | any manager call | The request `signal` aborted (the rejection carries the signal's reason when it has one), the manager was disposed, or the application closed. |
| `QuotaExceededError` (`DOMException`) | `createManager` | The application already holds eight managers. |

Edge cases worth planning for:

- **Cached fixes.** With `maximumAgeSeconds` above `0`, the browser may answer `current()` from a recent position. Compare `receivedAtMonotonicSeconds` with the monotonic clock to see how old the result is.
- **Poor accuracy.** A fix with a large `horizontalAccuracyMetres` (a coarse network position, for instance) is still a valid fix. Decide in your own code what accuracy you need.
- **Missing channels.** Many devices and browsers report `null` for altitude, speed or course. Treat each of those channels as optional.
- **Dropped fixes.** `minimumIntervalSeconds` discards early fixes rather than delaying them, so the last delivered fix can be older than the newest position. Call `current()` when you need the latest.
- **Suspension.** While the host suspends your application, its watches stop delivering and the early-delivery cache is cleared. On resume the host checks the manifest permissions and the authorisation status again. Delivery restarts when the status is neither `"denied"`, `"unavailable"` nor `"prompt"`; otherwise the watches stay quiet. Handle this by reading `getAuthorizationStatus()` when your application returns to the foreground.
- **Errors during a watch.** No error reaches the listener. See [`LFXLocationWatch`](#lfxlocationwatch).

## Lifetimes and disposal

| Object | Owner | Ends when |
| --- | --- | --- |
| `LFXCoordinate`, `LFXLocation` | Garbage collection | Nothing to dispose. |
| Manager from `useSynWareLocation()` | The component | The component unmounts. |
| Manager from `createManager(signal)` | You | You call `dispose()`, `signal` aborts, or the application unmounts or closes. |
| `current()` request | The manager and the request `signal` | It settles, the `signal` aborts or the manager is disposed. |
| `LFXLocationWatch` | The manager and the watch `signal` | You call `dispose()`, `signal` aborts, the manager is disposed or the application closes. |

Disposal cascades downward. Disposing a manager ends its requests and watches. When the last active watch across the session ends, the host stops its positioning source. Closing an application disposes its managers and blocks new ones until the application opens again. Everything here is idempotent, so calling `dispose()` twice is harmless.

## Privacy

Location is sensitive. Request it only when a feature needs it, ask in response to a user action and explain why, keep fixes in memory unless the user chooses to save them, and offer a way to use the feature without location. Prefer `current()` to `watch()` when a single position is enough, and dispose a watch as soon as the feature that needs it closes.

## Related

- [FX frameworks](README.md)
- [MotionFX](motion.md) for device orientation and movement
- [SynWare SDK](../synware-sdk.md) for the hooks and the session context
- [SynWare manifest](../synware-manifest.md) for declaring permissions
- [Runtime](../runtime.md) for how the host hands out services
