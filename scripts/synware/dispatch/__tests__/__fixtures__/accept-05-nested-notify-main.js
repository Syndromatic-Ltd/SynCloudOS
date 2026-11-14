import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(seed, notify, setSummary) {
  DFXQueue.global().async(() => {
    const summary = seed + 1;
    notify(DFXQueue.main, () => {
      setSummary(summary);
    });
  });
}
