# ContactsFX

ContactsFX follows Contacts and ContactsUI, using the `CNFX` prefix. Import the classes from `@syndromatic/syncloudos/fx/contacts` inside a plugin-built `.app`. Constructors remain passive and keep their Apple argument lists. The plugin supplies stable per-app classes, including after an `await`, timer or third-party callback. An unattributed base constructor reports that it requires an application bundle; a selected app session never rebinds after ending.

Declare `contacts.select` in the application's entitlements. The mounted service checks the captured entitlement, host policy, shared app consent, and selected app lifetime before native access and at delivery. A browser refusal overrides saved app consent. Revoked operations remain invalid after consent is restored.

```ts
import {
  CNFXContactPickerViewController,
  CNFXContactGivenNameKey,
  CNFXContactEmailAddressesKey,
} from "@syndromatic/syncloudos/fx/contacts";

// In an NSEViewController action handler:
const picker = new CNFXContactPickerViewController();
picker.displayedPropertyKeys = [CNFXContactGivenNameKey, CNFXContactEmailAddressesKey];
picker.delegate = {
  contactPickerDidSelectContact(sender, contact) {
    console.log(contact.givenName, contact.emailAddresses.map(item => item.value));
  },
  contactPickerDidCancel(sender) {
    console.log("Selection cancelled");
  },
};
this.presentAsSheet(picker);
```

`CNFXContactPickerViewController` is a real `NSEViewController`. Use its presenter's existing `presentAsSheet`, `presentAsModalWindow`, `presentAsPopover`, or custom `present` method. The existing NSE path starts the native chooser synchronously, after authorization checks, and retains ordinary parent/presented ownership. The host renders no duplicate sheet over browser-owned UI. If shared app consent needs an asynchronous host prompt, that consent completes before the browser call; the browser may require another user action afterward. The framework never bypasses consent to preserve transient activation.

The default displayed keys are given name, email addresses and phone numbers. Postal addresses can be requested with `CNFXContactPostalAddressesKey`. Implement `contactPickerDidSelectContacts(picker, contacts)` to enable multiple selection; otherwise `contactPickerDidSelectContact(picker, contact)` receives a single selection. Delegates are queued on the selected application's main Dispatch queue. Empty selection and native cancellation use `contactPickerDidCancel`. Ordinary native failures also close through cancellation where the app remains authorized; privacy loss or app teardown suppresses callbacks entirely. Synchronous preflight failures throw `CNFXError`. ContactsUI has no invented picker-error delegate.

Dismissing or disposing the picker ends its pending work. Browser Contact Picker has no cancellable native session handle: the browser dialog may remain visible, but its late values cannot reach the application. Privacy revocation, policy loss, app teardown and registry removal also end presentation. Reusing an ended picker is not supported; create a new one.

## Store authorization and database limits

`new CNFXContactStore()` and `useContacts()` return actual Apple-shaped stores. The hook uses the exact mounted app session, tolerates React StrictMode effect replay, and ends queued work on true unmount.

`CNFXContactStore.authorizationStatus(CNFXEntityType.contacts)` returns Apple's cases: `notDetermined`, `restricted`, `denied`, `authorized`, or `limited`. The current browser service reports `notDetermined` before a successful selection and `limited` afterward within that app lifetime; a picker selection never grants a persistent address-book database. Missing or insecure browser support reports `restricted`; app entitlement, policy, or consent refusal reports `denied`. The web adapter never reports database `authorized`.

`store.requestAccess(entityType, completion)` retains Apple's authorization-completion shape and never opens a picker. The completion runs asynchronously on the selected app's main queue with `false` and a `CNFXError` (`featureNotAvailable`, or `authorizationDenied` when access is refused). This method cannot manufacture database authorization from selected-contact consent. Ended or revoked instances drop queued completions.

`unifiedContacts(predicate, keysToFetch)` and `enumerateContacts(fetchRequest, block)` remain synchronous members. The current web service throws `CNFXError.authorizationDenied` when denied and `CNFXError.featureNotAvailable` when the required database is unavailable. It never returns cached picker selections as a database. `NSEPredicate<CNFXContact>` is the existing Foundation predicate representation; enumeration's stop pointer uses a mutable `{ value: boolean }` box, although the browser never invokes that block.

`CNFXContactFetchRequest(keysToFetch)` supports `keysToFetch`, `predicate`, `mutableObjects`, `unifyResults` and `sortOrder`. Key strings and `CNFXContactFormatter.descriptorForRequiredKeys(style)` conform to the marker protocol `CNFXKeyDescriptor`. Unknown descriptors fail with `CNFXError.unauthorizedKeys`. No new Foundation subsystem is required.

## Contact values

`CNFXContact` provides `identifier`, `contactType`, `givenName`, `familyName`, `organizationName`, `emailAddresses`, `phoneNumbers`, `postalAddresses`, `isKeyAvailable`, `copy` and `mutableCopy`. `CNFXMutableContact` makes the non-identifier fields writable locally; it does not persist them to the device. Contact and labeled-value identifiers are strings, matching Apple's NSString identifiers. Browser identifiers are generated for the selected snapshot and remain stable across copies; they cannot identify a device database record.

Email, phone and postal fields are arrays of actual `CNFXLabeledValue` instances. Each carries `identifier`, `label` and `value`, plus `settingLabel`, `settingValue` and `settingLabelValue` copy operations. Native picker data has no labels, so its labels are `null`; no home/work labels are guessed. The exported home/work/other and phone labels correspond to Apple's constants. `CNFXPhoneNumber` keeps `stringValue` without unrequested normalization.

Browser names have no trustworthy decomposition. The first selected display name is preserved whole in `givenName`; `familyName` remains empty and unavailable. There is no inverse formatter. Unrequested fields are discarded. `isKeyAvailable` distinguishes fetched fields from unavailable/default empty values. `CNFXContactFormatter.string(contact, "fullName")` and its instance equivalent format names in given/family order, or organization name for organization contacts. This is a documented subset of Apple's locale-aware formatter. Phonetic formatting is present as a style but fails with `featureNotAvailable` because phonetic fields are not provided.

`CNFXPostalAddress` exposes `street`, `subLocality`, `city`, `subAdministrativeArea`, `state`, `postalCode`, `country`, and `isoCountryCode`. Browser address lines map to a newline-joined street; dependent locality, city, region, postal code and ISO country code map directly. Browser data supplies neither a localized country name nor a sub-administrative area, so those stay empty. Addresses and all returned selection arrays are immutable snapshots. No raw browser record type is public.

No contact database saving, change tracking, vCard serialization, contact-property selection, contact icons, or persistent enumeration is claimed by this reviewed subset. The current browser's limited platform support and real native dialogs still require physical-device acceptance; deterministic tests cover the complete adapter, NSE, privacy and plugin paths.

Primary references: [Contacts](https://developer.apple.com/documentation/contacts), [CNContact](https://developer.apple.com/documentation/contacts/cncontact), [CNContactStore](https://developer.apple.com/documentation/contacts/cncontactstore), [CNContactFetchRequest](https://developer.apple.com/documentation/contacts/cncontactfetchrequest), [CNLabeledValue](https://developer.apple.com/documentation/contacts/cnlabeledvalue), [CNPostalAddress](https://developer.apple.com/documentation/contacts/cnpostaladdress), [CNContactFormatter](https://developer.apple.com/documentation/contacts/cncontactformatter), [CNContactPickerViewController](https://developer.apple.com/documentation/contactsui/cncontactpickerviewcontroller), [CNContactPickerDelegate](https://developer.apple.com/documentation/contactsui/cncontactpickerdelegate).
