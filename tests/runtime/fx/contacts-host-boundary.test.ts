// @vitest-environment jsdom
import {expect,it} from "vitest";
import {createDeterministicRuntimeEnvironment} from "../../../src/SynCloudOS/AppSDK/testing";
import {createBrowserRuntimeEnvironment} from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import {BrowserContactsAdapter} from "../../../src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter";
import {createSynCloudOSHostContribution,prepareSynCloudOSHostContributions} from "../../../src/SynCloudOS/HostContributions/hostContribution";
import {contactsAdapterFor} from "../../../src/FX/ContactsFX/internal/contactsPort";
it("withholds Contacts adapters from host contributions, browser environments and test controls",async()=>{const testing=createDeterministicRuntimeEnvironment();try{expect("contacts" in testing.environment).toBe(false);expect("select" in testing.adapters.contacts).toBe(false);expect(contactsAdapterFor(testing.environment)).toBeDefined();let called=false;await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("contacts-test","test",environment=>{called=true;expect("contacts" in environment).toBe(false);return{};})],testing.environment);expect(called).toBe(true);const browser=createBrowserRuntimeEnvironment();expect("contacts" in browser).toBe(false);expect(contactsAdapterFor(browser)).toBeInstanceOf(BrowserContactsAdapter);}finally{testing.dispose();}});
