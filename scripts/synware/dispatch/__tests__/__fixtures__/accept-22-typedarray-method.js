import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  const bytes = new Uint8Array(16);
  const arr = [1, 2, 3];
  DFXQueue.global().async(() => bytes.subarray(0, 4).byteLength + arr.map(v => v + 1).length);
}
