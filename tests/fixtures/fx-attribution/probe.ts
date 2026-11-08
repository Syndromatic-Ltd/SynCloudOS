// A private infrastructure probe, never an implementation of MotionFX.
import { fxAttributedClass, fxApplicationID, createFXSessionBinding } from "private:fx-attribution-contracts";
class Probe {
  static readonly [fxAttributedClass] = true;
  static identity() { return fxApplicationID(this); }
  readonly appID = fxApplicationID(new.target);
  readonly session = createFXSessionBinding(new.target, (reason: string) => Object.assign(new Error(reason), { reason }));
  use() { return this.session.resolve().context.runtimeInfo.id; }
}
export { Probe as MFXAttitude };
