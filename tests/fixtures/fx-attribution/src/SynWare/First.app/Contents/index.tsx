import { NSEApplication } from "@syndromatic/syncloudos";
import { MFXAttitude as Probe } from "@syndromatic/syncloudos/fx/motion";
import { CRFXSHA256, CRFXP256 } from "@syndromatic/syncloudos/fx/crypto";
import { CPFXAlgorithm } from "@syndromatic/syncloudos/fx/compression";

export { Probe, CRFXSHA256, CRFXP256, CPFXAlgorithm };
export function createProbe() { return new Probe(); }
export async function afterAwait() { await Promise.resolve(); return new Probe(); }
export function afterTimer() { return new Promise<Probe>(resolve => setTimeout(() => resolve(new Probe()), 0)); }
export function thirdParty(callback: (create: () => Probe) => void) { callback(() => new Probe()); }
export default class First extends NSEApplication { readonly early = new Probe(); }
