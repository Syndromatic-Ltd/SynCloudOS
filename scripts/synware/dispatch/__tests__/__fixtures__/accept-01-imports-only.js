import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { digestHex } from "./workerSafeHelper.js";
export function run() {
  DFXQueue.global().async(() => digestHex("abc"));
}
