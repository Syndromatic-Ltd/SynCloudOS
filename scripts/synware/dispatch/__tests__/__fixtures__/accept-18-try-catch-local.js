import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(raw) {
  DFXQueue.global().async(() => {
    try {
      return JSON.parse(raw);
    } catch (err) {
      return err.message;
    }
  });
}
