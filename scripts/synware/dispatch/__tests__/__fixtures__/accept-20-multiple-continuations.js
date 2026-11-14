import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(n, onStart, onDone) {
  DFXQueue.global().async(() => {
    const first = n + 1;
    DFXQueue.main.async(() => onStart(first));
    const second = first * 2;
    DFXQueue.main.async(() => onDone(second));
  });
}
