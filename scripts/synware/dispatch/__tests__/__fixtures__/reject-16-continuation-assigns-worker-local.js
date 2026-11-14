import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(setOut) {
  DFXQueue.global().async(() => {
    let v = 1;
    DFXQueue.main.async(() => {
      v = 2;
      setOut(v);
    });
  });
}
