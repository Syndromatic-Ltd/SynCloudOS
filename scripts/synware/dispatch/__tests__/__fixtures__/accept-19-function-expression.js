import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(a, b) {
  DFXQueue.global().async(function () {
    return a + b;
  });
}
