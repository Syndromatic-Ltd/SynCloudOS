import { bindFXFamily, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { DFXQueue } from "../DFXQueue";
import { classForLifetime, sessionLifetime, type DispatchLifetime } from "./lifetime";
/** Retain the already-selected session even if later app-ID resolution is ambiguous. */
export function dispatchQueueForSession(session: FXAppSession): typeof DFXQueue {
  return queueClassForLifetime(sessionLifetime(session));
}
export function queueClassForLifetime(lifetime: DispatchLifetime): typeof DFXQueue {
  const Queue = lifetime.appId === null ? DFXQueue : bindFXFamily({ DFXQueue }, lifetime.appId).DFXQueue;
  return classForLifetime(Queue, lifetime);
}
