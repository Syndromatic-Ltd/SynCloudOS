import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { CFXCompress } from "@syndromatic/syncloudos/fx/compression";
export function run(data) {
  DFXQueue.global().async(() => CFXCompress(data));
}
