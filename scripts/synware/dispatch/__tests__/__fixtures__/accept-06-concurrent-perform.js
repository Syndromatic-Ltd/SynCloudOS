import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(count, scale) {
  DFXQueue.concurrentPerform(count, (i) => i * scale);
}
