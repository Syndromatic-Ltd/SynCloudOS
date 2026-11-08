import {createSynCloudOSHostContribution} from "@syndromatic/syncloudos/browser";
import {createDeterministicRuntimeEnvironment,type SynWareTestHost} from "@syndromatic/syncloudos/sdk/testing";
import {SCOS,useContacts,type SynWareContextValue} from "@syndromatic/syncloudos/sdk";
import {SCOS as RootSCOS,NSEViewController} from "@syndromatic/syncloudos";
import {CNFXContact,CNFXMutableContact,CNFXContactStore,CNFXContactPickerViewController,CNFXContactFetchRequest,CNFXContactFormatter,CNFXLabeledValue,CNFXPhoneNumber,CNFXPostalAddress,CNFXError,CNFXContactGivenNameKey,CNFXLabelWork,type CNFXContactPickerDelegate,type CNFXKeyDescriptor} from "@syndromatic/syncloudos/fx/contacts";
createSynCloudOSHostContribution("contacts-boundary","installed-test",environment=>{
 // @ts-expect-error Private adapter is absent from inferred browser environment.
 environment.contacts;
 // @ts-expect-error No indexed adapter type extraction.
 type Adapter=typeof environment["contacts"];
 return {};
});
const testing=createDeterministicRuntimeEnvironment();testing.adapters.contacts.allow();testing.adapters.contacts.setSelectedName("Ada");
// @ts-expect-error Testing exposes controls only.
testing.environment.contacts;
// @ts-expect-error No indexed adapter type extraction.
type Adapter=typeof testing.environment["contacts"];
declare const host:SynWareTestHost;
// @ts-expect-error Test controls cannot perform native selections.
host.adapters.contacts.select();
// @ts-expect-error Removed app factory.
host.appContext.contacts;
// @ts-expect-error Removed context factory.
type ContextContacts=SynWareContextValue["contacts"];
// @ts-expect-error Removed SCOS factory.
SCOS.contacts;
// @ts-expect-error Removed root SCOS factory.
RootSCOS.contacts;
const store:CNFXContactStore=useContacts();store.requestAccess("contacts",(granted,error)=>{const typed:CNFXError|null=error;void[granted,typed];});
const keys:CNFXKeyDescriptor[]=[CNFXContactGivenNameKey,CNFXContactFormatter.descriptorForRequiredKeys("fullName")];const fetch=new CNFXContactFetchRequest(keys);store.unifiedContacts(null,keys);store.enumerateContacts(fetch,(contact,stop)=>{const typed:CNFXContact=contact;stop.value=true;void typed;});
const mutable=new CNFXMutableContact();mutable.givenName="Ada";mutable.emailAddresses=[new CNFXLabeledValue(CNFXLabelWork,"ada@example.test")];mutable.phoneNumbers=[new CNFXLabeledValue(null,new CNFXPhoneNumber("123"))];mutable.postalAddresses=[new CNFXLabeledValue(null,new CNFXPostalAddress())];const immutable:CNFXContact=mutable.copy();immutable.mutableCopy();
const picker=new CNFXContactPickerViewController();const delegate:CNFXContactPickerDelegate={contactPickerDidSelectContact(sender,contact){const typed:CNFXContactPickerViewController=sender;void[typed,contact];},contactPickerDidCancel(sender){void sender;}};picker.delegate=delegate;picker.displayedPropertyKeys=[CNFXContactGivenNameKey];new NSEViewController().presentAsSheet(picker);
// @ts-expect-error No browser options in Apple's initializer.
new CNFXContactPickerViewController(store,{multiple:true});
// @ts-expect-error No browser selection method on the store.
store.requestAccess({properties:["name"]});
// @ts-expect-error Removed capabilities API.
store.getCapabilities();
// @ts-expect-error Removed browser descriptors.
new CNFXContact({displayNames:["Ada"]});
// @ts-expect-error No invented inverse-name formatter.
CNFXContactFormatter.contactFromString("Ada");
// @ts-expect-error Removed client.
import type {CNFXContactsClient} from "@syndromatic/syncloudos/fx/contacts";
// @ts-expect-error No private ports.
import {contactsPortFor} from "@syndromatic/syncloudos/fx/contacts";
