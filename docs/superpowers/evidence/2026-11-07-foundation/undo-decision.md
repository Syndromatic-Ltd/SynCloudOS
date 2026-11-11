# Undo decision

Part A uses the explicitly permitted fallback: do not force a runtime-wide undo rewrite into this Foundation change. No `NSEUndoManager` alias or re-export is introduced.

The plan’s assertion that a public `NSEUndoManager` class already exists is inaccurate in this checkout. The actual contracts are:

| Contract | Evidence | Coupling |
| --- | --- | --- |
| `UndoManager` | `src/SynCloudOS/Undo/undoTypes.ts:146` | Extends `UndoCommandTarget`, including branded `SynCloudOSRuntimeId` and owner; exposes grouping, clean-state, lease creation, inspection and disposal |
| `UndoManagerRegistry` | `src/SynCloudOS/Undo/undoTypes.ts:164` | Resolves through runtime responder-resolution records |
| `NSEUndoManagerPort` | `src/NSE/Controls/Values/valueControlTypes.ts:29` | A restricted `Pick` of that runtime manager, used by controls |
| `SynWareUndoManager` | `src/SynCloudOSReact/appRuntimeTypes.ts:563` | A restricted history capability; excludes kernel clear/dispose/grouping controls |
| `createMountedUndoLease` | `src/SynCloudOS/AppSDK/appRuntimeFacade.ts:202` | Acquires a registration partition, guards revocation, tracks subscriptions and reservations, keeps action cleanup/in-flight inversion correct |
| `AppUndoHistory` | `src/SynCloudOS/AppSDK/appClientTypes.ts:188` | Public mounted session projection of history |

A type-only move would pull the runtime identifier, responder types, action brands and history lease protocol upward, or create an alias to a kernel interface. Neither is a dependency-free Foundation manager with NSUndoManager semantics.

Follow-up design: define Foundation-owned action/registration/grouping contracts and an actual `NSEUndoManager` with no runtime identity or responder knowledge. Make the runtime own a manager plus a branded owner record; keep responder routing, registration partitions and revocable app projections in SynCloudOS. Migrate controls to a capability derived from that Foundation interface, and migrate the AppSDK lease only after replay, cancellation, partition-frontier and teardown tests demonstrate equivalent authority. The raw manager must never replace a mounted lease. This is a separate cross-layer change, not a naming shim.

Notification check: `src/SynCloudOS/NotificationCenter/notificationDeliveryTypes.ts:128` defines `UserNotificationCenter`, with permission and host delivery; this maps to UserNotifications, not Foundation’s in-process `NSNotificationCenter`. No general Foundation notification centre is invented in Part A.
