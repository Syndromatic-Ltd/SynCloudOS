# Application migration and feature preservation

Migration authorized 28 October 2026 for all eleven bundles, including the previously exempt SynCal, MemoJournal and Gallery applications. The source inventory and proposed status below are the 24 October baseline. Current completion requires the implementation, ownership and preserved behavior gates; the execution ledger records accepted changes.

Compiler baseline for every migration: exact TypeScript 6.0.3, now approved. Native TypeScript 7/API porting is a separate deferred phase and is not an app-migration prerequisite. Compiler approval does not authorize the proposed application rewrites; preserve the ownership, feature, document and FX gates below.

Status: source inventory and proposed migrations, 24 October 2026. S is `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/site`, HEAD `9a78fd30f6b2cab61fcf469a72c37c08ae202b23`. Paths below are S-relative. F's framework plan is pinned separately in README. No application has been edited by this task.

## How completion is classified

Use four distinct facts per application: entry-class presence, actual state/behavior/resource ownership, adoption of the new 6E conveniences, and tested/browser/human acceptance. No row is accepted based only on an NSEApplication export. Surviving React hooks require classification, not automatic removal.

| Application | Inspected current structure | Migration classification | Wave |
| --- | --- | --- | --- |
| About | NSEApplication, window, main/page/scene/particle view controllers | Substantive 6C conversion; manual outlets, restoration and effects machinery remain; 6E not implemented | P10 |
| Software | Application, window, navigation and section/chapter controllers | Substantive 6C conversion; repeated restoration/retitling/subscription work | P10 |
| Diagnostics | Application/window, main, outline and section controllers | Substantive 6C conversion; async refresh/provider-generation plumbing remains | P10 |
| Chronosphere | Application/window/root view controller wrapping the framework archive | Class structure exists; verify responsibilities rather than manufacturing extra controllers around framework-owned archive internals | P10 |
| Portfolio | Application/window and library/reader/collection-editor view controllers | Substantive 6C conversion; dynamic navigation, restoration, outlets and action adapters remain | P11 |
| AnimationFX | Application/window and ShowcaseViewController; scene/media modules | Substantive 6C conversion; extensive rendering/media lifetime and transaction plumbing | P11 |
| Journal | Application/window/root and folders/notes/detail/alerts controllers | Real class migration, not fully accepted; view-owned read-only text session, manual connections and two fresh failing detached-window cases | P12, with P00 repair first |
| JournalPublisher | PublisherApplication, window, post controller and region controllers | Real class migration, not fully accepted; broad subscriptions, forwarding setters/handles and five fresh failing class cases | P12, with P00 repair first |
| SynCal | Function entry; domain SynCalDocumentController exists | Intentionally excluded on 20 October; complete application-layer migration is a proposed later wave | P13 |
| MemoJournal | Function entry, document/command helpers and editor component | Intentionally excluded on 20 October; complete application-layer migration is a proposed later wave | P13 |
| NSEControlGallery | Function root, navigation/controllers/specimens | Intentionally excluded on 20 October; migrate gallery application ownership while keeping demonstration components valid | P13 |

The three historical exemptions are recorded in `../specs/2026-10-20-class-rewrite-brief.md` relative to S. This new request includes a full migration plan, so they receive explicit work packages. An implementation review must decide whether P13 is admitted; an executor may neither silently omit it from completion nor treat this plan's creation as permission to begin it.

## Common migration process, repeated for each app

1. Enumerate actual regions, durable/transient state, commands, subscriptions, timers, async operations, documents, windows, effects, preferences and shared services before editing. Save the mapping with the app's evidence.
2. Run the exact existing tests named below and capture the baseline. If the app has no end-to-end controller test, add the planned named regression file before changing behavior.
3. Use new main/content-controller shortcuts only when they remove an empty wrapper; preserve custom window, document association and close/restore logic.
4. Convert imperative connections to bindings/action references/owned factories/observations/tasks one responsibility at a time. Keep original keys, route graphs, service tokens and schemas. Do not turn app policies into public APIs.
5. Keep pure TSX, native input/IME adapters, DOM measurements, local pointer geometry, element focus refs and genuinely local presentation state where they are clearest. Choose renderView only for compact pure views; large separate view modules stay separate.
6. Prove all original cases plus owner-close, stale result/provider, multiwindow and conditional-view cases. Record raw before/after code size, handwritten helper costs, class tree, authority map and any visible delta.
7. Complete browser interaction/appearance acceptance from this exact S checkout, installed from the matching F archive. Commit locally by app only after its package gates; no push is authorized.

## About

Existing edit scope: `src/SynWare/About.app/Contents/index.tsx`, `AboutPane.tsx`, `AboutScene.tsx`, `AboutParticles.tsx`, `AboutParticleField.ts`, `aboutMotion.ts`. Keep content, images, navigation IDs and locale resources unchanged.

Target owners: application owns session; window owns AboutViewController; navigation owns pages/scene/particles. Page controllers expose managed art/scroller/hero outlets; keyed chapter sigils remain an app-local keyed collection. Navigation state uses the existing tab/adaptive controllers with a validated restoration descriptor. Locale and selection observations use `@observes`. Renderer and continuous decorative frames use the managed AFX projection; simulation remains AboutParticleField.

Preserve: company/framework/team tab content, restored section, directional travel and interrupted selection, motes waiting for the selected pane, pointer tracking, floor motion, all artwork/text, compact layout, application/right-slot menus, inherited reduced-motion overrides, particle quality and fallback to complete static content if rendering is unavailable. Measurement of untransformed anchor positions remains separate from animated surfaces.

Tests: retain `tests/runtime/about-app.test.tsx`; extend it for repeated appearance/remount and no duplicate subscriptions. Add `tests/runtime/about-fx-lifetime.test.tsx` for active/hidden/visible/reduced-motion/close sequences. Browser: switch rapidly company -> team -> framework, toggle reduced motion, hide/resume tab, resize and return through Webspring.

## Software

Existing scope: `src/SynWare/Software.app/Contents/index.tsx`, `SoftwareSection.tsx`, `SynCloudOSChapters.tsx`. Target: existing navigation and chapter controllers, simple main/content shortcuts where applicable, navigation restoration descriptor and scoped locale observation. Local sidebar-collapse presentation state may stay local unless a command or persistence contract requires it elsewhere.

Preserve: grouped destinations and icons, last-viewed destination, translated sidebar/tab labels, section/chapter selection, next-chapter behavior and scroll-to-top, candidate action validation, peer/adaptive layout and content focus during segmented selection. Retitling must not write restoration state or recreate the content controller.

Tests: retain/extend `tests/runtime/software-app.test.tsx`; browser desktop and compact switching, restoration and keyboard focus. Compare old preference envelopes byte-for-byte after a no-op open/close.

## Diagnostics

Existing scope: `src/SynWare/Diagnostics.app/Contents/index.tsx` and its existing domain helpers. Target: keep section and outline controllers; replace manual request/refresh generations with a latest task that also carries trusted-provider identity/revocation. Scope the task to the owner because a refresh may be requested before a child view appears. Preserve previous snapshot on failed refresh while invalidating stale exports.

Preserve: capability absence UI, bounded capture/completeness, malformed/rejected response handling, redaction validator and export projection, original limits, trusted-client removal/replacement, no late response after close, all sections/outline/focus and explicit actions. No diagnostics fixture becomes a public API.

Tests: `tests/runtime/diagnostics-app.test.tsx` already covers provider replacement/revocation, supersession and close. All those cases are mandatory migration gates; add task-state correspondence assertions. No test may be removed because it is now covered by a generic task unit test.

## Chronosphere

Existing scope: `src/SynWare/Chronosphere.app/Contents/index.tsx`, `WebsiteVersionDetail.tsx`, `webspringSubject.ts` only if required for typed action adaptation. Target: remove an empty window wrapper through mainViewController and optionally inline the small root TSX method. Keep Chronosphere's internal controllers/layers/subject lifecycle under the framework component's ownership. Keep a return callback adapter if that component's public API expects one; do not add app-specific return actions to the framework.

Preserve: site-history subject, no live present card on the homepage subject, era details, return routing, stage/focus ownership, selected version transitions, reflections and reduced motion. Keep all authored history data and labels.

Tests: `tests/runtime/chronosphere-public-components.test.tsx`, `tests/e2e/chronosphere-presentation.test.mjs`; add `tests/runtime/chronosphere-class.test.tsx` for app lifecycle and return behavior. Publisher's document Versions flow is separately gated under Publisher; this app is not evidence for it.

## Portfolio

Existing scope: `src/SynWare/Portfolio.app/Contents/PortfolioApp.tsx`, `Library.tsx`, `Reader.tsx`, `CollectionEditor.tsx`, `libraryState.ts`, and directly connected view adapters. The `index.tsx` is a re-export, not the ownership implementation.

Target: retain library/reader/editor regions and service contract. Use own factories for late-created data resources and addChild for reader/editor containment. Convert primitive preferences to decorated fields where old keys match; keep the rich saved-library record with its parser/migration. Observe dynamic collection services with explicit provider identity. Declare region dependencies and typed action connections without duplicating route state.

Preserve: shelves/list, collections/search, selected artifact and page IDs, route-driven open/close, restoration when collections change, book flight origin/return geometry, focus-search command, Escape close, local reader scroll/measurement, collection create/edit/delete permissions and optimistic-concurrency conflicts, sheet anchors and pointer/touch behavior.

Tests: `tests/runtime/portfolio-app.test.tsx`, `tests/runtime/portfolio-library-state.test.ts`. Add late reader/editor creation after await plus close-during-load and provider replacement tests. Browser: open from shelf, turn pages, close into the correct book, edit a collection, provoke a version conflict, restore at compact width.

## AnimationFX

Existing scope: `src/SynWare/AnimationFX.app/Contents/index.tsx`, `Views/ShowcaseView.tsx`, `Views/ShowcaseDismissal.ts`, `Scene/createShowcaseScene.ts`, its existing choreography helpers, and media/search orchestration only where lifetimes change. Preserve numerical camera/layout/LOD/frame-selection algorithms unless a separately reproduced defect requires a bounded repair.

Target: use a simple main controller declaration; managed canvas outlet/renderer for viewport/activity and frame callbacks; static scoped layer transactions for repeated batching; task descriptors for index/search and suitable read-only media preparation. Keep media sessions, decode admission, generation-matched frame pairs, resource URL leases, detail residency and close choreography as their existing app-owned units. Do not place all media in a visible task that destroys intended reusable caches on every suspension.

Preserve: opening lead-in/reveal, wall/cylinder/cover-flow arrangements, camera controls and reset, pause/resume, reflection toggling, live/placeholder states, picking/dragging and selection, brand dismissal and interrupted close/reopen, search/unavailable/recovery UI, media timebase synchronization, HD close-up/detail LOD, retained VideoFrame storage where used, texture/UV/frame pairing, worker/resource disposal and reduced motion. No silent particle, DPR, detail or effect-quality downgrade.

Tests: retain `tests/runtime/animationfx-app.test.ts`, `animationfx-showcase.test.tsx`, `animationfx-dismissal.test.tsx` and all existing media/scene helper tests. Add `tests/runtime/animationfx-lifetime.test.tsx`. Where external media is unavailable, verify deterministic placeholder and unavailable states, and record media/GPU acceptance as unverified instead of substituting a fake success. Browser evidence includes detail close-up at DPR 2, visible/hidden resume and dismissal interrupted by reopen.

## Journal — complete the migration, not just the entry class

Existing scope: `src/SynWare/Journal.app/Contents/index.tsx`, `JournalWindowController.ts`, `JournalViewControllers.tsx`, `components/JournalBody.tsx`, `components/JournalDetachedNote.tsx`, `components/FolderTree.tsx`, `components/NoteList.tsx`, `components/NotePad.tsx`, `components/JournalShell.tsx`, and the existing projection/restoration helpers when their ownership changes. Existing URL/chrome helpers retain their contracts.

Current facts: JournalWindowController owns data, routing, loading, actions and root regions. JournalBody still creates an in-memory text owner and a read-only TextEditingSession in an effect. That resource is a mounted presentation session, not a second persisted document. Decide its exact owner at the detail/detached-region boundary and expose it through an explicit mounted editor adapter/controller; retain resolver/measurement hooks locally. The two fresh detached-window tests fail before migration.

Target tree: JournalApp -> JournalWindowController -> root/folders/notes/detail/alerts; each detached window owns its own detached page/read-only session. The main reader and secondary windows must never share one mutable text-session owner. Use a latest search task with provider/revocation checks, canonical route client state, bindings for query/UI preferences and typed action references. Keep DOM/File/share payloads in the correct domain/outlet channel.

Preserve: folders and expanded IDs, notes/search/loading/error/empty states, routes/query replacement and mobile hierarchy, all chrome variants and smooth surfaces, selected-post/access changes, focus-return preference, share with clipboard fallback and user activation, author edit/delete admission, projection identity and rematerialization, distinct detached note contents, real window movement/z-order/hit testing, document association/restoration bounds, keep-windows return, close-one/quit-all/reopen behavior and application menus. Keep read-only text selection, attachments, fonts and accessibility.

Tests: first repair the two existing detached cases in `tests/runtime/journal-class-controller.test.tsx` with causes proven. Retain `journal-reader-integration.test.tsx`, `journal-reader-url.test.ts`, `journal-lumina-reader.test.ts`, `journal-post-format.test.ts`, and `tests/e2e/journal-search.test.mjs`. Add `tests/runtime/journal-session-ownership.test.tsx` asserting distinct live sessions per main/detached surface, document-close ordering, body replacement and no leak on replay/conditional detach. Browser: detach by both entrypoints, inspect real contents, drag windows, keep windows, close one, quit and reopen.

## JournalPublisher — complete region ownership and acceptance

Existing scope: `src/SynWare/JournalPublisher.app/Contents/index.tsx`, `PublisherWindowController.tsx`, `PublisherViewControllers.tsx`, `PublisherPostController.ts`, `PublisherCanvas.tsx`, `PublisherInspector.tsx`, `PublisherSheets.tsx`, `publisherCommands.ts` and directly connected region components/binding adapters. Preserve the app-owned document/composition engine and Journal service contracts.

Current facts: application/window/post/region classes exist. PublisherWindowController contains numerous forwarding getters/setters and functional-style setter wrappers. `usePublisherState` observes twelve objects broadly. Canvas measurements, local note placement, inspector tabs and drag-over presentation are not automatically authority violations. Five fresh class tests fail, including four that never reach their target behavior because openPost is unknown to the test dispatch path.

Target: application owns shared preference authority; window owns its regions; post controller owns canonical document/text session/synchronization. Each region exposes its own selected state, binding adapters and actions. Replace broad cross-region observation with actual dependencies. Remove forwarding setters only after callers use real region bindings; do not move every property to a new central object. Keep dom/editor handles as outlets/adapters, not portable command payloads.

Preserve: author admission/read-only changes; New Post templates/draft reset; library filters/sort/open/duplicate/delete; document title/subtitle/body; selection formatting/paragraph/styles/typography/font/color panels; toolbar customization/overflow and shortcuts; find/replace; smart punctuation without touching composition; comments/anchors/review positioning; page templates/zoom/inspector/phone panes; attachments/image select/replace/style; previews and read-only session disposal; publish/schedule/unpublish/unlist with ETags/unknown outcomes; export/print/share; autosave/recovery/conflicts/undo coalescing; version summaries and content-aware Chronosphere restoration flight with separate fading current page. Keep the Return to Webspring control and metal top bars.

Tests: repair all five class cases before claiming migration acceptance; retain `tests/runtime/publisher/publisher-class.test.tsx`, `publisher-image.test.ts`, `publisher-version-diff.test.ts` and existing model/output tests. Add `tests/runtime/publisher/publisher-binding-ownership.test.tsx` for invalid/mixed selection, one undo per commit, no duplicate undo, composition, close-during-load and session lifetime. Browser: edit/format/type with IME, create and cancel a post, inspect responsive controls, preview, restore a real historical page and verify dirty/saved identity, export and exercise conflict handling with controlled providers. No production publishing is authorized for verification.

## SynCal — proposed full class migration of a previously exempt app

Existing scope: `src/SynWare/SynCal.app/Contents/index.tsx`, `SynCalDocumentController.ts`, and its app-owned model/service helpers. Create `SynCalApplication.ts`, `SynCalWindowController.ts`, `SynCalViewControllers.tsx` and bounded region files only where the actual regions warrant them. Keep the existing document/domain controller as the canonical calendar authority; do not replace recurrence/date arithmetic with a generic binding abstraction.

Target: application owns calendar service/document access and shared preferences; window owns navigation/selection and day/week/month/agenda/editor regions; typed actions and bindings connect user intent. Read tasks are cancellation-bound; durable calendar mutations use the existing document transactions and service concurrency policy.

Preserve: calendar visibility/colors, date navigation, all views and ranges, locale/start-of-week, local date/time inputs and daylight-saving behavior, recurrence/occurrence editing, all-day versus timed events, selection, create/edit/delete/cancel, import/export and service integration wherever present. Inventory exact actions in the large existing entry before splitting; preserve each discovered action even when not named in this summary.

Tests: retain `tests/runtime/syncal-model.test.ts`; create `tests/runtime/syncal-class.test.tsx` covering window lifecycle, representative editing/undo and service revocation. Add DST boundary cases using the existing domain model rather than rewriting it. Browser: create/edit/cancel an event, switch ranges/views and reopen restored state.

## MemoJournal — proposed full class migration of a previously exempt app

Existing scope: `src/SynWare/MemoJournal.app/Contents/index.tsx`, `MemoCommands.ts`, `MemoDocument.ts`, `MemoTextEditor.tsx`, `memoJournal.transitions.ts`. Create application/window and root/list/editor region controller files. The exported MemoJournalPreview remains an intentional deterministic preview and receives no production persistence/session authority.

Target: app/window owns memo collection/search/edit/delete modes and document operations; editor region owns session/undo/close transitions. Preserve local pointer/jiggle/measurement presentation hooks where appropriate. Migrate command registration to actions without replacing canonical memo documents or entry-animation preferences.

Preserve: saved memo storage format and migration, sorting/filtering/colors, new memo flow, rich editing and undo, one document per memo with pending-open convergence, edit/delete mode and confirmation, close animation completion/interruption, entry-animation state, responsive presentation, keyboard/focus and standalone preview behavior.

Tests: retain `tests/runtime/memo-journal-model.test.ts`; create `tests/runtime/memo-journal-class.test.tsx` for collection/document/session ownership, reopening a pending document and close interruption. Preserve all existing document serialization fixtures. Browser: create, edit, undo, close/reopen and delete a memo; separately render the preview without touching live storage.

## NSEControlGallery — proposed application-shell migration of a previously exempt app

Existing scope: `src/SynWare/NSEControlGallery.app/Contents/index.tsx`, `Gallery/navigation.ts`, `Gallery/GallerySettings.tsx` and application-level navigation/settings providers. Create GalleryApplication, GalleryWindowController and GalleryViewControllers files as app-owned code.

Target: controllers own category/section navigation, search, appearance/settings and persistence. Stop manual deferred disposal of top-level navigation objects once the actual controller owner releases them. Keep Gallery sample components, React hook demonstrations, controlled/uncontrolled fixtures and conformance specimens as valid examples; they are not production framework APIs.

Preserve: all categories/specimens/source inspector/programmes, filtering, visited-section retention, selected category/section restoration, disabled/API/appearance switches, independent Atmo/light/dark/responsive semantics, scroll/focus restoration, menus/portals, text documents, sample media and user windows. The gallery's app-level state becomes class-based without deleting examples that demonstrate supported React consumption.

Tests: retain `gallery-catalogue`, `gallery-navigation`, `gallery-window-ownership`, `gallery-renderers`, `gallery-text-document`, `gallery-rebuilt-text`, `gallery-chronosphere-focus` and preview policy tests. Create `tests/runtime/gallery-class.test.tsx` for shell ownership and reopening. Browser: search, navigate, switch appearance, open overlays and a specimen window, close/reopen and verify state and no duplicate disposal.

## Required per-app evidence record

Future execution stores one Markdown/JSON evidence pair under `S/validation/cocoa-authoring/<app>/` (existing policy permitting), with exact F/S HEADs, archive/source digest, selected bundles, test commands/outcomes, persisted-key comparison, class/resource tree, stale-operation cases, viewports/DPR, console errors and screenshots. Include before/after code size and handwritten shared-helper costs. These evidence files are not created by this planning task.

No app row is signed off by a screenshot alone, a hook-count reduction, a syntax grep or a passing model-only suite. Human appearance/motion acceptance and automated behavior acceptance are distinct required columns.
