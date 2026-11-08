import { NSEApplication } from "@syndromatic/syncloudos";
import { DFXQueue, DFXSource, DFXGroup, DFXWorkItem, DFXTime, DFXTimeInterval } from "@syndromatic/syncloudos/fx/dispatch";
export { DFXQueue, DFXSource, DFXGroup, DFXWorkItem, DFXTime, DFXTimeInterval };
export function createQueue() { return new DFXQueue("first"); }
export async function afterAwait() { await Promise.resolve(); return DFXQueue.main; }
export function afterTimer() { return new Promise<DFXQueue>(resolve => setTimeout(() => resolve(DFXQueue.global()), 0)); }
export function thirdParty(callback: (create: () => DFXQueue) => void) { callback(createQueue); }
export default class First extends NSEApplication {}
