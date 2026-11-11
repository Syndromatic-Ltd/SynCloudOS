import { resolveSCOSSession, scosSessionsForApp, type SCOSAppSession } from "../scos/scosSessionRegistry";
import { SCOSError } from "../scos/scosErrors";
import { fxApplicationID } from "./fxIdentity";

export type FXSessionUnavailableReason = "notRunning" | "ambiguous" | "ended";

/** Construct before services exist; resolve only at the first privileged call.
 * An adapter captures its ports from this session and owns their cleanup. */
export function createFXSessionBinding(type: Function, unavailable: (reason: FXSessionUnavailableReason) => Error): Readonly<{ resolve(): SCOSAppSession }> {
  const appID = fxApplicationID(type);
  let captured: SCOSAppSession | undefined;
  let ended = false;
  return Object.freeze({
    resolve() {
      if (captured && (captured.context.signal.aborted || !scosSessionsForApp(appID).includes(captured))) ended = true;
      if (ended) throw unavailable("ended");
      if (captured) return captured;
      try { captured = resolveSCOSSession(appID); }
      catch (error) {
        if (!(error instanceof SCOSError)) throw error;
        if (error.code === "SCOS_APP_NOT_RUNNING") throw unavailable("notRunning");
        if (error.code === "SCOS_AMBIGUOUS_SESSION") throw unavailable("ambiguous");
        throw error;
      }
      return captured;
    },
  });
}

export { observeSCOSSessionEnd as observeFXSessionEnd } from "../scos/scosSessionRegistry";
export type { SCOSAppSession as FXAppSession } from "../scos/scosSessionRegistry";
