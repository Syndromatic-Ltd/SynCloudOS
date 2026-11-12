import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  DFXQueue.global().async(() => localStorage.getItem("token"));
}
