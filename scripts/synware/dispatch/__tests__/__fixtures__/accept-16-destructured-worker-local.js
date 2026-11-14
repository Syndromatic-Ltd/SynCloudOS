import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(pair) {
  DFXQueue.global().async(() => {
    const { a, b } = pair;
    return a + b;
  });
}
