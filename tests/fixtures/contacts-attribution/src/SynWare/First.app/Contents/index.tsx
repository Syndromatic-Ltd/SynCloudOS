import { NSEApplication, NSEViewController } from "@syndromatic/syncloudos";
import { CNFXContactStore, CNFXContactPickerViewController, CNFXContact, CNFXError } from "@syndromatic/syncloudos/fx/contacts";
export { CNFXContactStore, CNFXContactPickerViewController, CNFXContact, CNFXError, NSEViewController };
export async function afterAwait() { await Promise.resolve(); return new CNFXContactPickerViewController(); }
export function afterTimer() { return new Promise<CNFXContactPickerViewController>(resolve => setTimeout(() => resolve(new CNFXContactPickerViewController()), 0)); }
export function thirdParty(callback: (create: () => CNFXContactPickerViewController) => void) { callback(() => new CNFXContactPickerViewController()); }
export default class ContactsApplication extends NSEApplication {}
