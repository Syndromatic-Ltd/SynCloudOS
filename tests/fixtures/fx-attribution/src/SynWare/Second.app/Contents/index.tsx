import { NSEApplication } from "@syndromatic/syncloudos";
import { MFXAttitude as Probe } from "@syndromatic/syncloudos/fx/motion";
export { Probe };
export default class Second extends NSEApplication { readonly early = new Probe(); }
