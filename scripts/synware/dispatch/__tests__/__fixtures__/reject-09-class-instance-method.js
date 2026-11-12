import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run() {
  const svc = new WorkerService();
  DFXQueue.global().async(() => svc.run());
}
