import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
let counter = 0;
export function run() {
  DFXQueue.global().async(() => counter);
}
