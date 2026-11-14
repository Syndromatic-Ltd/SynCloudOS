import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(setEl) {
  DFXQueue.global().async(() => {
    const x = document.body;
    DFXQueue.main.async(() => setEl(x));
  });
}
