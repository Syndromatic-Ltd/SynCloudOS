# NetworkFX

NetworkFX is the standalone Network framework analogue, available through `@syndromatic/syncloudos/fx/network` and `useNetwork()` from the mounted SDK. Declare `network.read` in the app manifest. The host checks the declaration and current authority before monitor creation and every delivery.

```ts
const network = useNetwork();
// Inside an effect or command:
if (network.requestAuthorization() === "granted") {
  const monitor = network.createMonitor();
  monitor.start(path => console.log(path.status));
  // Effect cleanup:
  monitor.cancel();
}
```

`authorizationStatus()` and `requestAuthorization()` return `granted`, `denied`, or `unavailable`. Browser network observation has no permission prompt. Requesting authorization checks host authority; it cannot grant a denied entitlement. `capabilities()` reports path monitoring, Network Information, transport availability, and explicit unsupported cost/constrained/prompt features. Capability inspection requires authority.

Constructing a client, obtaining the hook, and creating a monitor are passive. `start()` subscribes and delivers the current hint. Monitors start once; `cancel()`/`dispose()` is terminal and idempotent. Caller abort, mount abort, component cleanup, and revoked authority end observation and remove listeners. A session may own at most eight monitors.

`NWFXPath.status` follows `satisfied`, `unsatisfied`, `requiresConnection`; the browser backend only produces the first two from `navigator.onLine`. This is a browser hint and never proves Internet or endpoint reachability. `interfaceType` mirrors NWInterface.InterfaceType when the browser provides a recognized transport; effective connection speed never substitutes for transport. `effectiveType`, downlink in Mbps and round-trip time in milliseconds may be absent or coarsened. Missing values are `null`.

`isExpensive` and `isConstrained` remain `null`: browsers do not expose authoritative network cost or OS Low Data Mode. `saveData` is a separate browser preference, and is never promoted to either property. Slow connections do not imply expensive connections.

All path records are frozen plain values suitable for workers/structured clone. The browser adapter is host-only, takes an injected environment, and defaults to an unavailable environment without accessing globals. No polling, probes, or background reachability requests are performed.
