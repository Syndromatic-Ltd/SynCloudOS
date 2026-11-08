import { expect, it } from "vitest";
import * as C from "../../../src/FX/ContactsFX/public";
it("exports actual Contacts classes, Apple enums and keys without legacy picker factories",()=>{
 for(const name of ["CNFXContactStore","CNFXMutableContact","CNFXContact","CNFXLabeledValue","CNFXPhoneNumber","CNFXPostalAddress","CNFXContactFormatter","CNFXContactFetchRequest","CNFXContactPickerViewController","CNFXError"])expect(typeof (C as Record<string,unknown>)[name]).toBe("function");
 expect(C.CNFXAuthorizationStatus).toEqual({notDetermined:"notDetermined",restricted:"restricted",denied:"denied",authorized:"authorized",limited:"limited"});
 expect(C.CNFXContactGivenNameKey).toBe("givenName");
});
it("uses immutable labelled values and mutable copies without descriptor constructors",()=>{
 const contact=new C.CNFXMutableContact();contact.givenName="Ada";contact.familyName="Lovelace";
 contact.emailAddresses=[new C.CNFXLabeledValue(C.CNFXLabelWork,"ada@example.test")];
 contact.phoneNumbers=[new C.CNFXLabeledValue(C.CNFXLabelPhoneNumberMobile,new C.CNFXPhoneNumber("+44 123"))];
 const immutable=contact.copy();contact.givenName="Changed";
 expect(immutable).toBeInstanceOf(C.CNFXContact);expect(immutable.givenName).toBe("Ada");expect(immutable.identifier).toBe(contact.identifier);expect(immutable.emailAddresses[0].label).toBe(C.CNFXLabelWork);expect(Object.isFrozen(immutable.emailAddresses)).toBe(true);
 const copy=immutable.mutableCopy();copy.familyName="Byron";expect(immutable.familyName).toBe("Lovelace");expect(copy.identifier).toBe(immutable.identifier);
 expect(C.CNFXContactFormatter.string(immutable,"fullName")).toBe("Ada Lovelace");expect(immutable.isKeyAvailable(C.CNFXContactGivenNameKey)).toBe(true);expect(immutable.isKeyAvailable("unknown")).toBe(false);
 expect(new C.CNFXContactFetchRequest([C.CNFXContactGivenNameKey]).keysToFetch).toEqual([C.CNFXContactGivenNameKey]);
});

it("preserves labeled-value identity when replacing labels/values and validates immutable values",()=>{const first=new C.CNFXLabeledValue(C.CNFXLabelHome,"a");const second=first.settingLabel(C.CNFXLabelWork);const third=second.settingValue("b");const both=first.settingLabelValue(null,"c");expect(second.identifier).toBe(first.identifier);expect(third.identifier).toBe(first.identifier);expect(both.identifier).toBe(first.identifier);expect(first.value).toBe("a");expect(third.value).toBe("b");expect(Object.isFrozen(both)).toBe(true);expect(()=>new C.CNFXPhoneNumber(4 as never)).toThrow();const contact=new C.CNFXMutableContact();expect(()=>{contact.phoneNumbers=[new C.CNFXLabeledValue(null,"bad")] as never;}).toThrow();});
it("retains real fetch descriptors and declares unavailable phonetic formatting explicitly",()=>{const keys=[C.CNFXContactGivenNameKey];const request=new C.CNFXContactFetchRequest(keys);keys.push(C.CNFXContactFamilyNameKey);expect(request.keysToFetch).toEqual([C.CNFXContactGivenNameKey]);request.keysToFetch=[C.CNFXContactFormatter.descriptorForRequiredKeys("fullName")];expect(request.mutableObjects).toBe(false);expect(request.unifyResults).toBe(true);expect(request.sortOrder).toBe("none");expect(()=>new C.CNFXContactFetchRequest([{}])).toThrow(C.CNFXError);const format=new C.CNFXContactFormatter();format.style="phoneticFullName";expect(()=>format.string(new C.CNFXContact())).toThrow(C.CNFXError);});
