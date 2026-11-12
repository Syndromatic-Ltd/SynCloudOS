import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  let x = 0;
  DFXQueue.global().async(() => {
    x = 1;
  });
}
