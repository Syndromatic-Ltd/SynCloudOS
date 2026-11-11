import { useLayoutEffect } from "react";
import { useNetwork } from "@syndromatic/syncloudos/sdk";
import { NSEApplication } from "@syndromatic/syncloudos";
import { NWFXPathMonitor, NWFXPath, NWFXInterface, NWFXError } from "@syndromatic/syncloudos/fx/network";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
export { NWFXPathMonitor, NWFXPath, NWFXInterface, NWFXError, DFXQueue };
export async function afterAwait() { await Promise.resolve(); return new NWFXPathMonitor(); }
export function afterTimer() { return new Promise<NWFXPathMonitor>(resolve => setTimeout(() => resolve(new NWFXPathMonitor()), 0)); }
export function thirdParty(callback: (create: () => NWFXPathMonitor) => void) { callback(() => new NWFXPathMonitor()); }
export default class NetworkApplication extends NSEApplication {}

export function NetworkHookProbe({ receive }: { receive: (monitor: NWFXPathMonitor) => void }) {
  const monitor = useNetwork();
  useLayoutEffect(() => { receive(monitor); }, [monitor, receive]);
  return null;
}
