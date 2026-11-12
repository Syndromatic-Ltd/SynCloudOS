import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  let document = 0;
  DFXQueue.global().async((document) => document + 1);
}
