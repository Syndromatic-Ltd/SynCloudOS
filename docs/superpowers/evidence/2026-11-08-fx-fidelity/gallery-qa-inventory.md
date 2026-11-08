# Gallery acceptance inventory

Status: executed; final results and exclusions are recorded below and in gallery-browser-acceptance.json.

The reference is the existing Device & Data Capabilities Gallery, its established NSE controls and the approved Apple API rebuild. No new appearance or artwork is proposed. Capture Chromium at 1440×900 and 390×844 in light and dark after installing the final SDK from the prescribed clean checkout.

| Claim or behaviour | Functional check | Visual state and evidence |
| --- | --- | --- |
| The section opens through the Gallery navigation | Navigate to /__syncloudos/nse-gallery and select Device & Data Capabilities using the rendered control | Initial section in each of the four required viewport/appearance combinations |
| Controls use existing NSE components | Audit the changed JSX and rendered semantic controls; retain the existing video fragment | All groups, labels and controls inspected while scrolling the intended content pane |
| Network exposes the Apple monitor/path flow | Start monitoring, inspect visible status, cancel; exercise a new monitor if the example permits restart | Running and stopped states, with readable wrapping |
| Crypto and compression use Foundation data and real Apple-shaped types | Run each implemented data example and verify its visible round-trip/digest result | Success state and a second invocation |
| Attributed families preserve consent and report browser limits | Exercise every implemented action; observe the visible framework error or permitted result without auto-granting consent | Availability and error states remain readable, including long error text |
| Existing Audio, Location and Video behaviour is preserved | Compare source with baseline; exercise unchanged safe local preview and relevant reversible controls | Existing video stays within the content width; exact VideoExample/raw-line hashes match |
| Phone layout remains usable | Navigate into and out of the section, scroll all groups and use touch-sized NSE controls | No horizontal clipping, overlapped controls or unreachable status; initial and lower-content captures |
| Appearance remains under the existing authority | Select/emulate light and dark through the supported appearance route | Both appearances render their established NSE assets without overrides |
| Sessions end correctly when leaving the section | Start safe passive activity, navigate away and back | No stale status updates, console exceptions or duplicate subscriptions |

Exploratory checks: repeated start/stop or action clicks while work is pending; navigate away during pending work and reopen; resize after a long error has appeared. Native hardware, operating-system permission sheets and payment processing are not claimed by a desktop Chromium run.

Record the final action list, screenshots, console/page errors, viewport/content bounds, hashes and any exclusions in the final browser evidence. Inspect the initial viewport before scrolling, then the whole section. DOM metrics support screenshot inspection and cannot overrule visible clipping.

## Executed coverage

Completed on final SDK5286513/sitec74d8c2: desktop1440x900 and phone390x844, DPR1, light/dark, four primary and six supplementary captures. All13 groups and34 existing NSE buttons inspected; zero horizontal/button overflow. Existing settings/appearance controls and compact Escape dismissal exercised. The canonical NSE scroll marker fixes the demonstrated final-result occlusion. Fourteen final actions and exact status text are in gallery-browser-acceptance.json; repeat data round trips and navigation cleanup also passed.

Hardware exclusions: Bluetooth chooser invoked without selecting/pairing, so connect/read/write/notify use the accepted test-port flow proof. Native Contacts chooser, payment transport, supplied-audio native backend and AR hardware are unverified. Existing Audio/Location/Video source and raw video were byte-checked and rendered; native location, display capture/PiP and playback routes were not exercised. These unchanged families are outside this rebuild. Actual browser unavailable/restricted error paths were exercised for the rebuilt services. Browser closed; final preview5199 remains running.
