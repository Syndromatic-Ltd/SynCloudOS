import * as dispatch from "../public";
import { classForLifetime, systemLifetime } from "./lifetime";
const system = Object.freeze({ ...dispatch,
  DFXQueue: classForLifetime(dispatch.DFXQueue, systemLifetime),
  DFXGroup: classForLifetime(dispatch.DFXGroup, systemLifetime),
  DFXSemaphore: classForLifetime(dispatch.DFXSemaphore, systemLifetime),
  DFXSource: classForLifetime(dispatch.DFXSource, systemLifetime),
  DFXWorkItem: classForLifetime(dispatch.DFXWorkItem, systemLifetime),
});
/** Framework-internal queues; never exported by a package entry. */
export function systemDispatch(): typeof dispatch { return system; }
