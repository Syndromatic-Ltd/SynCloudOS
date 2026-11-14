import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export function run(payload) {
  DFXQueue.global().async(() => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const started = performance.now();
    return Math.sqrt(bytes.byteLength) + (started >= 0 ? 1 : 0);
  });
}
