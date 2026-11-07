# PWA system phases 1–3

The framework implements the approved installed-application foundation, Info.ts declarations, notifications and shell integration, plus BackgroundTasks. Syndromatic explicitly installs its complete Webspring at `/`. No push keys were generated or committed, and nothing was pushed.

The implementation follows the approved owner decisions in `2026-11-07-pwa-capabilities.md`; its older “proposal” label was not treated as an approval gate. Foundation remains below NSE. Device frameworks and the PolicyKit/Authentication jobs remain separate work.

## Public API

| Surface | Behaviour |
| --- | --- |
| `Info.ts.webApp` | Explicit `scope`, `startURL`, names, colours and icons. Supports a whole Webspring, application-only hosts and chosen applications. Omission does not imply installation. |
| `documentTypes[].mimeTypes` | Together with extensions, generates manifest file handlers. |
| `urlTypes`, `linkCapture`, `shortcutItems`, `shareTarget` | Generate protocol, launch, shortcut and share declarations. Deployment prefixes are applied. Ambiguous whole-desktop share receivers are rejected. |
| `DocumentType.readFromData(data, context)` | Decodes incoming Foundation `NSEData`. `openDocument({ withContentsOf, typeId, applicationId })` opens the decoded unsaved document. |
| `NSEApplication.delegate` | `applicationOpen(application, urls, context)` receives incoming URLs, shares and shortcut context after the destination application has actually opened. `applicationDockMenu(application)` contributes its Dock/Webspring menu. |
| `application.backgroundTaskScheduler` | `BGTaskScheduler.capabilities()`, `submit`, `getPendingTaskRequests`, `cancel`, `submitDownload` and `downloadedData`. Task identifiers must be declared in `background.tasks`. Downloads return `NSEData` and MIME type. |
| `application.userNotificationCenter` | `getNotificationSettings`, `requestAuthorization`, `setNotificationCategories`; integrates with the canonical per-app privacy owner. |
| Remote notification registration | `application.registerForRemoteNotifications()` and `unregisterForRemoteNotifications()`. The host supplies `mountSynCloudOS({ push: { applicationServerKey, subscriptionURL } })`. |
| `application.dockTile.badgeLabel` | AppKit's `NSDockTile.badgeLabel` shape. Empty text reveals the notification count. Text labels use the existing Atmo Badge renderer. |
| `NSEViewController.transition(from, to, options, completion)` | Existing crossfade transitions can use native View Transitions. AFX retains duration/lifetime ownership and unsupported/reduced-motion paths. |
| `webspring.install` | Runtime-owned install command, also available through Preferences > Capabilities. |

The public authoring guide and push server contract are in [installed-applications.md](../../../framework/installed-applications.md). The worker, browser adapters, install registry and capability aggregation are system implementation details, rather than new FX families.

## Runtime behaviour

There is one service-worker registration for the deployment. Its cache identity includes the installed SDK receipt; production also hashes final emitted HTML, assets and public icon bytes. Updates wait for predecessor clients to close. API/authentication responses, writes and foreign-origin responses are outside the shell cache. Production precaches the emitted application graph; development retains fetched Vite modules and resource imports for inspection.

Durable background requests are fenced by request ID, so completion or rollback of an earlier request cannot delete its replacement. The worker rejects redirects for background work. POST shares remain in IndexedDB until a real receiver acknowledges delivery. Incoming launch-envelope parameters are consumed before typed route-query validation. Routes use the longest matching application owner and respect deployment boundaries.

Standard and declarative push envelopes use the same portable worker delivery path in Chromium. Notification actions hand off to the running app without reloading its documents. The documented server contract requires authenticated subscription association, CSRF protection, request deduplication and removal of expired endpoints. A closed worker cannot enforce a page's changing account/access policy; the server must revoke or suspend the association too.

## Chromium evidence

Verification used headed Playwright Chromium 149 on Windows, the paired site's server at `http://127.0.0.1:5199`, viewport 1440 × 1000 and DPR 1. The dedicated persistent profile is `C:/Users/KAVISH~1/AppData/Local/Temp/syncloudos-pwa-R9Hs4v`. No existing user browser storage was cleared.

| Check | Evidence and limit |
| --- | --- |
| Whole-Webspring manifest | `/syncloudos-com.syndromatic.webspring.webmanifest`; manifest ID, scope and start URL are `/`, with standalone/WCO display declarations and 192/512 icons reused from Syndromatic artwork. Chromium reported no manifest or installability errors. |
| Actual installation | Chromium's `PWA.install` installed the site. `PWA.getOsAppState` succeeded, and `PWA.launch` opened a real standalone app window. The real browser install event also enabled the NSE install command before installation. Native prompt interaction itself was not accepted as a separate manual test. |
| Worker and update lifecycle | One activated registration controls the site. Waiting updates were observed and allowed to activate by closing predecessor clients, without forced activation. |
| Offline reload | [Screenshot](chromium-installed-offline.png), [receipt](chromium-offline.json). `navigator.onLine` was false, standalone was true, one worker controlled the document, and there were zero failed requests or page errors. The existing Connection Error alert was dismissed after the cached desktop rendered. |
| Fresh offline app launch | [Screenshot](chromium-installed-offline-relaunch.png), [receipt](chromium-offline-relaunch.json). The previous app window was closed and Chromium launched a fresh installed window while offline; the complete Webspring desktop rendered. This is a development preview with the existing explicit preview flag and warmed Vite resources. Production graph precaching is covered by real production-build tests, rather than a production deployment claim. |
| Capabilities | [Settled installed pane](chromium-capabilities-installed.png). Shows installed state, registered worker, granted persistent storage, browser support and passive FX queries. Opening the pane did not prompt for devices. The earlier `chromium-capabilities-before-install.png` is an exploratory screenshot that exposed the subsequently corrected contrast problem. |
| Badging | Chromium's OS-app state reported badge count 7 after `navigator.setAppBadge(7)`, then 0 after clearing it. [Receipt](chromium-browser-primitives.json). This proves the browser primitive; `NSEDockTile`/NotificationCenter integration is covered by tests. |
| View Transitions | Native update, update-callback completion and finished promises completed. The NSE backend's lifetime, cancellation, cleanup and fallback behaviour is tested. This does not claim a live app controller used that backend during an unrelated site navigation. |
| Window Controls Overlay | Chromium reports the API and the installed manifest opts into it, but the browser's native overlay setting remained disabled. Computer Use refused access because it could not determine the native window's browser URL. Native toggle/drag behaviour therefore remains unverified. |
| Atmo host title bar | [Screenshot](chromium-overlay-simulated-geometry.png), [limits](chromium-overlay-limits.json). Explicitly simulated browser geometry, with the real `InstalledApplicationTitleBar` and existing `NSEWindowTitleBar`. Measured height/line height 32px, Atmo font weight 700, padding `0 80px`, and the existing light gradient. The full-screen app stage occupies y=32, height=968 in the 1000px viewport, and its real NSE application menu remains usable. This is rendering/integration evidence, not a claim that native WCO was enabled. The simulated client was closed afterwards. |

File/protocol associations, URL capture, shortcuts, GET/POST share delivery, durable background execution, notification actions and standard/declarative push payloads were verified in focused tests. Live OS associations and remote push transport were not exercised by the current site's declarations/configuration.

## Controls and appearance

No control or artwork was invented. Capabilities uses real `NSEBox` and `NSEButton`; preferences navigation uses the existing NSE controls. The host title bar extends `NSEWindowTitleBar` and reuses its Atmo light/dark palette. Badges reuse `Badge`. Existing raw buttons inside NSE renderer implementations and the site's existing Webspring button were not copied into new custom controls.

Visual inspection corrected inherited white text in Capabilities, missing standalone title-bar CSS and palette scope, and a title area that did not fill the browser's reported height. Browser offline inspection corrected stale development graphs, transformed localisation/URL modules and Vite's Origin-varying font requests. The final title-bar screenshot is explicitly labelled as simulated geometry.

A bounded read-only review also identified a cache quota failure that could replace successful online bytes with stale bytes, and host typography that still used neutral title metrics. Both were corrected. Regression tests cover cache-write failures in development and production. A further regression confirmed that the canonical work area must reserve the visible overlay row; it now tracks geometry changes and restores the complete viewport when the overlay is hidden. The reviewer confirmed these corrections without further concrete defects; no reviewer mutations or package builds were made.

## Remaining owner configuration and choices

1. **Push deployment:** supply the owner's public VAPID key and subscription endpoint in host configuration, with the matching private key/contact held on the server; alternatively leave remote push unavailable until that server exists. No substitute keys were created. The client and server contract are implemented.
2. **Multiple share receivers, if a site later declares them:** select one Webspring receiver, or install the receiving apps independently. The build rejects ambiguity. Syndromatic currently declares no share target, so this does not block its installation.
3. **Native WCO acceptance:** enable Chromium's title-bar overlay in the installed app and check dragging/native buttons manually when native automation is available. This is an unverified browser setting, not an unsettled architecture decision.

Approved install scope, optional authentication, FX/system ownership, passkeys and PolicyKit decisions were not reopened. Compression naming belongs to the other approved work and was not changed here.

## Framework commits owned by this task

| Commit | Area |
| --- | --- |
| `d522174` | Info.ts installed declarations |
| `8ce1517` | Declaration line endings |
| `6c21821` | Manifest, installation and offline foundation |
| `5c7782b` | Incoming document readers and launch routing |
| `463e436` | BackgroundTasks and UserNotifications |
| `d894e75` | Shell title bar, badges and transitions |
| `615b8f6` | Downloads and notification handoff |
| `bfcfb32` | SDK packaging and push contract |
| `95a8c6b` | Already-approved service declaration roots in SDK build |
| `01cd4f4` | Review fixes: route/delivery ownership and request fencing |
| `2d09a30` | Offline versions from final production bytes |
| `3274bfa` | Readable Capabilities styling |
| `1625d4c` | Fresh online Vite graphs with offline fallback |
| `8e1c2b0` | Transformed Vite resource imports |
| `d79d0d1` | Existing Atmo host title-bar paint/layout |
| `26ba2fd` | Bare raw/URL imports and static Origin variation |
| `9364eec` | Shared Atmo host title-bar palette |
| `83d01b4` | Successful online delivery despite failed cache retention |
| `95414a2` | Existing Atmo title typography and overlay height |
| `b0bfc6a` | Canonical work-area reservation for visible overlay chrome |
| `ac24122` | Full-screen application stage uses the canonical work area |

Site commit `d588716` declares the whole Webspring install scope, adds the reused install icons and adopts Badge label rendering. SDK adoption commits and final verification results are recorded below.

## Verification history and known failures

Command logs are under `../2026-11-07-foundation/`, with the `pwa-` prefix.

| Check | Completed result |
| --- | --- |
| Focused PWA + window/Atmo tests after follow-up review | **51 passed**, nine files; `pwa-followup-review-green.log`. |
| PWA/window tests including the overlay work-area regression | **47 passed**, eight files; `pwa-overlay-work-area-green.log`. Framework typecheck passed and the boundary checker retained only the known fixture violation. |
| Final app-stage geometry integration | **23 passed**, six files; `pwa-application-work-area-green.log`. Framework typecheck passed; source boundary check still has only the known fixture violation. The read-only reviewer found no concrete issues. |
| Framework `npx tsc -b --pretty false` | Passed after the follow-up changes; `pwa-followup-review-typecheck.log`. Clean pinned SDK builds also typechecked. |
| Architecture boundary checker | Only the pre-existing `src/FrameworkTests/Windows/WindowManagementFixture.tsx:29` → internal `NSEPopover.tsx` violation. No new boundary was introduced. `pwa-followup-review-boundaries.log`. Running this checker inside a junctioned checkout additionally resolves React type dependencies outside that checkout; the authoritative source-tree check was run in the real framework worktree. |
| SDK build | Successful clean, pinned builds, including the final implementation. Build logs and checkout/cleanup receipts are retained. A shared-root attempt earlier correctly rejected a source fingerprint that changed while another job was committing. |
| SDK package and packed consumers at `8e1c2b0` | **29 passed, one failed**, seven files; `pwa-release-package-tests.json`. The failure is the exact browser-export list in `synapp-sdk-package.test.ts`: actual exports include the Authorization job's `SCAuthorization` and `SCAuthorizationRights`, which the expected list omits. The six other packed-consumer files passed. This was not represented as a green package gate. |
| SDK package gate at `b0bfc6a` | **All nine tests passed**, including compilation, bundling and mounting of the independent public consumer; `pwa-shipped-package-tests.json`. This snapshot includes the Authorization owner's `bcb8297` export-assertion correction. |
| Fresh full serial framework suite at `5a7a857` | **923 files passed / three failed**, **7,630 tests passed / 13 failed**, no skipped tests. Command: `npx vitest run --pool=threads --maxWorkers=1 --no-file-parallelism`. Eleven architecture-harness assertions encountered test/hook timeouts, one Open panel test did not observe its file-open callback, and the older SDK export assertion failed. Raw results: `pwa-serial-framework-tests.json`; failure details: `pwa-serial-failures.json`. The SDK assertion passes on the later final implementation, as above. The cache-quota, Atmo metric and overlay work-area follow-ups were covered by their focused runs after this broad run began; this is not claimed as a full-suite result for `b0bfc6a`. |
| Rerun of the other two failing framework files | **All 45 tests passed** with normal timeouts and the default pool in the real worktree: `npx vitest run tests/runtime/architecture-boundaries.test.ts tests/integration/nse-open-panel.test.tsx --maxWorkers=1 --no-file-parallelism`. `pwa-failure-rerun.json`. The full run remains recorded as failed; it is not retroactively labelled green. |
| Site suite after the `9364eec` adoption | **398 passed, three failed**, 61 files; `pwa-head-site-tests.json`. Failures: Gallery's owned-window/history lookup at `gallery-atmo-surfaces.test.tsx:58`, and Publisher's replacement-anchor identity assertions for `imagePopover` and `publishMenu` at `publisher/product-controller.test.tsx:73`. These same three failures occurred in earlier site runs. Their implementation belongs to the concurrent Gallery/Publisher work and was not changed here. |
| Site focused Webspring tests | **15 passed**; `pwa-site-dial-tests.log`. Both site and framework typechecks passed after adoption. |
| Earlier full framework suite at `3274bfa` | Completed with **856 files passing / 70 failing**, **6,736 tests passing / 22 failing**. Sixty file failures were `ENOSPC` load errors; additional packed tests also failed copying archives when disk space ran out. `pwa-final-framework-full.json` and `pwa-full-failures.json` retain the complete failure list. Preferences and share-client assertions from that older snapshot passed in later focused/current-source checks. This run prompted the fresh serial rerun. |

The first shared-root full-suite attempt was intentionally aborted because its packed artifacts were stale. The redundant older site/forks run was also aborted after the full framework result was saved; complete later site/threads results are retained. Neither aborted run is counted as passing. Earlier site/forks runs also reported worker shutdown/time-response errors, in addition to their assertion failures.

Windows briefly rejected an npm replacement of the installed SDK with `EPERM`. The normal clean-checkout adoption script was retried with only the 5199 preview stopped, and its checksum/resource verification succeeded. No manual deletion under `node_modules` was used. Every owned adoption checkout removed its junction first, checked that the framework's `.bin/vitest` still existed, and only then removed the detached checkout.

Site commit `c424b3e` adopts the verified `b0bfc6a` archive. Another job subsequently committed a newer receipt. Following the shared-worktree rule, an intermediate adoption was prepared at framework HEAD `fc20cc6`; `pwa-concurrent-head-checkout.json` records that `src/`, `scripts/`, the package manifest and SDK build configuration have no changes from the tested implementation `b0bfc6a` to that HEAD. That receipt advanced documentation/provenance without changing the verified runtime source. The later app-stage correction and its adoption are recorded below.

## Final delivered state

The final app-stage correction is included in framework snapshot **`359725e7f2274a8493f66192766de454b01d2592`**, which contains `ac24122` and the concurrent committed work. It was built and adopted from a clean detached checkout. Framework typechecking and SDK build completed successfully through `use-framework.mjs`; the site typecheck also passed.

The final site suite completed with **398 tests passing and three failing (59 files passing / two failing)**. The failures are the same Gallery owned-window lookup and two Publisher replacement-anchor assertions described above. `pwa-system-complete-site-tests.json` and its log retain the result. No site failure was hidden or labelled passing.

Final adopted archive SHA-256: `ece730fd22b391fab6543f63877382057c82076190f5689fdbf46369e6e4e317`. Site adoption commit: **`97275d3`**. The complete site commit list owned by this task is `d588716`, `c424b3e`, `4a00b5b` and `97275d3`. Peer adoption commits were preserved and followed by clean re-adoption, rather than reverted.

Final browser receipts were refreshed against this archive: [installed state and manifest](chromium-final-verification.json), [offline reload](chromium-offline.json), [fresh offline launch](chromium-offline-relaunch.json), [native badges/transition](chromium-browser-primitives.json), and [simulated overlay integration](chromium-overlay-limits.json). The latest Capabilities and overlay screenshots are settled renders of the completed implementation.

The final detached checkout's junction and checkout were removed in the required order, and the framework Vitest executable remains present. No owned adoption worktrees remain. The source worktrees/branches were not switched. Only 5199 was restarted; 5387 retained PID 69072, while 5173 and 5210 had no listeners in the recorded checks. The paired site's 5199 preview remains available; concurrent jobs may subsequently restart that shared process. A peer restart briefly changed preview authentication during capture; the existing local test sign-in and explicit development preview were used without changing production authentication.

No push, branch creation, history rewriting, stash, or edits to another job's uncommitted source were performed. `site/vite.claude-5199.config.mts` was not staged. Fusion was not inspected or modified. The unrelated dirty `scripts/synware/installed-consumer.mjs` was left to its owner.
