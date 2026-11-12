import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(a, b) {
  const c = 10;
  DFXQueue.global().async(() => a + b + c);
}
