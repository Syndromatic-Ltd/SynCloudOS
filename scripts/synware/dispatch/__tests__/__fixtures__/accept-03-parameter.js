import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(input) {
  DFXQueue.global().async(() => input.length);
}
