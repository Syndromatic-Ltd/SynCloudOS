import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
const THRESHOLD = 0.5;
const LABEL = "blur";
export function run() {
  DFXQueue.global().async(() => LABEL + ":" + THRESHOLD);
}
