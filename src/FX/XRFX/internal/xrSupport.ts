import { observeFXSessionEnd } from "../../../SynCloudOS/fxRuntimeContracts";
import { XRFXError } from "../XRFXError";
import { xrBinding } from "./xrBindings";
import { xrPortFor, type XRConfiguration } from "./xrPort";
export function xrSupport(type: Function, kind: XRConfiguration["kind"]): Promise<boolean> {
  const binding = xrBinding(type), session = binding.resolve(), port = xrPortFor(session.context), owner = new AbortController();
  return new Promise<boolean>((resolve, reject) => {
    const release = observeFXSessionEnd(session, () => { owner.abort(); reject(new XRFXError("requestFailed", "XR application session ended.")); });
    void port.isSupported(kind, owner.signal).then(value => {
      try { binding.resolve(); resolve(value); } catch (error) { reject(error); }
    }, reject).finally(release);
  });
}
