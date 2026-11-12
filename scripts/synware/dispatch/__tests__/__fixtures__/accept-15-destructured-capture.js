import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(rect) {
  const { width, height } = rect;
  DFXQueue.global().async(() => width * height);
}
