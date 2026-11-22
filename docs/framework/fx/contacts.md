# ContactsFX

ContactsFX lets the user pick one or more contacts and hand your app their names, email addresses, phone numbers and postal addresses. In a browser it runs on the Contact Picker API, so you get exactly what the user chose and nothing more: there is no address-book database to query.

Import the `CNFX` classes from `@syndromatic/syncloudos/fx/contacts` inside a plugin-built `.app`. Constructors do nothing until you use the object. The plugin supplies per-app classes that stay attributed after an `await`, a timer or a third-party callback. Constructing the unattributed base class throws an error explaining that it needs an application bundle, and an object never moves to a new app session once its own has ended.

Declare `contacts.select` in the application's entitlements. Before any native access, and again at delivery, the mounted service checks the captured entitlement, host policy, shared app consent and the app's lifetime. A browser refusal overrides saved app consent, and an operation that was revoked stays invalid after consent is restored.

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

## The contact picker

`CNFXContactPickerViewController` is an `NSEViewController`, so you present it the usual way: `presentAsSheet`, `presentAsModalWindow`, `presentAsPopover` or a custom `present`. Presenting it starts the browser's chooser synchronously, after the authorisation checks, and keeps the normal parent and presented-controller ownership. The host does not draw its own sheet over the browser's dialogue. If shared app consent needs an asynchronous host prompt, that prompt finishes before the browser call, and the browser may then ask the user to click again. ContactsFX never skips consent to keep the user activation alive.

By default the picker shows given name, email addresses and phone numbers. Add `CNFXContactPostalAddressesKey` to `displayedPropertyKeys` to ask for postal addresses.

Implement `contactPickerDidSelectContacts(picker, contacts)` to allow multiple selection. Otherwise `contactPickerDidSelectContact(picker, contact)` receives a single contact. Delegate calls are queued on the app's main Dispatch queue. An empty selection, a cancelled chooser and ordinary native failures (while the app is still authorised) all arrive as `contactPickerDidCancel`. Losing privacy consent, or the app shutting down, suppresses callbacks entirely. Failures in the synchronous checks before the chooser opens throw `CNFXError`. There is no picker error delegate.

Dismissing or disposing of the picker ends its pending work. The browser's Contact Picker cannot be cancelled from script, so its dialogue may stay on screen, but late values never reach your app. Revoking privacy, losing policy, tearing down the app or removing it from the registry also ends the presentation. An ended picker cannot be reused; create a new one.

## The contact store

`new CNFXContactStore()` gives you a store. In a component, `useContacts()` from `@syndromatic/syncloudos/sdk` returns one bound to the mounted app session; it survives React StrictMode's effect replay and ends queued work when the component unmounts.

`CNFXContactStore.authorizationStatus(CNFXEntityType.contacts)` returns `notDetermined`, `restricted`, `denied`, `authorized` or `limited`. In a browser:

- Before the user has picked anyone, the status is `notDetermined`. After a successful pick it is `limited` for the rest of that app lifetime.
- Missing or insecure browser support reports `restricted`.
- A refusal by entitlement, policy or app consent reports `denied`.
- The browser adapter never reports `authorized`, because a pick never grants access to an address book.

`store.requestAccess(entityType, completion)` never opens a picker. Its completion runs asynchronously on the app's main queue with `false` and a `CNFXError` whose `code` is `featureNotAvailable`, or `authorizationDenied` when access was refused. Picking contacts cannot be turned into database access this way. Ended or revoked stores drop queued completions.

`unifiedContacts(predicate, keysToFetch)` and `enumerateContacts(fetchRequest, block)` are synchronous. In a browser they throw a `CNFXError` with code `authorizationDenied` when access is denied, or `featureNotAvailable` because there is no database. They never return earlier picker selections as if they were a database. Predicates are Foundation `NSEPredicate<CNFXContact>` values. The enumeration block's stop flag is a mutable `{ value: boolean }` box, though the browser never calls the block.

`new CNFXContactFetchRequest(keysToFetch)` has `keysToFetch`, `predicate`, `mutableObjects`, `unifyResults` and `sortOrder`. Key strings and `CNFXContactFormatter.descriptorForRequiredKeys(style)` both satisfy the `CNFXKeyDescriptor` marker type. An unknown descriptor fails with code `unauthorizedKeys`.

## Contact values

`CNFXContact` provides `identifier`, `contactType`, `givenName`, `familyName`, `organizationName`, `emailAddresses`, `phoneNumbers`, `postalAddresses`, `isKeyAvailable`, `copy` and `mutableCopy`. `CNFXMutableContact` makes everything except the identifier writable, but only locally; nothing is saved to the device. Contact and labelled-value identifiers are strings. In a browser they are generated for the snapshot you picked and stay the same across copies, but they do not identify any record on the device.

Email, phone and postal fields are arrays of `CNFXLabeledValue`. Each has an `identifier`, `label` and `value`, and the copy helpers `settingLabel`, `settingValue` and `settingLabelValue`. The browser picker provides no labels, so `label` is `null`; ContactsFX does not guess "home" or "work". The label constants (`CNFXLabelHome`, `CNFXLabelWork`, `CNFXLabelOther` and the `CNFXLabelPhoneNumber…` set) are exported for values you create. `CNFXPhoneNumber.stringValue` keeps the number exactly as supplied.

Browsers give one display name with no reliable split into parts. ContactsFX stores the first name the user picked, whole, in `givenName`, and leaves `familyName` empty and unavailable. Fields you did not request are discarded, and `isKeyAvailable(key)` tells a fetched empty value apart from one that was never fetched.

`CNFXContactFormatter.string(contact, "fullName")`, and the instance method `string(contact)`, join given and family names in that order, or return the organisation name for an organisation contact. This is a fixed subset; it does not reorder names by locale. The `phoneticFullName` style exists but fails with `featureNotAvailable`, as no phonetic fields are available.

`CNFXPostalAddress` exposes `street`, `subLocality`, `city`, `subAdministrativeArea`, `state`, `postalCode`, `country` and `isoCountryCode`. Browser address lines are joined with newlines into `street`; dependent locality, city, region, postal code and ISO country code map directly. Browsers supply neither a localised country name nor a sub-administrative area, so those stay empty. Addresses and every returned selection array are immutable snapshots, and no raw browser record type is public.

## What is not covered

ContactsFX does not save to a contact database, track changes, read or write vCards, select individual contact properties, provide contact images or enumerate contacts persistently. Deterministic tests cover the adapter, NSE presentation, privacy and plugin paths. Browser support for the Contact Picker is limited, and the real native dialogs still need testing on physical devices.
