import {createSynCloudOSHostContribution} from "@syndromatic/syncloudos/browser";
import {createDeterministicRuntimeEnvironment} from "@syndromatic/syncloudos/sdk/testing";
import {SCOS as RootSCOS} from "@syndromatic/syncloudos";
import {SCOS,useBluetooth,useSCOS,type SynWareContextValue} from "@syndromatic/syncloudos/sdk";
import {BTFXManager,BTFXManagerState,BTFXManagerAuthorization,BTFXCentralManager,BTFXPeripheral,BTFXPeripheralState,BTFXAttribute,BTFXService,BTFXCharacteristic,BTFXCharacteristicProperties,BTFXCharacteristicWriteType,BTFXDescriptor,BTFXUUID,BTFXError,type BTFXCentralManagerDelegate,type BTFXPeripheralDelegate} from "@syndromatic/syncloudos/fx/bluetooth";
import {NSEData,NSEUUID} from "@syndromatic/syncloudos/foundation";
import {DFXQueue} from "@syndromatic/syncloudos/fx/dispatch";
const delegate:BTFXCentralManagerDelegate={centralManagerDidUpdateState(sender){const central:BTFXCentralManager=sender;void central;},centralManagerDidDiscoverPeripheral(sender,p,advertisements,rssi){const id:NSEUUID=p.identifier;void [id,advertisements,rssi];sender.connect(p);},centralManagerDidFailToConnectPeripheral(sender,p,error){const e:BTFXError|null=error;void[sender,p,e];}};
const central=new BTFXCentralManager(delegate,DFXQueue.main,null);const manager:BTFXManager=central;const state:BTFXManagerState=manager.state;const auth:BTFXManagerAuthorization=BTFXManager.authorization;const hook:BTFXCentralManager=useBluetooth(delegate,null,null);central.scanForPeripherals([new BTFXUUID("180F")]);central.stopScan();const known:readonly BTFXPeripheral[]=central.retrievePeripherals([new NSEUUID()]);void [known,state,auth,hook];
const peripheralDelegate:BTFXPeripheralDelegate={peripheralDidDiscoverServices(p,error){const s:BTFXService=p.services![0]!;p.discoverCharacteristics(null,s);void error;},peripheralDidDiscoverCharacteristicsForService(p,s,error){const c:BTFXCharacteristic=s.characteristics![0]!;const attribute:BTFXAttribute=c;const properties:BTFXCharacteristicProperties=c.properties;const kind:BTFXCharacteristicWriteType="withResponse";const result:void=p.readValue(c);p.writeValue(NSEData.from(new Uint8Array([1])),c,kind);p.setNotifyValue(true,c);p.discoverDescriptors(c);void [attribute,properties,result,error];},peripheralDidDiscoverDescriptorsForCharacteristic(p,c,error){const d:BTFXDescriptor=c.descriptors![0]!;p.readValue(d);p.writeValue(NSEData.from(new Uint8Array([1])),d);void error;},peripheralDidReadRSSI(p,rssi,error){const state:BTFXPeripheralState=p.state;void [state,rssi,error];}};void [peripheralDelegate,BTFXCharacteristicProperties.read];
// @ts-expect-error No browser client remains on SCOS.
useSCOS().bluetooth;
// @ts-expect-error No root SCOS client.
RootSCOS.bluetooth;
// @ts-expect-error No SDK SCOS client.
SCOS.bluetooth;
// @ts-expect-error No context transport.
type Hidden=SynWareContextValue["bluetooth"];
createSynCloudOSHostContribution("bt-boundary","installed-test",environment=>{
 // @ts-expect-error No environment transport.
 environment.bluetooth;
 return {};
});
// @ts-expect-error No test environment transport.
createDeterministicRuntimeEnvironment().environment.bluetooth;
// @ts-expect-error Narrow controls cannot construct native sessions.
createDeterministicRuntimeEnvironment().adapters.bluetooth.connect();
// @ts-expect-error Deleted public factory.
central.createCentralManager();
// @ts-expect-error Deleted capability object.
central.getCapabilities();
// @ts-expect-error Queue occupies the second Apple slot.
new BTFXCentralManager(delegate,{acceptAllDevices:true});
// @ts-expect-error UUIDs are Foundation values, not browser IDs.
central.retrievePeripherals(["opaque-device"]);
// @ts-expect-error Old client export deleted.
import type {BTFXBluetoothClient} from "@syndromatic/syncloudos/fx/bluetooth";
// @ts-expect-error Old status export deleted.
import type {BTFXAuthorizationStatus} from "@syndromatic/syncloudos/fx/bluetooth";
// @ts-expect-error Old chooser request export deleted.
import type {BTFXPeripheralRequest} from "@syndromatic/syncloudos/fx/bluetooth";
// @ts-expect-error Old capabilities export deleted.
import type {BTFXCapabilities} from "@syndromatic/syncloudos/fx/bluetooth";
