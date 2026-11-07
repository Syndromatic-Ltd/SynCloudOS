# NSEOpenPanel — implementation and acceptance evidence

The owner-approved desktop sheet and phone Sources flow are implemented in the existing shared framework/site worktrees. `NSEOpenPanel` owns Folders, Media and App Storage. The separate `NSEMediaPanel` class, window bridge and public declarations are removed, with no compatibility alias. D4 and the phase-9 Open panel note are marked **Landed** in the audit.

The installed, browser-tested SDK is framework **b963a00c33bcb55983a487c180afd3cb6efb037c**, archive SHA-256 **58a1ced906b95c95c5b7cc6f47fe80bbb997468c61369047006ae51fdd846990**. Site adoption is **bfcb62c**. This includes the concurrent Foundation and animation commits available at adoption time. The shared framework branch subsequently advanced; [provenance.json](provenance.json) records the observed heads and listeners. No push, branch switch or permanent worktree was made.

Preview remains available from the named site worktree at [NSE Control Gallery](http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery). Search for **Open Panel Media Sources**, then choose **Choose a picture**. Only port 5199 was restarted. Listeners on 5173 (PID 72912) and 5387 (PID 69072) were preserved; 5210 had no listener.

## Final API

See [the public API guide](../../../framework/nse/open-panel.md) for examples and ownership details.

| API | Behaviour and reason |
| --- | --- |
| `new NSEOpenPanel()` | Configurable object following `NSOpenPanel`, replacing the previous JSX component. |
| `canChooseFiles`, `canChooseDirectories`, `allowsMultipleSelection` | Select files, directories or both in the drawn browser. Defaults are true, false and false. |
| `allowedContentTypes`, `directoryURL`, `prompt`, `message` | MIME/extension/Foundation-type filtering, initial directory handle and panel text. Folders stay visible during filtering. |
| `mediaSources` | Existing provider queries and resource ownership now feed the Open panel's Media section. |
| `beginSheetModal(window, completion?)` | Attaches below the parent window's chrome and blocks that parent. It uses the existing window-owned sheet layer. |
| `begin(completion?)`, `runModal()` | Application-modal presentation through the existing transient-window bridge. Each begin method returns a promise for `NSEModalResponse.OK` or `.cancel`; JavaScript has no synchronous native modal loop. |
| `urls`, `url`, `result`, `cancel()`, `dispose()` | Accepted identities, typed cancellation/error result and explicit lifecycle. Provider resources survive acceptance until panel reuse or disposal; file references are released by their consumer or application teardown. |
| `usesSystemFileChooser = true` | Explicit opt-in to the existing system chooser; default false. The AppKit-like `uses…` Boolean names acquisition independently from sheet/application modality. This is a documented SynCloudOS extension, since AppKit itself has no browser/native split. |
| `SCOS.fileManager.urls("applicationSupportDirectory", "userDomainMask")` | Minimal `FileManager.urls(for:in:)` analogue, returning the application's OPFS directory handle, or an empty array when unavailable. Editors, document importers and media apps need persistent working storage; file acquisition and JSON preferences cannot provide it. No general filesystem facade was added. |

`NSEOpenPanelURL` is the union of actual file references and provider media items. No synthetic OS paths are exposed. Application support lives at `SynCloudOS-Application-Support/<encoded bundle identifier>` in OPFS. Bundle scoping separates application directories; mutually trusted same-origin code still shares the browser's origin boundary and quota.

## Runtime and interaction

- The injected browser storage port persists actual directory handles by IndexedDB structured clone, scoped to the application bundle. Restoration calls `queryPermission`. A locked row calls `requestPermission` from its explicit activation; restoration never prompts.
- Granted folders enumerate with `values()`, with folders first, a clickable path, back/forward history, current-directory search and content-type filtering. Accepted references retain live permission/release state and are bound to the application mount.
- Media provider queries, pagination, cancellation and leases remain runtime-owned. Activation-only providers run from an explicit source action. React development replay does not dispose the live provider service.
- App Storage browses the bundle's Application Support directory. Apps may create Scratch Disk or Media children. OPFS handles without FSA permission methods are adapted inside the browser port.
- **System Chooser…** runs directly from its button. No directory picker hides Folders; no OPFS hides App Storage. Media can remain available. An insecure context or no usable drawn source chooses the system path immediately; without current activation it returns a typed denial instead of waiting for a later gesture.
- Compact presentation starts on Sources. A folder tap drills in; file/media taps select and the header's Open accepts. Escape/cancellation restores focus after parent inertness is removed. The shared sheet layer is above the parent's floating tab chrome.

## Visual comparison and screenshots

Authoritative boards supplied by the owner:

- Desktop: `C:\Users\KAVISH~1\AppData\Local\Temp\claude\C--Users-Kavish-Krishnakumar\cf6d67a8-095b-4276-8632-0a5bf1e8dd9d\scratchpad\mediamock\project\Sheet.dc.html` ([render](reference-desktop.png)).
- Phone: the same directory's `Phone.dc.html` ([render](reference-phone.png)).

Atmo supplies the actual source-list headings, capsule search, collection, buttons and grey plate. The desktop board and result both have an **820×560** sheet and **210px** source list. In the 1440×900 gallery it is at x310/y56, directly below the actual parent chrome. Phone is **390×788** at y56 within the 390×844 viewport; the board is 390×760 at y84. This height difference follows the real parent's chrome while preserving the full available-height sheet. Media has three square columns, a Sources back button, centred title, Open, search and selection footer.

| Capture at DPR1 | Sources | Granted folders | Media | Application Support |
| --- | --- | --- | --- | --- |
| Desktop 1440×900 light | [PNG](latest-browser/desktop-light-sources.png) | [PNG](latest-browser/desktop-light-folders.png) | [PNG](latest-browser/desktop-light-media.png) | [PNG](latest-browser/desktop-light-storage.png) |
| Desktop 1440×900 dark | [PNG](latest-browser/desktop-dark-sources.png) | [PNG](latest-browser/desktop-dark-folders.png) | [PNG](latest-browser/desktop-dark-media.png) | [PNG](latest-browser/desktop-dark-storage.png) |
| Phone 390×844 light | [PNG](latest-browser/phone-light-sources.png) | [PNG](latest-browser/phone-light-folders.png) | [PNG](latest-browser/phone-light-media.png) | [PNG](latest-browser/phone-light-storage.png) |
| Phone 390×844 dark | [PNG](latest-browser/phone-dark-sources.png) | [PNG](latest-browser/phone-dark-folders.png) | [PNG](latest-browser/phone-dark-media.png) | [PNG](latest-browser/phone-dark-storage.png) |

Phone dark also passes at **DPR2** ([results](hidpi-browser/browser-results.json), [media](hidpi-browser/phone-dark-media.png)). Screenshots use CSS pixel dimensions; the browser rendered at the recorded DPR. The final light and dark desktop/phone captures were visually inspected against the board renders. No clipping or parent tab overlay remains. This is a measured composition comparison, not a claim of pixel identity: fonts and artwork are real Atmo/gallery assets, the gallery supplies three pictures rather than the board's placeholder swatches, and granted image files currently show file glyphs while media providers show thumbnails.

## Verification

| Check | Revision / result | Evidence |
| --- | --- | --- |
| Framework `npx tsc -b --pretty false` | Passed on b963a00 before adoption and during its clean SDK build. Frozen 66ac061 also passed. | [b963a00 build](adopt-b963a00/site-adoption.log), [frozen log](final-66ac061/frozen-framework-typecheck.log), [receipt](final-66ac061/site-adoption.json) |
| Focused framework Vitest | **73 passed, 10 files** on clean detached b963a00. Includes permission/persistence/filtering/bundle isolation/reference ownership, panel object, integration, sheet attachment, existing media service, browser-global boundary and counterpart map. | [log](adopt-b963a00/framework-focused.log) |
| Installed TypeScript consumer | Zero diagnostics; exercises object API, storage handle read/write types and negative imports proving `NSEMediaPanel` and `NSEOpenPanelProps` are gone. | [receipt](sdk-consumer.json), [script](sdk-consumer.mjs) |
| Site `npx tsc -b --pretty false` | Passed after clean adoption of b963a00. | [log](adopt-b963a00/site-typecheck.log), [receipt](adopt-b963a00/site-adoption.json) |
| Site `npx vitest run` | **394 passed, 3 failed; 60 files.** Failures: gallery editable-window creation and Publisher imagePopover/publishMenu anchor replacement. All three also occur in the earlier page-curl site baseline. | [log](adopt-b963a00/site-vitest.log) |
| Complete framework `npx vitest run` | Frozen **66ac061: 7,199 passed, 9 failed; 861 files; 1,024.82s**. No Open panel test failed. This snapshot precedes the concurrent counterpart-map and FX fixture fixes. | [full log](final-66ac061/frozen-framework-vitest.log) |
| Current broad-failure recheck | At 2f0922a, generated validator and FX package-resource tests pass; two Inspector production-graph tests still fail. **16 passed, 2 failed, 3 files.** Counterpart map separately passes in the 73-test adopted-package run. | [log](current-failure-recheck.log) |
| Chromium four-case matrix | All four passed on installed b963a00, DPR1, reduced motion. Exercises Sources, OPFS-backed bookmark handles, drilling/history/search/filtering, file/media selection, permission renewal, Add Folder, App Storage, portable browser chooser, reload persistence, Escape and focus return. Page errors are empty in every case. | [results](latest-browser/browser-results.json), [log](latest-browser.log), [harness](capture.mjs) |
| Capability fallbacks in Chromium | No directory picker, no OPFS, and media-only cases pass. Corresponding sections hide; media remains usable. A panel without media and without filesystem APIs falls straight through to the portable browser chooser and returns `fallback.txt`, without mounting a drawn panel. | [results](capability-fallbacks.json), [harness](capability-fallbacks.mjs) |
| Cleanup and preview | Both final detached checkout junctions deleted with `.Delete()` before `git worktree remove --force`; framework `.bin/vitest` survived. 5199 is left running from the exact site worktree; protected listeners survive. | [66ac061 receipt](final-66ac061/site-adoption.json), [b963a00 receipt](adopt-b963a00/site-adoption.json), [provenance](provenance.json) |

The complete framework snapshot's nine failures are: missing Foundation counterpart registrations (one), stale generated manifest validator (one), FX package-resource fixtures (five), and Inspector production graph bundling (two). The current narrow recheck confirms only the two Inspector failures persist in that group: its esbuild fixture cannot resolve asset URL imports and HarfBuzz's Node built-ins. Neither full suite is represented as green, and no complete rerun of the later shared revision is claimed. Earlier interrupted runs and exploratory captures are not acceptance evidence.

The browser harness uses real OPFS directory handles in isolated browser contexts and an explicit injected permission/picker seam. It does not clear or change an existing user's storage. It automates the portable file-input chooser; real `showDirectoryPicker`, native `showOpenFilePicker` and browser permission UI still require manual acceptance. Safari/Firefox source hiding is simulated in Chromium, with fake-handle unit coverage for OPFS handles lacking permission methods; those browsers were not run here.

## Commits for this task

Framework implementation:

| Commit | Change |
| --- | --- |
| 750b1dc | NSE: add granted folders and application-support storage |
| 397f881 | NSE: present Open panels as sheets with shared sources |
| beb20c5 | NSE: retain Open panel media across development replay |
| 1546d49 | NSE: match Open panel controls to the approved sheet |
| 7498040 | NSE: name the application-support collection for people |
| 5399e88 | NSE: restore Open panel focus after sheet detachment |
| 4afea24 | NSE: separate compact folder activation from selection |
| b3390b7 | NSE: bind browsed file references to their application |
| 66ac061 | NSE: keep attached sheets above floating tab bars |

The evidence/plan commit containing this report is identifiable in `git log -- docs/superpowers/evidence/2026-11-07-open-panel/README.md`.

Site:

| Commit | Change |
| --- | --- |
| 414ac2c | Gallery: choose media through the Open panel |
| 101d015 | Gallery: use the portable Foundation values (formatter/user-default imports in clean consumer files after the concurrent Foundation move) |
| bfcb62c | Gallery: adopt the committed Open panel framework |

Only explicit owned paths were staged. Other sessions' Animation, Page, About, Journal and evidence edits were left intact. `vite.claude-5199.config.mts` was not staged. The site's clean detached adoption includes shared commits rather than reverting another agent's package update. [adopt-framework.ps1](adopt-framework.ps1) preserves the required junction cleanup order.

## Fusion call sites and open acceptance

SynCloudOS-Fusion was inspected read-only and was not changed. There are no direct `NSEOpenPanel` or `NSEMediaPanel` source call sites. Existing runtime file acquisition remains here:

| File | Call sites |
| --- | --- |
| `SynCloudOS-Fusion/src/platform/files.ts` | `readTextFile`, line 32, calls `panels.open` at 37; `writeTextFile`, line 71, calls `panels.save` at 79. |
| `SynCloudOS-Fusion/src/SynWare/FieldLab.app/Contents/index.tsx` | `importConfiguration` passes `SCOS.filePanels` at 182; `exportConfiguration` at 205; `exportCSV` at 232; `exportSVG` at 253. |

Remaining acceptance is the real browser native-picker/permission interaction and owner visual review. The two Inspector framework tests and three site baseline tests remain open outside this panel pass. File thumbnails for granted folders are a possible later enhancement; this implementation provides usable named file cells and media-provider thumbnails. The application-support API remains deliberately small; no quota guarantees, OS-visible URLs or additional same-origin security boundary are implied.
