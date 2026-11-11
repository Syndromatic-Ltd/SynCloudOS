import { expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { CNFXContactPickerViewController as BasePicker } from "@syndromatic/syncloudos/fx/contacts";
import Application, { afterAwait, afterTimer, thirdParty, CNFXContactStore, CNFXContactPickerViewController, CNFXContact, CNFXError, NSEViewController } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
const ticks=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
it("compiled Contacts app retains attribution after await/timer/callback and runs selection, policy replacement and teardown",async()=>{
 const jobs:(()=>void)[]=[];vi.stubGlobal("scheduler",{postTask:(job:()=>void)=>{jobs.push(job);return Promise.resolve();}});const flush=()=>{while(jobs.length)jobs.shift()!();};
 const host=createSynWareTestHost({application:Application,manifest:{schemaVersion:1,...info},document});const presenter=new NSEViewController();
 try{expect(()=>new BasePicker()).toThrow(/application bundle/);expect(()=>new CNFXContactPickerViewController()).toThrow(CNFXError);await host.render();host.adapters.permissions.allow();host.adapters.policy.allow();host.adapters.contacts.allow();host.adapters.contacts.setSelectedName("Ada Lovelace");expect("contacts" in host.appContext).toBe(false);
 const completed=vi.fn();new CNFXContactStore().requestAccess("contacts",completed);flush();expect(completed).toHaveBeenCalledWith(false,expect.objectContaining({code:"featureNotAvailable"}));expect(host.adapters.contacts.calls()).toHaveLength(0);
 const first=await afterAwait(),second=await afterTimer();let third!:CNFXContactPickerViewController;await new Promise<void>(done=>queueMicrotask(()=>thirdParty(create=>{third=create();done();})));
 const completedPickerDisposals:ReturnType<typeof vi.spyOn>[]=[];
 const received:CNFXContact[]=[];for(const picker of [first,second,third]){completedPickerDisposals.push(vi.spyOn(picker,"dispose"));expect(picker).toBeInstanceOf(BasePicker);expect(picker).toBeInstanceOf(CNFXContactPickerViewController);picker.delegate={contactPickerDidSelectContact(sender,contact){expect(sender).toBe(picker);received.push(contact);}};presenter.presentAsSheet(picker);await ticks();flush();}
 expect(received).toHaveLength(3);expect(received[0]).toBeInstanceOf(CNFXContact);expect(received[0].givenName).toBe("Ada Lovelace");expect(CNFXContactStore.authorizationStatus("contacts")).toBe("limited");expect(()=>new CNFXContactStore().unifiedContacts(null,[])).toThrow(CNFXError);
 const stale=await afterAwait();stale.delegate={contactPickerDidSelectContact(_sender,contact){received.push(contact);}};presenter.presentAsSheet(stale);await ticks();host.adapters.permissions.deny();host.adapters.permissions.allow();flush();expect(received).toHaveLength(3);expect(stale.isDisposed).toBe(true);
 const fresh=await afterAwait();fresh.delegate={contactPickerDidSelectContact(_sender,contact){received.push(contact);}};presenter.presentAsSheet(fresh);await ticks();flush();expect(received).toHaveLength(4);
 const ending=await afterAwait();ending.delegate={contactPickerDidSelectContact(_sender,contact){received.push(contact);}};presenter.presentAsSheet(ending);await ticks();await host.dispose();flush();expect(ending.isDisposed).toBe(true);expect(received).toHaveLength(4);for(const dispose of completedPickerDisposals)expect(dispose).not.toHaveBeenCalled();
 }finally{presenter.dispose();await host.dispose();flush();vi.unstubAllGlobals();}
});
it("native denial overrides the entitled app's saved selection consent",async()=>{
 const host=createSynWareTestHost({application:Application,manifest:{schemaVersion:1,...info},document});const presenter=new NSEViewController();
 try{await host.render();host.adapters.permissions.allow();host.adapters.policy.allow();host.adapters.contacts.allow();presenter.presentAsSheet(await afterAwait());await ticks();host.adapters.contacts.deny();const selected=vi.fn();const next=await afterAwait();next.delegate={contactPickerDidSelectContact:selected};presenter.presentAsSheet(next);await ticks();expect(CNFXContactStore.authorizationStatus("contacts")).toBe("denied");expect(selected).not.toHaveBeenCalled();expect(next.isDisposed).toBe(true);}finally{presenter.dispose();await host.dispose();}
});
