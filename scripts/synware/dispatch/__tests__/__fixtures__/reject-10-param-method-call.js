import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(ctrl) {
  DFXQueue.global().async(() => ctrl.flush());
}
