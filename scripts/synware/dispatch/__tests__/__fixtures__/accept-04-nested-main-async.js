import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(seed, setState) {
  DFXQueue.global().async(() => {
    const computed = seed * 2;
    DFXQueue.main.async(() => {
      setState(computed);
    });
  });
}
