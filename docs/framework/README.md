# SynCloudOS framework guide

SynCloudOS is an application framework for the web, in the tradition of Cocoa. These guides take you from a first site to the details of every layer.

## Start here

| Guide | Read it to |
| --- | --- |
| [Getting started](getting-started.md) | Build a site with a launcher and one application |
| [Overview](overview.md) | See how the layers fit together and which package entries exist |
| [Developer MCP](developer-mcp.md) | Give Codex and Claude Code version-matched offline SDK tools |
| [Errors and outcomes](errors.md) | Handle typed outcomes, lifecycle diagnostics and stable error codes |

## Building applications

| Guide | Read it to |
| --- | --- |
| [SynWare SDK](synware-sdk.md) | Learn the bundle format, the session, hooks, services, routes and tooling |
| [Manifest reference](synware-manifest.md) | Look up every `Info.ts` field |
| [Commands, responders and undo](commands-responders-undo.md) | Route user intent to code, and reverse it |
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
| [Source-list chrome](nse/source-list-chrome.md) | Compose a source-list body inside system-owned application chrome |
| [Controllers](controllers.md) | Manage collections, trees and preferences |
| [Data views](data-views.md) | Show large collections in tables, outlines and lists |
| [Text and editing](text-and-editing.md) | Use text owners, sessions, views, typography and web content |
| [Text geometry](text-geometry.md) | Query revisioned logical or shaped geometry and explicit transforms |
| [Appearance and Atmo](appearance.md) | Load the theme, and work with light and dark |

## FX frameworks

The [FX overview](fx/README.md) introduces the twelve frameworks and how they reach a SynWare. Each has its own page:

[AnimationFX](fx/animation.md) · [GraphicsFX](fx/graphics.md) · [ImageFX](fx/image.md) · [TextFX](fx/text.md) · [AudioFX](fx/audio.md) · [HapticsFX](fx/haptics.md) · [MotionFX](fx/motion.md) · [MediaFX](fx/media.md) · [VideoFX](fx/video.md) · [MIDIFX](fx/midi.md) · [LocationFX](fx/location.md) · [LuminaFX](fx/lumina.md)

## Hosting

| Guide | Read it to |
| --- | --- |
| [The runtime and the host](runtime.md) | Mount the runtime, and configure policy and contributions |
| [Webspring](webspring.md) | Define the shell, the Board launcher, branding and content |
| [Authentication](authentication.md) | Add sign-in, server handlers and roles |
| [Google sign-in setup](google-oidc-setup.md) | Connect Google as the identity provider |
