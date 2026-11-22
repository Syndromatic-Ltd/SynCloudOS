# NetworkFX

NetworkFX tells your app whether it has a usable network path and what kind of path it is. Reach for it when you want to pause sync while offline, or back off large downloads on a constrained connection. It lives at `@syndromatic/syncloudos/fx/network`.

Declare `network.read` in Info.ts. Import the classes inside an application bundle compiled with the SynCloudOS plugin: the plugin supplies per-app subclasses, and each monitor keeps hold of its app session across awaits, timers and callbacks. There is no permission prompt.

```ts
import { NWFXPathMonitor } from "@syndromatic/syncloudos/fx/network";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";

const monitor = new NWFXPathMonitor();
monitor.pathUpdateHandler = path => console.log(path.status);
monitor.start(DFXQueue.main);
// When you no longer need updates:
monitor.cancel();
```

## The monitor

`new NWFXPathMonitor()` watches every interface. Pass one `NWFXInterfaceType` to require that interface, or an array of types to exclude them. An empty array applies no filter. An unknown type throws `NWFXError.posix(22)`.

`start(queue)` takes a required `DFXQueue`; pass `DFXQueue.main` to receive updates on the main queue. Calling `start` again on a running monitor does nothing. `queue` reports the delivery queue, or `null` before you start. Every update, including the first, runs as a synchronous Dispatch work item, and `currentPath` is set just before your handler runs. Reading `currentPath` before the first delivery throws `NWFXError.posix(45)` rather than guessing a route.

`cancel()` is final. A cancelled monitor rejects path reads and further starts, so create a new one if you need to watch again.

### In a component

`useNetwork()` from `@syndromatic/syncloudos/sdk` returns an idle `NWFXPathMonitor` owned by the component. Set its handler and call `start` in an effect. The hook cancels the monitor when the component unmounts or its app context changes, and the monitor survives React StrictMode's effect replay. If your component calls `cancel()` itself, it needs a fresh monitor afterwards.

## Access and lifetime

Construction and every delivery check the launch entitlement and the app's current authority. Revoking access cancels native subscriptions at once, and restoring it never delivers a path that was queued before the revocation or revives an old monitor. Aborting the app, or removing its session, ends every monitor.

Each mounted app may run up to eight monitors at a time; the ninth `start` throws `NWFXError.posix(24)`. Importing the module or constructing a monitor never starts browser observation on its own. The host adapters are private: nothing on `SCOS`, `SynWareContextValue`, browser contribution environments or testing environments exposes them.

## What a browser can observe

Browsers report much less than a native network stack. NetworkFX returns what it can observe and throws `ENOTSUP` (45) for the rest. It never fabricates a value.

| Property | Browser behaviour |
|---|---|
| `status` | `navigator.onLine` gives a coarse satisfied/unsatisfied hint. It does not prove that the Internet or any endpoint is reachable, and no probes run. |
| `unsatisfiedReason` | Throws `ENOTSUP` when the host cannot observe the reason. An interface excluded by the monitor's filter produces `unsatisfied` with `notAvailable`. |
| `availableInterfaces`, `NWFXInterface.type`, `name`, `index` | Real host enumeration only. Browsers cannot list interface names or indices, so `availableInterfaces` throws `ENOTSUP`. |
| `usesInterfaceType(type)` | Uses explicitly observed transport types and throws `ENOTSUP` when the transport is unknown. Connection speed never implies a transport. |
| `isConstrained` | The browser's Save-Data setting counts as constrained. Throws `ENOTSUP` when that setting is not observable. |
| `isExpensive` | An explicit cellular transport, or a reliable metered flag, counts as expensive. Wi-Fi alone settles nothing. Throws `ENOTSUP` when cost is unknown. |
| `supportsIPv4`, `supportsIPv6`, `supportsDNS` | Real routing observations only. Ordinary browser adapters throw `ENOTSUP` for each. |
| Interface filters | Filtering relies on observed transport types. If the transport cannot be observed, `start` or the next update fails with `ENOTSUP` and cancels the monitor. |

Paths and interfaces are frozen class instances, not structured-clone records. `NWFXPathStatus`, `NWFXPathUnsatisfiedReason` (including `vpnInactive`) and `NWFXInterfaceType` are frozen case objects, each with a TypeScript union type of the same name.

## Errors

`NWFXError` has four case constructors, `posix`, `dns`, `tls` and `wifiAware`. Each instance carries a `code` naming the case and a numeric `error`. NetworkFX uses these POSIX numbers:

| `error` | Meaning |
|---|---|
| 45 (`ENOTSUP`) | The host cannot observe this property. |
| 13 (`EACCES`) | Access denied. |
| 89 (`ECANCELED`) | The monitor or its app session has ended. |
| 6 (`ENXIO`) | No running app session. |
| 22 (`EINVAL`) | Invalid input, or more than one matching app session. |
| 24 (`EMFILE`) | The per-app monitor limit was reached. |
| 5 (`EIO`) | Any other host failure. |

Constructing the unattributed base class outside a plugin-compiled bundle throws an error explaining that the class must come from such a bundle.

NetworkFX covers path monitoring only. It has no connection or listener API, and no async iterator, endpoint, gateway or link-quality reporting. If you have used `NWPathMonitor` from Apple's Network framework, the model is the same.
