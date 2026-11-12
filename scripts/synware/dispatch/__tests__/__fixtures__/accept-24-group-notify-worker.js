import { DFXQueue, DFXGroup } from "@syndromatic/syncloudos/fx/dispatch";
export function run(seed) {
  const group = new DFXGroup();
  const q = new DFXQueue("work");
  group.notify(q, () => seed * 4);
}
