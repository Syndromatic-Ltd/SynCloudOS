import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  DFXQueue.main.async(() => {
    document.title = "Ready";
  });
}
