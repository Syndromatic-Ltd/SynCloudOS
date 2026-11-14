import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  const factor = 3;
  DFXQueue.global().async(() => factor * 14);
}
