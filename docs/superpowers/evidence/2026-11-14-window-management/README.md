# Window redesign evidence

Framework baseline is 1bfc47e9 in the Webspring framework worktree. Site baseline is 0472a7c with its then-installed Beta 2 SDK and existing local edits.

- Phase 0 established [framework fixture](captures/) and [site](site/) references. Phase 0b selected shared authority using four Chromium transfer tests. The production Webspring integration test verified window and controller identity, one content mount, draft and DOM focus when moving from stage to floating and back. The [plan records the boundary](../../plans/2026-11-14-window-management.md#transfer-prototype-results-sol) and the verified child-document handoff.
- [Phase 1](phase-1/) replaced the retired frame component with window content borders and preserved sheet-focus and sidebar behavior.
- Phase 2 added confirmed fullscreen transitions, scoped focus and restoration migration. This changes window state and authority.
- [Phase 3](phase-3/) gave Webspring and the single-app host real stage windows so one controller can move between frames. The production site captures pair the Phase 0 stage with the current stage and its floating destination at both sizes, both schemes and both materials. The captures show settled states. Launch, return, QuickSwitch and MultiSwitch motion review remains open.
- [Phase 4](phase-4/titlebar/) placed title, controls, toolbar and accessories in shared chrome. The captures compare source-backed fixture scenes. The titlebar browser tests measure placement, overflow, drag exclusions and floating geometry. [Site captures](phase-4/site/) show About, Software and Journal through the installed SDK. The Metal rail follows the root split sidebar.
- [Phase 4 scroll correction](phase-4/scroll-overlap/) restored About's glass over its viewport via `fullSizeContentView`. Software defers responsive changes from its resize observer to the next frame to prevent a layout error during wide/compact handoff.
- [Phase 5](phase-5/menu/) added independent menu bar and toolbar opt-ins using the same application menu. The Cumulus recaptures show the glass aligned with the title row beneath the menu. [Site captures](phase-5/site/) pair Phase 0 scenes with the new toolbar menu in closed and open states across the matrix. Software's phone layout places the menu button in toolbar overflow.
- Phase 6 documents window state, frame appearance and opt-in menus.
- [Phase 7](phase-7/split-layout/) added three-pane seams and animated sidebar and inspector collapse. The scoped before/after fixture verifies retained content and focus during geometry changes.
- [Phase 3 native](phase-3/native/) shows the retained Webspring editor in floating and child windows. Phone-width captures use a 390 CSS-pixel desktop popup. The browser test confirms sheet focus return, an app-close veto and recovery after native popup loss.
- [Phase 3 motion probes](phase-3/production-motion/) include launch and return samples and the QuickSwitch surface where available. The receipt records failed routes and incomplete transition sequences.
- [Phase 3 final site motion](phase-3/final-site-motion/) records launch, return, QuickSwitch and MultiSwitch in all eight requested combinations. The receipt includes observed MultiSwitch frames. Equivalent historical scenes remain incomplete.
- [Phase 3 stage exit](phase-3/stage-exit/) pairs the fixture before and after moving its content at the beginning of stage exit. The [frame samples](phase-3/production-motion/stage-exit-frames.json) show the earlier blank interval and the corrected continuous editor.
- [Phase 3 installed-site native](phase-3/installed-native/) verifies the same mounted About and Software content makes a desktop round trip through a child browser window in both schemes. The original window ID survives in the child and on return.
- [Phase 4 scoped frame paint](phase-4/frame-scope/) compares the same fixture with the scoped stylesheet off and on. A separate window keeps its own paint and a rejected stylesheet falls back to built-in tokens.
- [Phase 4 site apps](phase-4/site-apps/) shows both Journal variants in Journal and JournalOld, and the MemoJournal and SynCal layouts on desktop and phone. These are candidate captures. The original site's vendored SDK could not load Journal because its Atmo entry lacked the motion export required by that source.
- [Phase 7 tracked separator](phase-7/sidebar-tracking/) compares the same split with and without a tracking separator. It follows rendered sidebar thickness through resize and collapse, including in floating Cumulus.
- Phase 8 is a [written Electron plan](../../plans/2026-11-14-electron-window-host.md).

## Pending design review

- Pending design | Atmo menu-bar Metal colours and noise art. The menu bar uses existing tokens and semantic menu parts.
- Pending design | Atmo circular toolbar groups. The placeholder uses the existing button group.
- Pending design | Floating Cumulus titlebar art. The window opts in through titlebarPresentation, with a semantic floating surface and existing-token paint. Metal stays attached.
- Pending design | Journal and JournalOld frame-view art for the Mountain Lion and leather variants. Both use metric and token placeholders.
- Compare the shared titlebar's inline toolbar, controls, dark accessory paint, and desktop/phone layout with the reference captures. The titlebar and menu fixtures include their source hashes and geometry.
- The production site captures include both Journal variants, MemoJournal and SynCal. Same-scene baseline pairs and complete launch, return, QuickSwitch and MultiSwitch motion comparisons remain open.
- Window-controls-overlay verification remains open. Chrome accepted a temporary-profile PWA installation, but the test could not obtain a live native titlebar rectangle.

## Engineering follow-up

- Browser surfaces now bind and unbind with generation checks. The same mounted window and its auxiliaries follow the acknowledged destination. Child activation selects the eligible modal descendant and deactivation clears its key state while preserving the main window.
- App-facing standard button lookup and full-screen callbacks are wired. Class sheets restore focus after releasing inertness, preserve close vetoes, and keep unrelated window responders and commands available. Journal frame paint runs through validated, window-scoped stylesheets.
- Publisher consumes the incoming post route without rewriting it during window admission. Its transient anchors follow responsive toolbar replacement and its sheet titles supply accessible names.
- The system menu bar has a fixture matrix. About and Software provide production checks of the independently enabled application-menu toolbar item.

## Frozen screenshot results

The existing baseline images and assertion file match framework commit 1bfc47e9 byte for byte. Chromium DPR 1 and DPR 2 reported 80 failing partitions and 2 passing interaction checks at 6ca65fdf. Each failing partition stops at its first differing image, so the catalogue can have further differences after the entries below.
The final browser matrix at `afdf897c` reported 120 frozen catalogue failures across Chromium, Chromium high DPR and Chromium reduced motion. The [failure index](frozen-theme-failures.md#final-source-browser-run) lists every first mismatch.

### Pending design review

The final matrix reported 53 titlebar failures across light and dark in the three Chromium projects.

- Cumulus stage titlebar (`top-bar-atmoCumulus-dark` is the catalogue ID in both ambient schemes).
- Metal key window with preference toolbar (`window-metal-key-preference`).
- Standard inactive window with automatic, expanded, unified or unified compact toolbar.
- Standard key window with automatic, expanded or unified compact toolbar.

### Other screenshot mismatches

The remaining first mismatches in the final matrix were Metal switches on and off, circular sliders in mini, small and regular sizing at normal, focused, minimum or maximum positions, and two light focused button states. These control differences remain open for review. A Chromium rerun using baseline titlebar and theme sources reproduced the enabled Metal switch and regular maximum slider mismatches. In that same run the partition containing the Metal preference titlebar passed. The remaining control variants have not been isolated. Exact surface IDs and the results for both runs are in [the catalogue failure index](frozen-theme-failures.md).

## Verification

| Check | Frozen source or installed SDK | Observed result |
| --- | --- | --- |
| Framework typecheck and SDK build | `131b9eda` | Passed. |
| Site typecheck and boundaries | `c138484`, embedded framework `131b9eda` | Passed. Vendored archive SHA-256 is `bb1aa746669d72f108cbc813a1c909e11eb0890d8eb528726c2ee2fd2c0f948f`. |
| Current framework build and site typecheck | Framework `73f0eebd`, site `703bfa5` | Framework typecheck and SDK build passed. Site typecheck and boundaries passed. The installed archive SHA-256 is `55549208ad303e5bae6c786aac96d1a1e76aeff2e22e4b38e39c443afa7121f5`. |
| Full framework runtime suite | `34fac939` | 8,881 passed, six failed. Two QuickSwitch assertions and the retired Atmo selectors passed their focused reruns after fixing them. Three packed-consumer tests ran while the SDK output was being rebuilt. |
| Full framework suite | `34fac939`, isolated SDK build followed by tests | 9,914 passed, three test failures and one failed suite. QuickSwitch, Atmo validation and the obsolete titlebar import were fixed and verified in focused reruns. |
| Full framework suite | `27834416` | 9,916 passed, one test failure and one failed suite. Both outstanding failures passed the focused rerun at `131b9eda`. |
| Full framework suite | `131b9eda` | 9,921 passed across 1,043 files, including the runtime suite. The later `73f0eebd` typography change has its own focused results below. |
| Framework focused runtime | `27834416` and `131b9eda` | 832 toolbar, runtime and semantic tests passed. 14 ownership, AppKit counterpart and QuickSwitch tests passed. 10 titlebar, menu and Atmo bundle tests passed after selector cleanup. |
| Framework browser | `131b9eda` | 21 focused titlebar and stage overlay cases passed. Earlier separate runs passed all 34 Chromium titlebar geometry cases at standard and high DPR and all four stage overlay tests. |
| Full framework browser matrix | `27834416` | All seven projects ran. 423 passed, 216 failed, seven skipped. There were 120 frozen catalogue failures and 96 other failures, including image metadata, typography, FX output and adaptive navigation. |
| Host typography follow-up | `73f0eebd` | All six cases in Chromium, Firefox and WebKit passed after restoring inherited fonts and targeting the heading by role. The frozen follow-up passed 25 browser cases and 24 focused runtime cases. The full browser matrix predates this follow-up. |
| Site runtime | `c138484`, embedded framework `131b9eda` | 24 Node tests passed. Vitest reported 403 passed and ten failed, including Gallery lifecycle and focus, and Publisher transient anchors and image editing. |
| Site browser | `c138484`, embedded framework `131b9eda` | 11 passed and 14 failed. All five Chromium scroll/chrome viewports passed. Journal passed in Chromium, Firefox and WebKit. Failures cluster in Chronosphere/Gallery presentation, login, and Publisher. |
| Full framework suite before the toolbar contract correction | `afdf897c` | 9,931 passed and four timed out in the concurrent run. A rendered-contract assertion also failed. The four timeout cases passed focused reruns. The next commit adds the disabled and selected toolbar hooks to the generated contract and reference. |
| Final framework typecheck and SDK build | `afdf897c` | Passed. |
| Final site typecheck and boundaries | Site `11818eb`, installed framework `afdf897c` | Passed. Archive SHA-256 `68d791660cf9bc904bd936d779cb4a5176024b4bd62fa22c88f5158229ac2b1f`. |
| Final site runtime | Site `11818eb`, installed framework `afdf897c` | All 24 Node tests and all 413 Vitest cases passed with two workers and a 15-second test timeout. |
| Final framework focused runtime | `afdf897c` and source-equivalent precommit changes | 83 boundary, public API and animation-revocation checks passed in isolation. Another 70 passed across API, idiom, class modal and attached sheet files. The earlier integrated AppKit, focus, command and transfer run passed 78. |
| Final native browser | `afdf897c` | Chromium covered retained input, draft, ID, sheet focus, explicit reattach, close veto and OS loss. The separate stage-exit test sampled consecutive rendered frames. |
| Complete framework browser run | `afdf897c` | All seven projects ran. 438 passed, 206 failed and seven skipped. 120 frozen catalogue partitions failed. The detached-window and continuous stage-exit tests passed. |
| Focused final window browser checks | `afdf897c` | All 11 passed, including the forced-colours focus case that failed in the whole matrix. |
| Final site browser | Site `0d62926`, installed framework `afdf897c` | 18 passed and seven failed. All three Journal/Lumina browsers, both Publisher settings cases, and the repeated sign-in flow passed. Six Chronosphere/Gallery cases remained red. The Publisher context-menu case passed on the same-SDK focused rerun. |

The final framework browser matrix reported 86 failures outside the frozen catalogue. The four adaptive navigation failures reproduced on clean baseline framework `1bfc47e9`. Window management and forced-colour focus passed the 11-case focused run. Most other failures were in FX, text output and capability fixtures. The site Chronosphere development archive requires local authorisation. An authorised probe got past launch and still reported failures in the existing loading, recovery, Gallery and mobile visual checks.

The acceptance-name search covered `src`, `tests`, `scripts` and `tooling` in both repositories. Hits remaining in active code are `sourceList` names for the unrelated NSE outline selection style, its fixtures and Gallery navigation strings. The retired `frame.sourceList` field is gone. The plan, migration guide and capture metadata retain historical names to identify what was removed. The frozen theme assertion and image tree still match `1bfc47e9` byte for byte.
