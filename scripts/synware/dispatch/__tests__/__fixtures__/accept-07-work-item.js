import { DFXWorkItem, DFXQoS } from "@syndromatic/syncloudos/fx/dispatch";
export function makeItems(offset) {
  const a = new DFXWorkItem(() => offset + 1);
  const b = new DFXWorkItem({ qos: DFXQoS.userInitiated }, () => offset + 2);
  return [a, b];
}
