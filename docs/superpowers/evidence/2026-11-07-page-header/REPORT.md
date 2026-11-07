# Window title bars and NSEPageHeader retirement

Owner decision 3, 2026-11-07, implemented locally without pushing. The supplied framework and site branches were preserved. Fusion was inspected read-only.

## Commits and installed package

Framework implementation commits:

| Commit | Change |
| --- | --- |
| `a4c8f43` | Window toolbar styles, preference title bar, PageHeader removal and documentation. |
| `c26bbf7` | Internal compact More title presentation and localised text. |
| `80cb7f5` | Publish titlebar structure through the neutral stylesheet. |
| `69850f1` | Actual standalone-window projection tests and measured title geometry. |
| `5cf01c0` | Root SDK type export and selected-pane accessibility expectations. |
| `648739d` | Expanded titlebar accessory slots and removal of the empty title action. |
| `0e846f2` | Explicit Preferences window/accessory lifetime, tested inside a running class application. |
| `7bdaa0d` | Preserve Home and Account alongside the accessory slots. |

Site commits: `64932e8` (gallery migration), `a639f10` (clean SDK adoption) and `890305c` (bound the gallery's scroll content and compact tab bar beneath the title).

This pass adopted the clean framework commit `7bdaa0d3fdc6d42529b96f9fabf14d27e9f36ba6`, archive SHA-256 `3f1b63d7cb16836fa2ad55da64d84eb37b3bd63630f242eea96ff0ec95f2bed6`. [Receipt](installed-receipt.json), [build/adoption log](adoption-verified.log), [original installed API smoke check](installed-sdk-7bdaa0d.json).

Adoption used a clean detached checkout and the prescribed node_modules junction. Canonical Windows paths avoid the mixed short/long-path module graph encountered in earlier attempts. The final full framework run used that immutable checkout too; earlier shared-worktree runs are superseded by it.

Concurrent adoptions were preserved, including site commit `2b77bcd` from the Foundation workstream. The final checked installation is `c4f9adfbfdf0afb3ae9643a71bb4f6ee306bb497`, archive SHA-256 `1efd58d8cf08ba3c2ea09f7aad078a0f98a6a0dd1124229fc06e67ae2d72b22f` ([receipt](latest-installed-receipt.json), [fresh API smoke check](installed-sdk.json)). All six accepted browser captures use that revision, and each scenario verified an unchanged receipt throughout its run. Its 17 titlebar implementation files and the window-controller projection function are byte-identical to `7bdaa0d`; [hash evidence](titlebar-source-provenance.json). The full framework result below is explicitly pinned to the clean implementation snapshot, rather than claimed for every subsequent concurrent commit.

## Public API and ownership

`NSEWindow.toolbarStyle: NSEWindowToolbarStyle` is observable, defaults to `automatic`, rejects unknown values, and reaches stage, application-host and standalone window title presentation.

| Value | Atmo appearance |
| --- | --- |
| `automatic` | Existing title bar. |
| `expanded` | Large title on a separate plate row below toolbar items; fixed above scroll content, including on a phone. A root sidebar split supplies its main-pane title slot. |
| `preference` | Centred panel title with balanced leading/trailing accessory space. |
| `unified` | Existing title bar. |
| `unifiedCompact` | Existing title bar and density. |

The already-existing `NSEWindow.subtitle: string` API is retained and documented, with rendering coverage in the actual standalone title bar. It defaults to an empty string. Atmo preserves its case. The gallery does not set it.

The existing AppKit-shaped accessory API was sufficient: `NSETitlebarAccessoryViewController.layoutAttribute` (`leading`, `trailing`, `bottom`), `isHidden`, `window.titlebarAccessoryViewControllers`, `addTitlebarAccessoryViewController(controller)` and `removeTitlebarAccessoryViewController(index)`. Removing an accessory disposes it. Preferences owns its window and leading Back accessory for the panel's lifetime; its title follows the selected pane, preserving the existing NSEPresence choreography. The gallery uses a leading accessory for compact Sections navigation.

Compact More uses an internal title-presentation claim. It never overwrites the application's `window.title`; the latest app title returns when the list closes, hides, unmounts or leaves compact presentation. The shared renderer and tab label use the framework's `navigation.more` translation in all 19 dictionaries. A live French switch is tested as “Plus”. **No non-Apple public More property was added.** Internal TopBar append slots are not SDK API.

`NSEPageHeader` and its props are removed from public controls, Chrome indexes, SDK entries, registry and counterpart map, with the component and its appearance selectors deleted. There are no aliases, shims or deprecated exports. The installed JS/declaration symbol scan found no remaining `NSEPageHeader` symbol.

## Atmo and gallery changes

The retained plate gradients, rim/accent geometry, title typography, colour, shadow and radius now live in Atmo's `Resources/window-titlebar.css`. Neutral CSS owns only titlebar layout and title slots. No title drawing was put in inline styles.

Each gallery section supplies the window title and `expanded`. Its description is an ordinary non-editable `NSETextField` with `secondaryLabelColor` at the beginning of the scroll content. Category/search headers and the material example no longer instantiate PageHeader. The duplicate section plate, parent-section overline and empty compact QuickSwitch chevron are gone. Sidebar code and section headers were not edited.

The gallery's appearance boundary, root split and retained category view now fill their assigned frames. Previously they grew to the specimens' intrinsic height, giving the scroll view no range and pushing the compact tab bar below the viewport. The browser guard first failed on that real condition ([red check](scroll-proof-red.log)); it now requires positive scroll range, actual wheel movement and an in-viewport compact tab bar before accepting the fixed-title assertion. All accepted captures include this correction.

## Browser and reference evidence

Authority: Main.dc.html, Phone.dc.html and Prefs.dc.html from the owner's supplied headermock directory. ContentPlate.dc.html was not used. [Reference provenance and hashes](board-provenance.json), [reference measurements](board-measurements.json), [desktop board](board-main.png), [phone board](board-phone.png), [Preferences board](board-prefs.png).

All four Chromium DPR 1 flows passed with no page exceptions. Each result records its exact installed framework receipt and screenshot SHA-256 hashes. They cover Buttons → Text Fields → Buttons, fixed title during scrolling, Preferences → Appearance → Back → Language → Escape → Escape, gallery More/return, and Software More/return/overflow detail. [Combined results](browser-results.json), [verification inventory](verification.json).

| Viewport / mode | Gallery Buttons | Preferences Appearance | Functional result |
| --- | --- | --- | --- |
| 1440×900 light | [Capture](gallery-buttons-desktop-light.png) | [Capture](preferences-appearance-desktop-light.png) | [Passed](browser-results-desktop-light.json) |
| 1440×900 dark | [Capture](gallery-buttons-desktop-dark.png) | [Capture](preferences-appearance-desktop-dark.png) | [Passed](browser-results-desktop-dark.json) |
| 390×844 light | [Capture](gallery-buttons-phone-light.png) | [Capture](preferences-appearance-phone-light.png) | [Passed](browser-results-phone-light.json) |
| 390×844 dark | [Capture](gallery-buttons-phone-dark.png) | [Capture](preferences-appearance-phone-dark.png) | [Passed](browser-results-phone-dark.json) |

DPR 2 rendering spot checks also passed: [desktop](browser-results-desktop-light-dpr2.json), [phone](browser-results-phone-dark-dpr2.json). Functional sign-off is the DPR 1 matrix; DPR 2 checks cover title and panel rendering.

The expanded title uses the approved 30px desktop / 28px phone type with 40px / 37px line boxes. The existing host toolbar is 56px high; the board sketches use 52px. The title row itself is 61px / 52px, and retains its position while content scrolls. Existing gallery specimens, search controls and sidebar chrome remain the real gallery, rather than the boards' simplified content.

Preferences retains its measured 400×66 cap and 50×50 Back control. Its opaque cap interior is **pixel-identical to the before capture**: zero changed channels across 66,960 channels in a 372×60 comparison. Width, height and horizontal position are unchanged; vertical centring differs by 1/64 CSS pixel in the final capture. [Comparison](preferences-cap-comparison.json), [before](preferences-before.png), [current](preferences-appearance-desktop-light.png). The comparison excludes antialiased corners because the two screenshots have different applications behind the panel. [Transition](preferences-transition-desktop-light.png), [phone dark transition](preferences-transition-phone-dark.png).

Software's original failure is retained as [before](software-more-before.png): More is open but the title says Overview. Verified results: [Software light](software-more-phone-light.png), [Software dark](software-more-phone-dark.png), [gallery light](gallery-more-phone-light.png), [gallery dark](gallery-more-phone-dark.png).

Early captures interrupted by 5199 restarts and dependency replacement are not acceptance evidence. Only the passing result files above are used. A React warning about `isEnabled` on a native DOM element was also observed during probing; the passing matrix records page exceptions separately.

## Verification results

| Check | Result |
| --- | --- |
| Framework `npx tsc -b --pretty false` | Passed again at final verification; also passed during the clean SDK build. [Log](framework-typecheck-current-final.log) |
| Feature-focused framework tests | **100 passed, 9 files**, rerun at final verification: toolbar values/rendering, subtitle, Preferences ownership/panes/Back/focus, More/locale/resize, stage/application hosts and counterparts. [Log](feature-focused-current-final.log) |
| SDK export-removal tests | **2 passed**, 7 unrelated cases filtered out. [Log](sdk-export-tests.log) |
| Installed SDK | Passed all five values, subtitle, leading accessory ownership/disposal and removed exports. [Result](installed-sdk.json) |
| Full framework suite, clean `7bdaa0d` checkout | **7,252 passed, 28 failed; 863 files passed, 10 failed.** [Full log](framework-frozen-full.log) |
| Site `npx tsc -b --pretty false` | Passed again with the final installed SDK. [Log](site-current-typecheck-final.log) |
| Full site `npx vitest run`, SDK `c4f9adf` | **398 passed, 3 failed; 59 files passed, 2 failed.** [Log](site-current-full.log), [stable test receipt](site-test-receipt.json) |
| Chromium | Four required viewport/mode flows passed; two additional DPR 2 rendering checks passed. |

The pinned full framework suite and the current site suite are **not green**. The framework snapshot predates later concurrent Foundation follow-ups; its counts are not a claim about those newer revisions. Framework failures concern TextSystem/Chronosphere byte fixtures and consumers, browser-file expectations, document-index/generated-validator drift, Inspector production builds, a packed-file-browser timeout and packed FX consumers. None is in the feature-focused titlebar test files. [Failure inventory](full-suite-failures.md).

The three remaining site failures are the editable document-window flow in `gallery-atmo-surfaces.test.tsx`, and replacement-anchor behaviour for `imagePopover` and `publishMenu` in Publisher's `product-controller.test.tsx`. Their implementations were not changed in this pass. They remain reported failures, not accepted checks.

## Fusion and remaining questions

No `NSEPageHeader` call sites were found in SynCloudOS-Fusion at `6b2cf0c29f2ae9390c7eb6f42d847b7ca31b6583`, including a hidden-file search excluding .git, node_modules and dist. [Read-only search](fusion-call-sites.txt). Fusion was never edited.

No toolbarStyle, subtitle or accessory API decision remains open. Owner/Claude visual review is still the human acceptance step.

The host toolbar remains 56px rather than the sketch's 52px; this pass preserves the existing host control geometry. The repository-wide failures above need their respective owners' follow-up. Early sizing probes, including temporary browser-only CSS injection, are retained in `layout-probe.json`; they are diagnostics, while the accepted browser matrix verifies the final committed layout without injected CSS.

Preview: `http://127.0.0.1:5199`, from the supplied site worktree. The final listener is another session's port-specific Vite wrapper, whose root/config resolve to that exact site worktree. [Listeners](preview-listeners.json). Only 5199 was restarted by this pass; 5173 and 5387 retained their original listeners, and no 5210 listener was stopped. The temporary adoption junction is deleted before checkout removal, with framework Vitest checked afterwards. `vite.claude-5199.config.mts` was never staged.
