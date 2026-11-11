import {NSEApplication} from "@syndromatic/syncloudos";
import {BTFXCentralManager,BTFXManager,BTFXPeripheral,BTFXUUID,BTFXError,type BTFXCentralManagerDelegate} from "@syndromatic/syncloudos/fx/bluetooth";
export {BTFXCentralManager,BTFXManager,BTFXPeripheral,BTFXUUID,BTFXError};
export async function afterAwait(delegate:BTFXCentralManagerDelegate){await Promise.resolve();return new BTFXCentralManager(delegate);}
export function afterTimer(delegate:BTFXCentralManagerDelegate){return new Promise<BTFXCentralManager>(resolve=>setTimeout(()=>resolve(new BTFXCentralManager(delegate)),0));}
export function thirdParty(delegate:BTFXCentralManagerDelegate,callback:(create:()=>BTFXCentralManager)=>void){callback(()=>new BTFXCentralManager(delegate));}
export default class BluetoothApplication extends NSEApplication {}
