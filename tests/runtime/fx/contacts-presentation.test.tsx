// @vitest-environment jsdom
import React from "react";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEViewController } from "../../../src/NSE/Application/NSEViewController";
import { ViewControllerView } from "../../../src/SynCloudOS/AppHosting/applicationHosting";
import { CNFXContactPickerViewController } from "../../../src/FX/ContactsFX/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import { associateContactsPort } from "../../../src/FX/ContactsFX/internal/contactsPort";
import { createMountedContactsPort } from "../../../src/SynCloudOS/AppSDK/mountedContactsPort";
import { BrowserContactsAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter";
import { createPrivacyStore } from "../../../src/SynCloudOS/Privacy";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("initiates the native chooser within the existing presentation action and renders no duplicate NSE sheet",async()=>{
 const owner=new AbortController();let activation=false;const select=vi.fn(()=>{expect(activation).toBe(true);return new Promise<never>(()=>{});});const privacy=createPrivacyStore({runtimeId:"native-ui"});const scope={userId:"u",appId:"com.example.native-ui",service:"contacts"};privacy.setAuthorization(scope,"granted");
 const context={appId:scope.appId,runtimeInfo:{id:"native-ui"},signal:owner.signal} as SynWareContextValue;associateContactsPort(context,createMountedContactsPort(new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select}}}),owner.signal,()=>["contacts.select"],()=>true,privacy.forApplication({...scope,signal:owner.signal})));
 const unregister=registerSCOSAppSession({appId:scope.appId,displayName:"Picker",version:"1",context});const App=bindFXFamily({CNFXContactPickerViewController},scope.appId);let picker!:CNFXContactPickerViewController;
 class Presenter extends NSEViewController{renderView(){return <button onClick={()=>{activation=true;try{picker=new App.CNFXContactPickerViewController();this.presentAsSheet(picker);}finally{activation=false;}}}>Select contacts</button>;}}
 const presenter=new Presenter();try{const ui=render(<ViewControllerView controller={presenter}/>);fireEvent.click(ui.getByText("Select contacts"));expect(select).toHaveBeenCalledOnce();expect(presenter.presentedViewControllers).toEqual([picker]);expect(ui.container.querySelectorAll("[data-nse-view-controller]")).toHaveLength(1);expect(ui.queryByRole("dialog")).toBeNull();act(()=>presenter.dismiss(picker));expect(picker.isDisposed).toBe(true);}finally{presenter.dispose();owner.abort();unregister();privacy.dispose();}
});
it("waits for shared app consent before native selection instead of bypassing it for activation",async()=>{
 const owner=new AbortController();let consent!:(value:boolean)=>void;const privacy=createPrivacyStore({runtimeId:"consent",requestConsent:()=>new Promise(done=>{consent=done;})});const scope={userId:"u",appId:"com.example.consent",service:"contacts"};const select=vi.fn(async()=>[]);const port=createMountedContactsPort(new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select}}}),owner.signal,()=>["contacts.select"],()=>true,privacy.forApplication({...scope,signal:owner.signal}));
 const pending=port.select(["givenName"],false,owner.signal);expect(select).not.toHaveBeenCalled();consent(false);await expect(pending).rejects.toMatchObject({code:"authorizationDenied"});expect(select).not.toHaveBeenCalled();expect(privacy.getSnapshot()[0].decision).toBe("denied");owner.abort();privacy.dispose();
});
