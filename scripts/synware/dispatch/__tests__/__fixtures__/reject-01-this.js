import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export class WorkerHost {
  count = 5;
  start() {
    DFXQueue.global().async(() => this.count + 1);
  }
}
