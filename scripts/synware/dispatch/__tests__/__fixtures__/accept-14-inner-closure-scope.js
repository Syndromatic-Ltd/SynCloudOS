import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(items, factor) {
  DFXQueue.global().async(() => items.map(item => item * factor));
}
