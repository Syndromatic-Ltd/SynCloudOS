# ContactsFX

ContactsFX (`CNFX`) provides `CNFXContactStore`, immutable `CNFXContact` selections and `CNFXContactPickerViewController` through the browser's Contact Picker API. It returns only what the user shares for that request; it does not enumerate or modify the address book.

Declare `contacts.select` in the app's `Info.ts` permissions. Mounted declaration and policy checks run before each picker request and before delivering its selection. The browser additionally enforces secure-context, user-activation, top-level-context and platform support requirements.

```ts
import { useContacts } from "@syndromatic/syncloudos/sdk";

const contacts = useContacts(); // In a component; passive until requested.

// In a user action handler:
if (contacts.getCapabilities().contactPicker) {
  const selected = await contacts.requestAccess({
    properties: ["name", "email"],
    multiple: true,
  });
  for (const contact of selected) {
    console.log(contact.displayNames, contact.emailAddresses);
  }
}
```

For an explicitly owned picker, construct `new CNFXContactPickerViewController(store, requestOptions)` and call `present()` from a user action. The constructor copies its request fields and is passive. `present()` forwards to the store's `requestAccess`; `dispose()` aborts the controller's pending request. This adapts the native `CNContactPickerViewController` lifetime to a browser-owned chooser: it renders no NSE view and is not a native `UIViewController`. The underlying store remains reusable after the controller is disposed.

`CNFXContactsClient.getCapabilities()` and `createContactStore(signal?)` are passive. The store also exposes `getCapabilities()` and `getAuthorizationStatus()`. A supported live browser store reports `prompt` before and after selection, because each access requires another user selection. It never reports a lasting `granted` state. An absent, insecure or disposed store reports `unavailable`; mounted declaration or host-policy denial reports `denied`. The shared vocabulary is `unknown`, `prompt`, `granted`, `denied`, `unavailable`.

`requestAccess({ properties?, multiple?, signal? })` invokes the system picker immediately, preserving the browser's user-activation boundary. Properties are `name`, `email` and `tel`; all three are requested by default, and `multiple` defaults to `false`. Unsupported fields are not silently substituted. Empty property requests are rejected. Fields outside the requested set are discarded even if an adapter returns them. Only one selection may be pending per store. Browser rejection, cancellation and security failures retain their DOMException names; denying or cancelling one picker does not create a persistent framework permission grant or denial.

The returned array, each `CNFXContact`, and its `displayNames`, `emailAddresses` and `phoneNumbers` arrays are frozen copies. Missing fields are empty arrays. Web picker results have no stable contact identity, native labels or address-book change tracking. This initial surface does not include addresses or contact icons. It does not expose full-contact enumeration, editing, background access or synchronization.

The component hook owns its store in a layout effect and disposes it on unmount. Aborted renders do not acquire a store, and StrictMode replay releases the previous owner. Component/session cancellation and request abort reject pending app work and suppress late browser results. The web API has no programmatic picker-dismiss operation: cancellation cannot close an already displayed system picker. The browser may keep that dialog visible until the user closes it.

Host integration injects `BrowserContactsAdapter({ isSecureContext, browserNavigator })`, where `browserNavigator.contacts.select` is the host API. The adapter never obtains a global navigator or window. Capability presence is a feature check, not a promise that the current browser context permits a picker. Contact Picker support is limited across browsers and devices. Interactive device testing is required to verify real picker behavior; deterministic tests verify passive queries, immutable selection copies, policy checks and late-result suppression.
