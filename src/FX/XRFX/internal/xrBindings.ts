import { createFXSessionBinding, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import type { XRFXSession } from "../XRFXSession";
import { XRFXError } from "../XRFXError";
export const xrBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();
export const deferredXRTypes = new WeakSet<Function>();
export const xrSessions = new WeakMap<XRFXSession, { activate(): void; dispose(): void }>();
export const xrBinding = (type: Function) =>
  xrBindings.get(type) ?? createFXSessionBinding(type, reason => new XRFXError("requestFailed", `XR application session is ${reason}.`));
