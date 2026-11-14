import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { uiHelper } from "./ui";
export function run() {
  DFXQueue.global().async(() => uiHelper());
}
