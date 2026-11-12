import { DFXQueue, DFXQoS, DFXWorkItemFlags } from "@syndromatic/syncloudos/fx/dispatch";
export function run(limit) {
  const q = new DFXQueue("serial");
  q.async([DFXWorkItemFlags.barrier], () => limit * 2);
  q.async({ qos: DFXQoS.utility }, () => limit * 3);
}
