# NetworkFX

NetworkFX mirrors Apple's Network path monitoring API at `@syndromatic/syncloudos/fx/network`. Declare `network.read` in Info.ts. Import the classes inside an application bundle compiled with the SynCloudOS plugin. The plugin supplies stable per-app subclasses; constructors retain the selected app session across awaits, timers and callbacks. There is no Network authorization API or permission prompt.

```ts
import { NWFXPathMonitor, NWFXInterfaceType } from "@syndromatic/syncloudos/fx/network";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
const monitor = new NWFXPathMonitor();
monitor.pathUpdateHandler = path => console.log(path.status);
monitor.start(DFXQueue.main);
// When the owning operation ends:
monitor.cancel();
```

Constructors also accept a required `NWFXInterfaceType`, or an array of prohibited types. `start(queue)` begins observation once, and readonly `queue` identifies the delivery queue. The queue is required, as in Apple's `start(queue:)`; pass `DFXQueue.main` to deliver on the main queue. Repeated start on a live monitor is idempotent; cancellation is terminal. Handler deliveries are synchronous Dispatch work items, including the initial path. `currentPath` is updated immediately before each handler runs. Until the first queued observation it throws `NWFXError.posix(45)`; no unobserved route is invented. Cancelled/revoked monitors reject further path reads and starts.

`useNetwork()` returns an actual passive `NWFXPathMonitor`. Set its handler and start it in an effect; the hook cancels on actual component unmount or context replacement. Its insertion lifetime survives React StrictMode's layout-effect cleanup/setup replay. A component that explicitly calls `cancel()` must acquire a new monitor instead of restarting the terminal instance.

Both monitor construction and every native/queued delivery enforce the launch entitlement and current app authority. Revocation immediately cancels native subscriptions and advances an access generation; restoring access cannot deliver an older queued path or revive an older instance. App abort and selected-session registry removal are terminal. Up to eight active native observations per mount are admitted. Importing or constructing never starts browser observation. Host ports are private and are not available on SCOS, SynWareContextValue, browser contribution environments or exported testing environments. Native adapters are associated privately with their environment identity; no networkPaths field exposes the adapter or snapshot type.

| Apple member | Browser behavior |
|---|---|
| `NWPath.status` | `navigator.onLine` supplies a coarse satisfied/unsatisfied hint. It does not prove Internet or endpoint reachability. No active probes run. |
| `NWPath.unsatisfiedReason` | Throws ENOTSUP when the host cannot observe the reason. An excluded observed interface produces unsatisfied/notAvailable. |
| `NWPath.availableInterfaces`, `NWInterface.type/name/index` | Actual host interface enumeration only. Browsers cannot enumerate names/indices, so availableInterfaces throws ENOTSUP; no interfaces are fabricated. |
| `NWPath.usesInterfaceType(type)` | Uses explicit observed transport types. Missing transport throws ENOTSUP. Connection speed never establishes transport. |
| `NWPath.isConstrained` | Browser Save-Data maps to constrained; missing observation throws ENOTSUP. |
| `NWPath.isExpensive` | Explicit cellular means expensive; otherwise a reliable metered boolean is used. Missing cost throws ENOTSUP. Wi-Fi alone does not establish cost. |
| `NWPath.supportsIPv4`, `supportsIPv6`, `supportsDNS` | Actual routing/configuration observations only; ordinary browser adapters throw ENOTSUP for each. |
| Required/prohibited interface constructors | Filtering uses observed transport types; start/update fails with ENOTSUP and cancels if transport cannot be observed. An empty prohibited list imposes no filter. |

Paths and interfaces are frozen class instances; they are not structured-clone records. `NWFXPathStatus`, `NWFXPathUnsatisfiedReason` and `NWFXInterfaceType` are frozen case objects with same-named TypeScript union types. UnsatisfiedReason includes Apple's current `vpnInactive` case.

`NWFXError` represents NWError's `posix`, `dns`, `tls` and `wifiAware` associated numeric cases using static case constructors, a `code` discriminant and numeric `error`. Network uses Darwin ENOTSUP (45) for unavailable properties, EACCES (13) for access denial, ECANCELED (89) for terminal monitors, ENXIO (6) for missing sessions, EINVAL (22) for ambiguity/invalid input, EMFILE (24) for the monitor quota, and EIO (5) for other host failures. Public attributed base construction explains that the class must come from a plugin-compiled application bundle.

Primary references: [NWPathMonitor](https://developer.apple.com/documentation/network/nwpathmonitor), [NWPath](https://developer.apple.com/documentation/network/nwpath), [NWInterface](https://developer.apple.com/documentation/network/nwinterface), [NWError](https://developer.apple.com/documentation/network/nwerror). The implementation covers the agreed path-monitor member list, not connection/listener APIs or the newer asynchronous iterator, endpoint, gateway and link-quality additions.
