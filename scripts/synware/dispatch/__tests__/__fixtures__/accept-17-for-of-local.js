import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(list) {
  DFXQueue.global().async(() => {
    let total = 0;
    for (const item of list) total += item;
    return total;
  });
}
