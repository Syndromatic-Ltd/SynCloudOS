import { NSEApplication, SCOS } from "@syndromatic/syncloudos";
import { PKFXPaymentAuthorizationController } from "@syndromatic/syncloudos/fx/pass";
import { NWFXPathMonitor } from "@syndromatic/syncloudos/fx/network";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export { PKFXPaymentAuthorizationController, NWFXPathMonitor, DFXQueue };

function inspect() {
  const payments = PKFXPaymentAuthorizationController.canMakePayments();
  const monitor = new NWFXPathMonitor();
  const queue = DFXQueue.main;
  SCOS.preferences.set("dev-attribution", "shared session");
  monitor.start(DFXQueue.main);
  const sameQueue = monitor.queue === queue;
  monitor.cancel();
  return { payments, monitor, queue, sameQueue };
}

export default class Probe extends NSEApplication {
  version() { return "before HMR"; }
  async afterAwait() { await Promise.resolve(); return inspect(); }
  afterTimer() { return new Promise<ReturnType<typeof inspect>>(resolve => setTimeout(() => resolve(inspect()), 0)); }
  fromCallback(callback: (create: typeof inspect) => void) { callback(inspect); }
}
