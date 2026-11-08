import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { NWFXPathMonitor as BaseMonitor } from "@syndromatic/syncloudos/fx/network";
import { DFXQueue as BaseQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { PKFXPaymentAuthorizationController as BasePayment } from "@syndromatic/syncloudos/fx/pass";
import Probe, { DFXQueue, NWFXPathMonitor, PKFXPaymentAuthorizationController } from "./src/SynWare/Probe.app/Contents/index";
import info from "./src/SynWare/Probe.app/Contents/Info";

interface DevAttributionState {
  phase: string;
  bootToken: string;
  version?: () => string;
  check?: () => Promise<unknown>;
  dispose?: () => Promise<boolean>;
  first?: unknown;
  error?: string;
  stack?: string;
}
const state: DevAttributionState = (globalThis as any).__devAttribution = { phase: "starting", bootToken: crypto.randomUUID() };
const host = createSynWareTestHost({ application: Probe, manifest: { schemaVersion: 1, ...info }, document });
try {
  await host.render();
  host.adapters.permissions.allow();
  host.adapters.policy.allow();
  host.adapters.network.allow();
  host.adapters.payment.allow();
  host.adapters.storage.local.allow();
  host.adapters.credentials.allow();
  const application = host.application as Probe;
  PKFXPaymentAuthorizationController.canMakePayments();
  const main = DFXQueue.main;
  state.version = () => application.version();
  state.check = async () => {
    const fromAwait = await application.afterAwait();
    const fromTimer = await application.afterTimer();
    const fromCallback = await new Promise<Awaited<ReturnType<typeof application.afterAwait>>>(resolve => {
      queueMicrotask(() => application.fromCallback(create => resolve(create())));
    });
    return {
      version: application.version(),
      appID: host.appContext.appId,
      sharedPreferences: host.appContext.persistence.getPreference("dev-attribution", "missing"),
      separateBoundClasses: DFXQueue !== BaseQueue && NWFXPathMonitor !== BaseMonitor && PKFXPaymentAuthorizationController !== BasePayment,
      sameApplication: host.application === application,
      cases: [fromAwait, fromTimer, fromCallback].map(value => ({
        paymentsType: typeof value.payments,
        boundMonitor: value.monitor instanceof NWFXPathMonitor,
        baseMonitor: value.monitor instanceof BaseMonitor,
        boundQueue: value.queue instanceof DFXQueue,
        baseQueue: value.queue instanceof BaseQueue,
        stableMain: value.queue === main,
        sameQueue: value.sameQueue,
      })),
    };
  };
  state.dispose = async () => {
    await host.dispose();
    try { main.sync(() => {}); return false; } catch (error) { return /ended/.test(String(error)); }
  };
  state.first = await state.check();
  state.phase = "ready";
} catch (error) {
  state.phase = "error";
  state.error = String(error);
  state.stack = error instanceof Error ? error.stack : undefined;
  await host.dispose();
}
