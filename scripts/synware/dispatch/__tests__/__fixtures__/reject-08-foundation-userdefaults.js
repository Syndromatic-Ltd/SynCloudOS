import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { NSEUserDefaults } from "@syndromatic/syncloudos/foundation";
export function run() {
  DFXQueue.global().async(() => NSEUserDefaults.standard);
}
