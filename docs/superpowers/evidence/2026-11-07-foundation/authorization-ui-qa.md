# Privacy & Security UI QA inventory

Only added UI: the Webspring Privacy & Security preference pane. Controls are existing NSEBox, NSEStackView, NSETextField, NSESwitch and NSEButton painted by Atmo. No invented controls or artwork. Passkeys add no UI to this site: the provider remains opt-in.

| Claim / control | Functional check | Visual state / evidence |
|---|---|---|
| Pane is registered in real System Preferences | Open Preferences and choose Privacy & Security with normal browser input | Empty pane, desktop initial viewport |
| A real FX request records the application | Trigger the gallery location request through its existing control using browser geolocation emulation, then return to Privacy & Security | Populated app/service row; native permission reported separately |
| Allow switch changes only local consent | Toggle off and on; inspect visible App access text | Allowed and denied states, actual NSE switch artwork |
| Ask again resets local consent | Click actual NSEButton; inspect Ask on next request and disabled reset button | Prompt state with native permission unchanged |
| Controls support keyboard input | Tab/Space through the real NSESwitch and activation of Ask again | Focus-visible state if available |
| Fits intended viewports | Inspect region bounds plus screenshots | Desktop 1365x900 DPR1 and phone 390x844 DPR2 |
| Appearance is supplied by Atmo | Inspect actual drawn controls in site appearance | Light/dark or documented tested appearance |
| Empty and dense states are understandable | Fresh isolated browser context and populated row/group | No raw custom button or copied artwork |

Exploratory checks: revisit after closing/reopening Preferences to confirm persistence; inspect a narrow viewport for clipping/wrapping; reset/re-request so local choice and native permission can differ. Real-device positioning and native browser permission dialogs are not acceptance claims. Browser geolocation emulation supplies deterministic coordinates. Existing user browser storage is not cleared or modified by the isolated QA context.

Results and screenshot paths are recorded in authorization-report.md after the adopted package is verified.
