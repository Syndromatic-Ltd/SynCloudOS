# Web platform capabilities: whatpwacando.today parity

2026-11-07. Owner request: SynCloudOS should be able to do everything [whatpwacando.today](https://whatpwacando.today/) demonstrates (48 demos), shaped the AppKit/Cocoa way. AppKit and the Apple frameworks define the architecture. Device and media capabilities belong in an FX framework, named after its Apple counterpart and reached through the mounted session. Window and app-shell behaviour belongs on NSE/SCOS objects. App declarations go in `Info.ts`, the Info.plist analogue.

Status: **proposal, not approved**. The open questions are at the end.

## How this was audited

Each row was checked against the source tree on `fix/blind-rewrite-friction` at 8343cb6 and later. "Have" cites the file that wraps the browser API. A first pass searched only for literal `navigator.x` calls. It missed LocationFX, notification delivery and Media Session, because adapters reach the browser through stored `navigator` and `window` references, so this second pass searched for the API names themselves. Treat any "Missing" row as needing one last check by the implementer before building.

## The 48 demos

Legend: **Have**: wrapped and reachable by apps. **Partial**: present, but internal only or missing part of the demo. **Missing**: no wrapper.

| # | Demo | Status | Evidence / gap | Apple counterpart | Home |
|---|---|---|---|---|---|
| 1 | PWA capabilities (overview) | n/a | the index page | — | — |
| 2 | Installation | Missing | no web app manifest, no `beforeinstallprompt` handling | app bundle; install is a system action | runtime + site build (`Info.ts` → manifest) |
| 3 | Offline support | Missing | no service worker | `URLCache`; the app works offline by default | runtime: one SynCloudOS service worker |
| 4 | Diagnostics | Partial | `Persistence/storageDiagnostics.ts`, Storage pane; no capability report | System Information | Webspring: a "Capabilities" pane listing every FX `capabilities` query |
| 5 | Notifications | Have | `NotificationCenter/*`, `PlatformAdapters/BrowserUserNotificationDeliveryAdapter.ts` (system delivery with permission) | `UNUserNotificationCenter` | runtime (exists). Check the naming against UserNotifications |
| 6 | Declarative Web Push | Missing | needs push | APNs alert payloads | runtime notifications + server |
| 7 | Shortcuts | Missing | no manifest `shortcuts` | Dock menu (`applicationDockMenu(_:)`), `UIApplicationShortcutItems` | `Info.ts` `shortcutItems` → manifest; NSApplicationDelegate dock menu |
| 8 | View Transitions | Missing | no `startViewTransition` | `NSViewController.transition(from:to:options:)`, `NSAnimationContext` | AFX backend for the animation job's transitions (internal) |
| 9 | Incoming call notifications | Missing | — | CallKit (iOS); macOS has notification actions | UserNotifications categories and actions; CallKit-like API: low priority |
| 10 | Geolocation | Have | `FX/LocationFX`, `PlatformAdapters/BrowserLocationAdapter.ts` (`LFXLocationManager`) | Core Location | LocationFX |
| 11 | Speed meter | Have? | `LFXLocation` has course; check speed and speedAccuracy | `CLLocation.speed` | LocationFX (add speed if absent) |
| 12 | Media capture | Have | `FX/VideoFX` `VFXCaptureSession`, `AUFX` audio input, `BrowserVideoCaptureAdapter`, `BrowserAudioCaptureAdapter` | AVFoundation capture | VideoFX / AudioFX |
| 13 | Media capability elements | Missing | HTML `<permission>`-style elements | none (system prompts) | skip; permissions stay manifest + request |
| 14 | AirPlay | Missing | — | `AVRoutePickerView`, `AVRouteDetector` (AVKit/AVFoundation) | VideoFX/AudioFX route detection + an NSE route-picker control (see Q2) |
| 15 | Picture-in-picture | Missing | — | `AVPictureInPictureController` (AVKit) | VideoFX playback presentation (see Q2) |
| 16 | File System | Partial → in progress | system pickers only (`BrowserFileSystemAccessPanelPort.ts`); the Codex open-panel job adds the drawn sheet, granted folders and app storage | `NSOpenPanel`, security-scoped bookmarks, `FileManager` | NSE file panels + runtime |
| 17 | Compression | Partial | internal only (PDF, image metadata) | Compression framework, AppleArchive | new small FX or Foundation-level helper (Q3) |
| 18 | Authentication (passkeys) | Missing | OIDC exists (`docs/framework/authentication.md`); no WebAuthn | AuthenticationServices (`ASAuthorizationController`, passkeys) | runtime Authentication (Q4) |
| 19 | Encryption | Partial | `crypto.subtle` used internally only | CryptoKit | new CryptoFX (Q3) |
| 20 | Window controls | Missing | no `windowControlsOverlay` | `NSWindow` full-size content view, title-bar traffic lights | NSE windows: when installed, Atmo draws the title bar into the overlay area |
| 21 | File handling | Missing | no `launchQueue` | `CFBundleDocumentTypes`, `application(_:open:)` | `Info.ts` document types → manifest `file_handlers`; NSDocumentController opens them |
| 22 | Link handling | Missing | no `launch_handler` / `handle_links` | Universal Links, `application(_:continue:)` | `Info.ts` + routes |
| 23 | Protocol handling | Missing | no `registerProtocolHandler` / `protocol_handlers` | `CFBundleURLTypes`, `application(_:open urls:)` | `Info.ts` URL types → manifest |
| 24 | Contact picker | Missing | — | Contacts, `CNContactPicker` | new ContactsFX (Q1) |
| 25 | Web share | Have | `AppSDK/mountedShareClient.ts` | `NSSharingServicePicker` | exists; add the share **target** (receiving) via the manifest `share_target` = Share extension |
| 26 | Viewport | Have | `PlatformAdapters/BrowserViewportFeatures.ts`, visualViewport use in overlays | safe areas, keyboard layout guide | exists |
| 27 | Barcode detection | Have | `FX/ImageFX/analysis` (`IFXDetector`, Aztec/DataMatrix/QR descriptors) | Core Image `CIDetector`, Vision | ImageFX |
| 28 | Face detection | Have | `IFXFaceFeature`, `IFXModelAnalysisBackend` | `CIDetector`/Vision | ImageFX |
| 29 | Vibration | Have | `HapticsFX`, `NSEHapticFeedbackManager` | Core Haptics, `NSHapticFeedbackManager` | HapticsFX |
| 30 | Audio recording | Have | AudioFX input + `BrowserAudioCaptureAdapter` | `AVAudioRecorder`/engine input | AudioFX |
| 31 | Audio | Have | AudioFX engine and graphs | AVAudioEngine | AudioFX |
| 32 | Audio Session API | Partial | AUFX audio sessions exist (`mountedAudioSessions`); check they drive `navigator.audioSession.type` | `AVAudioSession` category | AudioFX |
| 33 | Screen capturing | Have | `BrowserVideoCaptureAdapter` (`getDisplayMedia`) | ScreenCaptureKit | VideoFX |
| 34 | Element capture | Missing | no `RestrictionTarget`/`CropTarget` | ScreenCaptureKit `SCContentFilter` (window/app filters) | VideoFX capture filter |
| 35 | Background sync | Missing | needs a service worker | BackgroundTasks (`BGTaskScheduler`) | runtime |
| 36 | Background fetch | Missing | needs a service worker | background `URLSession` | runtime |
| 37 | Storage API | Partial | estimate shown in the Storage pane; no `persist()` request | `FileManager` volume capacity; purgeable vs important storage | runtime persistence: request persistence when installed |
| 38 | Bluetooth | Missing | — | Core Bluetooth | new BluetoothFX (Q1) |
| 39 | NFC | Missing | — | Core NFC | new NFCFX (Q1) |
| 40 | AR/VR | Missing | — | ARKit / RealityKit | new XR framework: lowest priority |
| 41 | Payment | Missing | — | PassKit (`PKPaymentRequest`) | new framework (Q1): needs a merchant setup |
| 42 | Wake lock | Have | `AppSDK/mountedScreenWakeLock.ts` | `ProcessInfo.beginActivity` / IOPM assertions | runtime (check the naming) |
| 43 | Orientation | Have | MotionFX, `BrowserMotionAdapter`, screen orientation | Core Motion | MotionFX |
| 44 | Motion | Have | MotionFX `MFXMotionManager` | Core Motion | MotionFX |
| 45 | Network info | Partial | online/offline in `appRuntimeFacade.ts`; no connection type or cost | Network `NWPathMonitor` (`isExpensive`, `isConstrained`) | Foundation-level `NWPathMonitor` analogue (Q3) |
| 46 | Speech synthesis | Partial | Publisher calls `speechSynthesis` directly; no framework API | `AVSpeechSynthesizer` | AudioFX (`AUFXSpeechSynthesizer`), since AVSpeechSynthesizer is AVFoundation audio |
| 47 | Speech recognition | Missing | — | Speech (`SFSpeechRecognizer`) | new SpeechFX (Q1) |
| 48 | Multi touch | Have | `BrowserPointerAdapter`, `NSTouch`-style handling | `NSTouch`, gesture recognisers | NSE (exists) |

Totals: 20 Have (two to check), 8 Partial, 19 Missing, 1 overview page.

## Phases

1. **Installed app foundation** (unlocks most of the rest).
   - One runtime-owned service worker with offline app-shell caching, versioned with the SDK receipt.
   - A web app manifest generated from each site's apps and their `Info.ts`. The manifest is per-origin, so the Webspring desktop is the installed app and SynWare apps are its documents and windows.
   - An install prompt as a Webspring command.
   - Storage `persist()` requested when installed.
   - A capability report pane (demo 4).
2. **App declarations in `Info.ts`.**
   - Document types (file handling).
   - URL types (protocol handling).
   - Link capture.
   - Shortcut items (manifest shortcuts and the dock menu).
   - Share target.
   - Each one routes into the existing AppKit path: `NSDocumentController.openDocument(withContentsOf:)` and `NSApplicationDelegate.application(_:open:)`.
3. **Notifications and the shell.**
   - Push and declarative push for `UNUserNotificationCenter`; the server side needs the owner's push keys.
   - App badges on top of the NotificationCenter badge snapshot (`NSDockTile.badgeLabel`).
   - Window controls overlay: the installed desktop draws its own Atmo title bar.
   - View Transitions as a backend for `transition(from:to:options:)`.
4. **FX additions on existing families.**
   - LocationFX: speed.
   - AudioFX: `AUFXSpeechSynthesizer` and the audio-session type.
   - VideoFX: picture-in-picture, route detection and element capture.
   - A Network path monitor.
   - Background sync and fetch as BackgroundTasks.
5. **New FX families.** Speech recognition, Contacts, Bluetooth, NFC, then Payment and XR. Each one gets its own `<Name>FX` with a capability query, a manifest permission and a session hook (`useBluetooth`, …), like LocationFX.
6. **Security frameworks.**
   - CryptoKit-shaped encryption.
   - Compression.
   - Passkeys through AuthenticationServices-shaped authorisation.

## Decisions (owner, 2026-11-07)

- **New FX prefixes:** BluetoothFX `BTFX`, NFCFX `NFX`, SpeechFX `SPFX`, ContactsFX `CNFX`, PassFX `PKFX` (payment), XRFX `XRFX`.
- **AVKit:** picture-in-picture and route detection are VideoFX controllers (`VFXPictureInPictureController`, `VFXRouteDetector`). The AirPlay button is one NSE control (`NSERoutePickerView`).
- **CryptoKit, Compression, Network:** follow Apple, where these are standalone frameworks used directly by apps. They become FX families (`CRFX`, `ZFX`, `NWFX`; names still to confirm), next to the Core ones.
- **Install scope is the developer's choice.**
  - In single-application mode, the app itself is installable.
  - A site can make its whole Webspring desktop installable; the Syndromatic site will.
  - A site can make only chosen apps installable: a manifest per app, with `scope` set to the app's route.
  - This is declared per site (Webspring) and per app (`Info.ts`), never assumed.
- **Authentication stays optional everywhere.** Neither a site nor an app has to use it.

## Which layer: FX or SynCloudOS

The rule that settles each new capability:

- **FX:** frameworks an app links and calls directly. They are value types plus device or data access, reached through the session with a manifest permission. Examples: LocationFX, MotionFX, BTFX, NFX, SPFX, CNFX, PKFX, XRFX, CRFX, ZFX, NWFX.
- **SynCloudOS (the system layer):** services the system mediates between apps, the user and the host:
  - install and the manifest;
  - the service worker, offline support, background sync and fetch (BackgroundTasks);
  - notifications and push (UserNotifications);
  - document, URL and link handling from `Info.ts`;
  - authentication (AuthenticationServices);
  - authorisation (PolicyKit).

## Passkeys and PolicyKit (recommendation)

- **PolicyKit is authorisation, not authentication.** It decides what an authenticated subject may do: roles, capability grants, app access policy and audit. Its Apple analogue is Authorization Services plus the privacy database (TCC); the name follows freedesktop polkit. Passkeys do not belong in it. A passkey proves who the user is, which produces the subject that PolicyKit then judges.
- **Passkeys become an optional AuthenticationServices-shaped API in the SynCloudOS layer:**
  - an `ASAuthorizationController`-style controller;
  - providers after `ASAuthorizationPlatformPublicKeyCredentialProvider`;
  - registration and assertion requests;
  - a delegate for completion and errors.
- **It is used two ways:**
  - (a) An app signs users in to its own service. The framework returns the credential, and the app's server verifies it. SynCloudOS stores no secrets and runs no relying-party server.
  - (b) A site developer adds passkeys as one more provider in the existing system sign-in, beside OIDC and local sign-in, through the site's authentication policy.
- **Both are opt-in.** A site with `authenticationPolicy: "disabled"` or an app that never imports it carries none of it.
- **PolicyKit needs a review of its own** before it is relied on as the security layer. The owner questioned its efficacy, and that review is out of scope here.

## Open questions for the owner (remaining)

- Confirm the CRFX, ZFX and NWFX prefixes.
- Confirm the passkey recommendation above.
