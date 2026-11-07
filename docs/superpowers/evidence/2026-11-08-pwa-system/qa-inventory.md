# PWA system verification inventory

The target is the paired site at http://127.0.0.1:5199. Screenshots belong here; command logs belong in the sibling `2026-11-07-foundation` directory with the `pwa-` prefix.

| Claim or UI | Verification |
| --- | --- |
| Explicit whole-Webspring installation | Generated manifest, Chromium installability and installed-app state |
| One runtime worker | Registration and controller inspection; SDK receipt/cache version |
| Offline installed launch | Online controlled reload, install, offline fresh navigation/relaunch and rendered desktop |
| Install command / Capabilities pane | Real NSE control screenshot; installed/uninstalled states, disabled prompt state |
| Passive FX queries | Capabilities screenshot and query results; no permission prompt on opening |
| Declaration projection | File/protocol/link/shortcut/share unit tests; packed plugin tests |
| Incoming files | Registered document byte-reader and LaunchServices ordering tests |
| Push | Standard/declarative worker tests; missing-key refusal; live transport requires owner configuration |
| BackgroundTasks | Declared identifier/cancellation/capability tests; live browser worker persistence and sync where exposed |
| Dock badges | NSEDockTile ownership tests, NotificationCenter snapshot integration and browser badging |
| Window controls overlay | Actual installed desktop if available; Atmo title-area screenshot and geometry |
| View Transitions | Controller lifetime tests and native Chromium transition lifecycle |
| Update safety | Waiting worker, cache generation and ordinary offline/API separation |
| Off-happy paths | Unsupported APIs, rejected scope/protocol, missing push configuration, disposed app |

Every newly drawn control must use an existing NSE renderer. The title bar extends the existing NSEWindowTitleBar to the host window; it creates no WindowRecord or duplicate artwork. The Capabilities pane uses NSEBox and NSEButton. Badge labels use the existing Badge renderer.
