# SynCloudOS framework guide

SynCloudOS is an application framework for the web, in the tradition of Cocoa. These guides take you from a first site to the details of every layer.

## Start here

| Guide | Read it to |
| --- | --- |
| [Getting started](getting-started.md) | Build a site with a launcher and one application |
| [Overview](overview.md) | See how the layers fit together and which package entries exist |
| [Beta.2 migration](migration-beta2.md) | Replace beta.1 identity, authoring, hook, ownership and shell APIs |
| [Developer MCP](developer-mcp.md) | Give AI coding agents version-matched offline SDK tools |
| [Errors and outcomes](errors.md) | Handle typed outcomes, lifecycle diagnostics and stable error codes |

## Building applications

| Guide | Read it to |
| --- | --- |
| [Applications](applications.md) | Build application, window and view-controller classes with actions and observable state |
| [Cocoa authoring](cocoa-authoring.md) | Connect class views, bindings, actions, tasks and managed outlets |
| [Authoring contract](authoring-contract.md) | Which API to use for each job; shipped to coding agents as AGENTS.md |
| [Preferences and observations](authoring-preferences.md) | Declare persistent state, scoped observations and navigation restoration |
| [SynWare SDK](synware-sdk.md) | Learn the bundle format, the session, hooks, services, routes and tooling |
| [Manifest reference](synware-manifest.md) | Look up every `Info.ts` field |
| [Commands, responders and undo](commands-responders-undo.md) | Route user intent to code, and reverse it |
| [Foundation](foundation.md) | Work with immutable data, ranges, collections, predicates, sorting and formatters |
| [Documents](documents.md) | Edit, save, recover and version user content |
| [Chronosphere](chronosphere.md) | Present a history in the version archive, and choose or write its view |
| [Document assets](document-assets.md) | Retain native asset bytes through editing, history, recovery and output |
| [Custom document engines](custom-document-engines.md) | Integrate an application's composition policy with shared document/input/output primitives |
| [Windows](windows.md) | Open, arrange and restore windows across screen sizes |
| [Drag and pasteboard](drag-and-pasteboard.md) | Move content between views and applications |
| [Testing a SynWare](testing-synware.md) | Test with a deterministic host |

## The application kit

| Guide | Read it to |
| --- | --- |
| [NSE controls](nse-controls.md) | Find the control for a job |
| [Scroll and image view access](view-access.md) | Observe NSClipView bounds and animate a layer-backed NSImageView |
| [Named template images](named-images.md) | Look up NSImage navigation templates and inherit the control’s colour |
| [Paths and workspace](path-control-and-workspace.md) | Present file locations and workspace artwork |
| [Source-list chrome](nse/source-list-chrome.md) | Compose a source-list body inside system-owned application chrome |
| [Controllers](controllers.md) | Manage collections, trees and preferences |
| [Data views](data-views.md) | Show large collections in tables, outlines and lists |
| [Text and editing](text-and-editing.md) | Use text owners, sessions, views, typography and web content |
| [Text geometry](text-geometry.md) | Query revisioned logical or shaped geometry and explicit transforms |
| [Appearance and Atmo](appearance.md) | Load the theme, and work with light and dark |
| [Themes](themes.md) | Write, load, nest and validate a .scostheme theme bundle |
| [Theme contract reference](theme-contract.md) | Every control part, state, variant and colour a theme can draw |

## FX frameworks

The [FX overview](fx/README.md) introduces the frameworks and how they reach a SynWare. Each has its own page:

[AnimationFX](fx/animation.md) · [GraphicsFX](fx/graphics.md) · [ImageFX](fx/image.md) · [TextFX](fx/text.md) · [AudioFX](fx/audio.md) · [HapticsFX](fx/haptics.md) · [MotionFX](fx/motion.md) · [MediaFX](fx/media.md) · [VideoFX](fx/video.md) · [MIDIFX](fx/midi.md) · [LocationFX](fx/location.md) · [LuminaFX](fx/lumina.md) · [CompressionFX](fx/compression.md)

[BluetoothFX](fx/bluetooth.md) · [NFCFX](fx/nfc.md) · [SpeechFX](fx/speech.md) · [ContactsFX](fx/contacts.md) · [PassFX](fx/pass.md) · [XRFX](fx/xr.md)

[NetworkFX](fx/network.md) monitors browser path hints. [CryptoFX](fx/crypto.md)
provides worker-safe CryptoKit-shaped WebCrypto operations. [Route picker](nse/route-picker.md)
documents the Atmo control for VideoFX remote playback.

## Hosting

| Guide | Read it to |
| --- | --- |
| [The runtime and the host](runtime.md) | Mount the runtime, and configure policy and contributions |
| [Read-only storage diagnostics](storage-diagnostics.md) | Inspect approximate origin usage, quota and current persistence status |
| [Webspring](webspring.md) | Define the shell, the Board launcher, branding and content |
| [Authentication](authentication.md) | Add sign-in, server handlers and roles |
| [Privacy](privacy.md) | Manage per-application device consent and revocation |
| [Installed applications](installed-applications.md) | Declare installation and understand browser-managed application capabilities |
| [Google sign-in setup](google-oidc-setup.md) | Connect Google as the identity provider |
