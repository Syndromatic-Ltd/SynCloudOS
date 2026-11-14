import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { NSEData } from "@syndromatic/syncloudos/foundation";
export function run(raw) {
  DFXQueue.global().async(() => new NSEData(raw).byteLength);
}
