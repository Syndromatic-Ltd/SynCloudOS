import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
const state = createState();
export function run() {
  DFXQueue.global().async(() => state);
}
