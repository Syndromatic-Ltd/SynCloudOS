/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { expect, it, vi } from "vitest";
import { BrowserContactsAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter";
import { CNFXContact, CNFXLabeledValue } from "../../../src/FX/ContactsFX/public";
const signal=()=>new AbortController().signal;
it("inspects browser availability without selecting or claiming a database grant",()=>{const select=vi.fn();const adapter=new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select}}});expect(adapter.available).toBe(true);expect(select).not.toHaveBeenCalled();expect("getCapabilities" in adapter).toBe(false);});
it("copies only requested name fields without guessing family names or labels",async()=>{const names=["Ada Lovelace"];const select=vi.fn(async()=>[{name:names,email:["hidden@example.test"]}]);const adapter=new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select}}});const contacts=await adapter.select(["givenName"],false,signal());names[0]="changed";expect(contacts[0]).toBeInstanceOf(CNFXContact);expect(contacts[0].givenName).toBe("Ada Lovelace");expect(contacts[0].familyName).toBe("");expect(contacts[0].emailAddresses).toEqual([]);expect(Object.isFrozen(contacts)).toBe(true);expect(Object.isFrozen(contacts[0])).toBe(true);expect(contacts[0].isKeyAvailable("emailAddresses")).toBe(false);});
it("creates immutable labelled email and phone values",async()=>{const adapter=new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select:async()=>[{email:["ada@example.test"],tel:["123"]}]}}});const [contact]=await adapter.select(["emailAddresses","phoneNumbers"],true,signal());expect(contact.emailAddresses[0]).toBeInstanceOf(CNFXLabeledValue);expect(contact.emailAddresses[0].label).toBeNull();expect(contact.phoneNumbers[0].value.stringValue).toBe("123");expect(Object.isFrozen(contact.phoneNumbers)).toBe(true);});
it.each([false,true])("does not select in insecure/absent contexts (%s)",secure=>{const select=vi.fn();const adapter=new BrowserContactsAdapter({isSecureContext:secure,browserNavigator:secure?{}:{contacts:{select}}});expect(adapter.available).toBe(false);expect(()=>adapter.select(["givenName"],false,signal())).toThrow();expect(select).not.toHaveBeenCalled();});
it.each([[],["familyName"],["unknown"]])("rejects unavailable keys %j before native access",keys=>{const select=vi.fn();const adapter=new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select}}});expect(()=>adapter.select(keys,false,signal())).toThrow();expect(select).not.toHaveBeenCalled();});
it("keeps native denial unnormalized for the shared privacy store",async()=>{const denial=new DOMException("denied","NotAllowedError");const adapter=new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select:async()=>{throw denial;}}}});await expect(adapter.select(["givenName"],false,signal())).rejects.toBe(denial);});
it("aborts immediately, drops the old result after replacement and rejects already-aborted calls",async()=>{let finish!:(value:{name:string[]}[])=>void;const select=vi.fn().mockImplementationOnce(()=>new Promise(done=>{finish=done;})).mockResolvedValueOnce([{name:["fresh"]}]);const adapter=new BrowserContactsAdapter({isSecureContext:true,browserNavigator:{contacts:{select}}});const owner=new AbortController();const pending=adapter.select(["givenName"],false,owner.signal);owner.abort();await expect(pending).rejects.toMatchObject({name:"AbortError"});const fresh=await adapter.select(["givenName"],false,signal());finish([{name:["stale"]}]);expect(fresh[0].givenName).toBe("fresh");expect(()=>adapter.select(["givenName"],false,owner.signal)).toThrow();expect(select).toHaveBeenCalledTimes(2);});
