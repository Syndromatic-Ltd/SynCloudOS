# Authoring rules and the Opus friction reconciliation

The Developer MCP checks application source for departures from the public authoring APIs. Structural validity, idiomatic source, successful launch and a visually correct application are separate results. A static finding is evidence to act on; no findings is not visual or interaction acceptance.

The rules use the installed SDK. Appearance-neutral NSE controls obtain their appearance from the active appearance definition. Atmo is one implementation; applications are not required to select it. The SDK has no `NSEColor` class. UI colour guidance uses the actual semantic values of `NSEAppearanceDefinition` and `defineNSEAppearance` from `@syndromatic/syncloudos/nse/appearance`; it must never invent an `NSEColor` import.

## Errors

| Rule | Static evidence | Public direction and limits |
| --- | --- | --- |
| `idiom.nse-controls` | Raw button/input/select/textarea/table in application UI | Use the corresponding NSE control. Hidden/file inputs are exempt. |
| `idiom.system-image` | An image identifiable as a back/forward/arrow/chevron system icon | `NSEImage.named` and `NSEImageView`; an ordinary photograph is not inferred to be system artwork. |
| `idiom.ui-colour` | UI colour literals in supported CSS/JSX/NSE attributes | Use neutral semantic appearance values; renderer-owned artwork is a separate domain. |
| `idiom.scroll-view` | Explicit auto/scroll overflow in UI styles | `NSEScrollView`; a static rule cannot infer the intended region from screenshots. |
| `idiom.preferences` | Application `localStorage` access | Use application preferences for settings and document APIs for user work. |
| `idiom.device-fx` | Direct device API use with an existing FX counterpart | Use the named installed FX API and its owned lifetime/capability contract. |
| `idiom.button-glyph` | Button titles using arrows or other artwork glyphs, excluding numeric comparison/negative-value labels | Supply `NSEButton.image` with a bundled image; use named `NSEImage` templates for the available back/forward system images. A gear/checkmark is not assumed to have a named system image. |
| `idiom.system-artwork` | Inline SVG path explicitly identified as back/forward artwork | Use named system images. Arbitrary authored SVG content is not classified by its path geometry. |
| `idiom.eyebrow` | All-capital overline text preceding a heading | Put the title in the title position. Source-list group headers and table headers are not forbidden eyebrows. |
| `idiom.appearance` | Literal forced `aqua`/`darkAqua` or a corresponding constructed appearance in UI | Inherit the window appearance; a deliberate exception needs an explicit reason. |
| `idiom.control-internals` | Application selectors reaching into `.nse-*` control implementation classes | Use public control/appearance APIs rather than private DOM structure. This is not proof of global framework CSS ownership. |

## Warnings

Warnings describe potential misuse or a missing higher-level counterpart. They do not make a structurally valid application invalid. The original general idiom checks (class authoring, managed lifetimes, document state, undefined NSE tokens) also remain relevant.

| Rule | Evidence needed | Direction and deliberate limits |
| --- | --- | --- |
| `idiom.resampled-animation` | Generated `AFXKeyframeAnimation.values` that call a recognisable timing/curve sampler | Prefer `AFXBasicAnimation`/`AFXSpringAnimation`, or authored keyframes with `keyTimes` and `timingFunctions`, from `@syndromatic/syncloudos/fx/animation`. Ordinary data maps are accepted. This does not establish compositor eligibility or detect every helper that generates values. |
| `idiom.reduced-motion` | Literal `reducedMotion: "never"` in known AFX animation constructor options | Use `"system"`, or document an essential-motion exception. Unrelated objects with a similarly named property are accepted. |
| `idiom.backed-view-animation` | Raw animation of the exact `.element` target declared as an `NSEViewOutlet` | Animate `outlet.layer` with AFX. An arbitrary DOM element is not assumed to have a backing layer. |
| `idiom.animation-visibility` | A `visibilitychange` listener whose visible callback controls an animation/layer/display link/renderer | Use managed animation ownership and the host's visibility handling. Save-on-hidden listeners are accepted; opaque callbacks are unresolved. |
| `idiom.pixel-sprite` | A loop filling a `Uint8Array` in a scope that constructs an image | Review whether `GFXBitmapContext`/`GFXGradient`, from `@syndromatic/syncloudos/fx/graphics`, or a resource should draw it. Scientific buffers and decoding can be legitimate; the warning does not diagnose their intent. |
| `idiom.full-circle` | A declared GraphicsFX path arc whose statically calculable sweep is within 0.01 radians of a full circle | Use `GFXPath.ellipse({ x, y, width, height })` for a circle. Genuine open arcs remain valid. No arbitrary expression is evaluated. |
| `idiom.unused-resource` | A supported image/font/media/PDF asset with no static reference in scanned source, manifest or reachable artwork | Review before removing. Comments do not retain assets. Extensionless names and recognisable dynamic resource families do. This is not a whole-program resource reachability proof; localisations are managed by the framework. |
| `idiom.foundation-import` | Known Foundation symbols imported through obsolete root/NSE entries | `import { NSEUserDefaults, NSENumberFormatter, NSEData } from "@syndromatic/syncloudos/foundation"`; `NSEDataConvertible` is a type import. Old `NumberFormatter` becomes `NSENumberFormatter`. Namespace access and arbitrary wrappers remain for TypeScript/manual migration review. |
| `idiom.video` | Raw JSX `<video>` | `VFXVideoClient`, `VFXVideoPresentationClient` and `VFXRouteDetector` are lower-level public types in `@syndromatic/syncloudos/fx/video`. They are not a complete `AVPlayerView` analogue and do not provide a standard player UI. The rule must not recommend an invented `AVKPlayerView`. |

`NSEData` has `count` and `bytes`; it is not a `Blob` with `.size` and `.text()`. File-panel export payloads carry `data: NSEDataConvertible`, not `blob`. The import warning supplies migration context; TypeScript establishes whether a particular byte consumer has been migrated correctly.

## Explicit exceptions

An author can explain a deliberate exception with a real source comment on the finding's line or immediately before it:

```ts
// syncloudos-allow idiom.reduced-motion: this essential instrument indication has an independently reviewed static mode
new AFXAnimation({ duration: 1, reducedMotion: "never" });
```

CSS can use `/* // syncloudos-allow idiom.rule-id: nonblank reason */` immediately before a finding. The reason must be nonblank. Directives are local, not file-wide; strings that merely contain a directive are not comments. `idiomAudit.optOuts` records valid, invalid and unused directives with `file`, `line`, `rule`, `reason`, `valid` and `suppressed`; malformed directives produce `idiom.opt-out` errors. An exception records a choice and does not establish that it was visually verified.

Source that actually owns a third-party rendering surface, or a canvas WebGL context, is treated as renderer-owned and listed in `idiomAudit.rendererExemptions`. Mere imports, comments and renderer-sounding filenames do not qualify. That exemption applies to the renderer source, not unrelated inspector or toolbar UI in another file.

## Complete reconciliation of `FRICTION-OPUS.md`

This is a reconciliation of the external Fusion log recorded on 5–7 November 2026 against framework source inspected on 9 November 2026, starting at `fbb473a`. It does not modify Fusion or claim its pinned SDK has adopted these changes. Repeated observations are retained so every recorded bullet has a disposition.

Classes: **a** is a static rule (named below); **b** is an implemented framework contract with source/commit evidence; **c** needs runtime/visual evidence, is a product/API decision, or belongs outside application-source validation. Class c is not a claim that a reported gap is fixed. For compound bullets, separate rows distinguish the atomic concerns.

| Log item | Class | Current disposition / evidence |
| --- | --- | --- |
| O1: nested split sizes came from window bounds | b | Self-measured split bounds; `e2b9277`, `8b2a99b`, `src/NSE/DataViews/Split/splitViewControllerView.tsx`. |
| O1: missing vertical/multiple-pane divider styling | b | `e2b9277`, `src/NSE/DataViews/Split/splitViewController.css`; exact hit areas and appearance still need browser evidence. |
| O1: forwarding the split root ref | b | `src/NSE/DataViews/Split/NSESplitView.tsx`; current controller owns its measured view. |
| O2: constructing responsive authority for an adapter | b | Adapter replaced by controller-owned view and traits, `e12638f`, `NSESplitViewController.ts`. |
| O3: repetitive split preference schema / autosave-name proposal | c | `splitViewTypes.ts` still exposes preference state; no safe static rule can create the missing autosave API or judge a migration schema. |
| O4: split preference types unavailable publicly | b | `NSESplitViewPreferences` and controller options are exported by `src/NSE/sdkPackageEntry.ts`; old pane/adapter vocabulary is superseded by `NSESplitViewItem`. |
| O5: item-menu commands bypass validation | b | Current menu/command path is `src/NSE/Menus`; removed legacy menu APIs are checked by installed declarations. End-to-end validator/first-responder behavior still needs interaction tests. |
| O6: checkbox/radio control sizing | b | Unified `NSEButton` with `buttonType` and `controlSize`, `44c2cc5`; radio artwork is separately O15. |
| O7: table cannot fill its pane | b | Current `NSETableView` inherits measured viewport support; `src/NSE/DataViews/Table`, `docs/framework/data-views.md`. Browser layout is not inferred from source. |
| O8: invented source-list control | b | `NSEOutlineView` with source-list selection and group items; `8c3bae5`, `src/NSE/DataViews/Outline`. |
| O8: invented accordion / inspector grouping | b | Disclosure `NSEButton` and `NSEStackView`; `d604f57`, `src/NSE/Layout`. No static composition-quality claim follows. |
| O9: Vite keeps previous installed SDK | c | Development-server cache behavior needs installed-consumer runtime verification; app-source lint cannot invalidate a running server. |
| O9: installers guess archive by modification time | b | `scripts/synware/build-sdk.mjs` writes exact SDK/companion archive paths in `build-manifest.json`; install that pair. |
| O10: split view content and forced nested desktop mode | b | Child `NSESplitViewItem.viewController` and trait-owned outer collapse; `e12638f`, `3a53599`, `splitViewControllerView.tsx`. |
| O11: unspecified stack item fixed to 60 px | b | Fitting-size measurements, `d5497db`, `src/NSE/Layout/NSEStackView.tsx`. |
| O11: fill distribution versus fitting size / hugging | c | AppKit layout parity needs a solver/API decision and measured layout cases; current fitting-size code is not proof of hugging-priority parity. |
| O12: menu text loaded as image / size overwritten | b | Unified button/menu migration; `44c2cc5`, current `src/NSE/Menus/NSEPopUpButton.tsx`. Fetch and size behavior remains runtime-verifiable. |
| O13: arbitrary toolbar height versus control size | b | `NSEButton.controlSize`, including large; `src/NSE/Controls/Buttons`. |
| O14: segment sends unwanted payload | b | Current action/payload path in `src/NSE/Controls/Values/NSESegmentedControl.tsx`; the runtime command signature is also enforced. |
| O15: missing round Atmo radio art | c | Owner artwork decision; a linter cannot supply approved radio assets or declare capsule art equivalent. |
| O16: SynCal phone footer labels escape capsules | c | App adoption and phone geometry need site/browser evidence; source API availability is not acceptance of the footer. |
| Phase 3 menus, first bullet: hand-authored shortcut versus binding | c | Whether Save executes after focus/shortcut input is an interaction check; the recorded app-side shortcut mismatch is not revalidated in Fusion here. |
| Phase 3 menus, second bullet: effective key equivalent | b | Current command/menu model derives key equivalents; `src/NSE/Menus`, `src/SynCloudOS/Commands`; no authored shortcut string is needed. |
| D3 sheets, first bullet: content sheet leaves parent chrome live | b | Superseded by attached-sheet implementation `0ea5f73`, `src/NSE/Windows/windowSheetSurfaces.tsx`. |
| D3 sheets, second bullet: portalling loses parent chain | b | Attached sheet retains presenter context; `NSEViewController.ts` and `windowSheetSurfaces.tsx`. Not implemented as a child window. |
| D3 sheets, third bullet: dispatcher sheet-chain blocker | b | Explicitly superseded by log's later attached-sheet section and `0ea5f73`; do not report the old child-window blocker as current. |
| Shell: quoted-heredoc backslash corruption | c | Shell/tool transport observation; TypeScript can catch broken output, but no framework idiom rule can establish shell literal fidelity. |
| Chrome class collision, first bullet: old frame class names | b | Current document/chrome classes in `src/NSE/Windows/Chrome`, neutral structure stylesheet (`80cb7f5`). |
| Chrome class collision, second bullet: one CSS owner per class | c | A complete framework CSS ownership audit is outside app-source checking. `idiom.control-internals` prevents consumer reliance on private `.nse-*` selectors, not duplicate framework owners. |
| View-controller accessory sizing, first bullet: forced fill frame | c | Current render path replaced `NSEViewControllerView`; accessory fit/fill still requires geometry checks. |
| View-controller accessory sizing, second bullet: host fit/fill proposal | c | Host layout/API design rather than a safe source prohibition; inspect `viewControllerRenderer.tsx` and accessory host. |
| Menu ref callback set-state loop | c | Runtime render/launch failure is observable; statically rejecting every inline ref callback would reject valid code. |
| App name, first bullet: three title sources | c | Bundle/app/window naming intent cannot be inferred safely from string inequality. |
| App name, second bullet: remove `topBar.title` | b | Public top-bar authoring was removed; `src/NSE/sdkPackageEntry.ts`, `src/NSE/Windows/Chrome` and installed TypeScript declarations. |
| Toolbar DOM lookup, first bullet: Publisher querySelector anchor | a | `idiom.control-internals` catches private NSE selector access; public anchors remain a distinct API concern. |
| Toolbar DOM lookup, second bullet: toolbar item view anchor proposal | c | A public anchor API needs a contract and interaction evidence; lint must not invent an item-view accessor. |
| Design note: File segment balance / sharing group | c | Visual design judgement; no deterministic source violation. |
| Design note: DRAFT capsule baseline | c | Requires measured light/dark rendering. |
| Design note: compact title should retain document context | c | Owner layout choice and phone browser evidence. |
| App-only host, first bullet: no declared title bar | b | Standard bar for a declared frame; `src/SynCloudOSReact` application host and `src/NSE/Windows/Chrome`. |
| App-only host, second bullet: icon/name/document/gear bar | b | Implemented standard host bar, recorded in window-chrome work; runtime composition needs browser verification. |
| View-menu actions, first bullet: accessory chain misses content | c | Responder ancestry/focus is runtime state; lint cannot infer which responder is key from an action name. |
| View-menu actions, second bullet: route from first responder | c | Verify menu/toolbar routing against actual focused content; static idiom checks do not assert complete routing parity. |
| Click-to-rename, first bullet: standard title is text | c | Document-title interaction is a framework feature decision; absent click handlers are not inherently wrong. |
| Click-to-rename, second bullet: title menu / NSDocument proposal | c | Needs a document-title API and interaction acceptance; no invented API is recommended. |
| `NSETopBar` drops data attributes | c | Internal component DOM behavior requires a focused component regression; it is no longer public app chrome. |
| FieldLab design note: off-state toolbar ink | c | Appearance design decision and rendered contrast evidence. |
| FieldLab design note: compact document title hidden | c | Responsive composition and owner decision. |
| FieldLab design note: title/edited gap | c | Measured visual spacing, not a semantic source error. |
| Stage 4 status bar, first bullet: wrong AppKit name | b | Window content-border API replaces public status bar; `src/NSE/Application/NSEWindowController.ts`. |
| Stage 4 status bar, second bullet: content border and embossed label | b | `setContentBorderThickness`, `contentBorderThickness`, text-field background style; `NSEWindowController.ts`, text-field implementation. |
| Stage 4 status bar, third bullet: source-list footer remains internal | c | Source-list/window composition needs migration and rendered verification; an internal status bar is not a consumer violation. |
| Opaque roots, first bullet: paint hides content border | c | Layer coverage/occlusion needs layout and screenshot evidence; a background colour alone is not proof. |
| Opaque roots, second bullet: phone workspace overflows footer | c | Phone clipping/geometry is a browser check. |
| Raised ink depends on sibling band | b | Window publishes content-border state; `NSEWindowController.ts` and appearance styles. Actual ink legibility remains visual. |
| Attached sheets, first bullet: parent inertness / close guard / queues | b | `0ea5f73`, `windowSheetSurfaces.tsx`, `NSEWindowController.ts`; verify queued alerts and blocked actions in runtime tests. |
| Attached sheets, second bullet: slide/shadow / retained inert drawing | c | Motion and inert-copy lifetime need runtime/reduced-motion checks; a static rule cannot establish correct transition frames. |
| Attached sheets, third bullet: `NSEAlert.runModal` | b | `src/NSE/Application/NSEAlert.ts`; the application-modal alert API exists. |
| Attached sheets, fourth bullet: abortModal / stopModal absent | c | Application-modal termination is an API gap/owner decision; static validation cannot add it. |
| Attached sheets, fifth bullet: simultaneous sheet ordering | c | Queue ordering requires a runtime reproduction and state tests; no app-source guess. |
| App menu, first bullet: validate from last focused content | b | Current application-menu/runtime focus integration; `src/SynCloudOSReact` and `src/NSE/Application`; keyboard/pointer acceptance is separate. |
| App menu, second bullet: DOM versus React portal ancestry | c | Responder ancestry reconciliation requires runtime evidence. |
| Sheet scheme, first bullet: fixed dark plate | b | Sheet host receives resolved appearance; `src/NSE/Windows/windowSheetSurfaces.tsx`. |
| Sheet focus, second bullet: controller roots responder / scope id | b | Presented controller/responder and focus scope ownership in `NSEViewController.ts`, sheet renderer. |
| Sheet focus, third bullet: test host lacks input boundary | b | Stale: `createSynWareTestHost.tsx` now mounts `RuntimeInputBoundary` (around lines 457–469 at audit). |
| Menu choice, first bullet: flash/fade / touch cancellation | b | `0ea5f73` and current `src/NSE/Menus` presentation lifecycle; timing/appearance acceptance remains visual. |
| Menu choice, second bullet: active row / React pointer propagation | c | Native listener workaround is not proof the host propagation cause is resolved; exercise non-first rows by pointer/touch. |
| Menu choice, third bullet: anchor outside-dismiss closes/reopens | b | Current overlay anchor exclusion in `src/NSE/Overlays` and `NSEPopUpButton.tsx`; runtime regression needed when changing portal focus. |
| Menu choice, fourth bullet: widest item sizing / matching face | c | Intrinsic sizing and appearance matching require measured browser rendering. |
| Design note: sheets undimmed, runModal dimmed | c | Presentation-specific visual acceptance; no blanket prohibition on backdrops. |
| D7 view, first bullet: child's `view` renders itself | b | `38902ec`, `NSEViewController.ts`, `viewControllerRenderer.tsx`. |
| D7 view, second bullet: stable function and mount identity | b | Stable per-controller view contract in `NSEViewController.ts`; retained mounts have runtime tests. |
| Internal top bar, first bullet: exports removed | b | `src/NSE/sdkPackageEntry.ts`; installed declarations reject removed imports. |
| Internal top bar, second bullet: private glyphs / no named image API | b | Stale API gap: `NSEImage.named`, `5b86c6b`, `74529ed`, `src/NSE/Controls/Images/NSEImageResource.ts`. |
| Modal panels, first bullet: `presentAsModalWindow` | b | `9bef0ff`, `src/NSE/Application/NSEViewController.ts`. |
| Modal panels, second bullet: CSS width versus preferred content size | c | Intrinsic panel sizing is runtime geometry; changing preferred size is not automatically wrong. |
| Modal panels, third bullet: custom paper card / keep `NSEPopup` | c | Custom presentation is an owner decision. Animator APIs now exist (`c016bd6`); migration of Portfolio is not proven here. |
| Navigation, first bullet: tab controller/items / mutable labels | b | `src/NSE/Navigation`, current tab controller and tab item contracts. |
| Navigation, second bullet: page controller / represented object | b | `6c1a380`, `src/NSE/Page/NSEPageController.tsx`, `NSEViewController.ts`. |
| Navigation, third bullet: Portfolio no longer needs stack | c | Application state/composition observation; not a framework lint violation. |
| Navigation, fourth bullet: compact split choice | b | Compact split/navigation implementation `3a53599`; `splitViewControllerView.tsx`. Verify selected content at phone widths. |
| Navigation, fourth bullet: bottom accessory / source-list dependency | b | `0dcd58c`, `NSEWindowController.ts` has `bottomBarAccessory`; source-list app adoption still needs site verification. |
| Counterparts: every public NSE name has provenance | b | `f656534`, `docs/framework/appkit-counterparts.json`, `scripts/developer-mcp/lookup.mjs`; counterpart registry tests gate coverage. |
| Application objects: preferences controller/store rename | b | `3251345`, `NSEUserDefaultsController.ts`, `src/Foundation/NSEUserDefaults.ts`. |
| Application objects: haptic feedback manager | b | `src/NSE/Feedback/NSEHapticFeedbackManager.ts`; richer shell haptics remain distinct. |
| Application objects: appearance on view and forwarded ref | b | `src/NSE/Appearance/NSEAppearance.ts`, view implementation; app-level forced appearance has `idiom.appearance`. |
| Application objects: animation context and theme curves | b | `src/NSE/Animation/NSEAnimationContext.ts`; appearance-specific curve import is not globally forbidden. |
| Application objects: image scaling and internal/removed helpers | b | `src/NSE/Controls/Images`, `src/NSE/sdkPackageEntry.ts`; installed declarations define the current image surface. |
| Application objects: animation environment retained for evidence | c | Per-view reduced-motion evidence is an owner/API decision; do not outlaw the remaining supported provider. |
| Application objects: MemoJournal presentation animator | b | Animator API now exists, `c016bd6`, `NSEViewController.ts`; app adoption remains unverified. |
| Application objects: ImageFX crop/view / fit zoom | b | `src/FX/ImageFX/IFXImageView.tsx` and image viewport implementation; image load/fit behavior still needs runtime geometry tests. |
| Application objects: NSEView draw replaces graphics view | b | `8c69dd0`, `34fe71c`; current view drawing contract and GraphicsFX context. |
| Application objects: Open panel media sources | b | `397f881`, `eef4ed8`, `src/NSE/FilePanels/NSEOpenPanelSources.tsx`. |
| Application objects: pageCurl / spine location | b | `2532057`, `a6536c1`, `NSEPageController.tsx`; existing approved implementation is not a proposed missing API. |
| Application objects: cached display-list identifier remapping | c | Target-scope resource identity requires GraphicsFX replay tests; source use alone cannot prove safe reuse. |
| Application objects: owner approval of midpoint spreads | c | Historical API approval scope is an owner decision; current implementation existence does not replace that decision. |
| About audit introduction / reference revisions | c | Historical evidence provenance, not a rule or current runtime acceptance. |
| About: hand-sampled curves | a | `idiom.resampled-animation`. |
| About: reducedMotion never | a | `idiom.reduced-motion`. |
| About: implicit animation immediately replaced by explicit one | c | Transaction/model mutation order needs targeted runtime/AST semantic analysis; current sampler warning does not claim to prove this cancellation. |
| About: raw animation on a backing layer | a | `idiom.backed-view-animation`. |
| About: animation visibility listener | a | `idiom.animation-visibility`. |
| About: endless animation missing / 1000 iteration cap | b | Stale: `c0d5ecc`; `AFXAnimation.ts` accepts infinite iterations/repeatDuration and `AFXLayer.ts` supports endless compositor layers. Do not advise a workaround for the old limitation. |
| About: backing layer loses origin and clipping | b | Recorded fix `07a4ac3`; `src/FX/AnimationFX/AFXLayer.ts` adopts authored origin/clipping. |
| About: byte-by-byte sprite | a | `idiom.pixel-sprite` is a review warning, not proof all numeric image buffers are wrong. |
| About: additive mote blending | c | Artistic blend intent cannot be inferred from a particle renderer; compare reference and `IFXFilter.blend("addition")` behavior. |
| About: setParticles then render schedules/cancels a frame | c | Scheduling/lifetime behavior needs a targeted animation test, not a name-only source prohibition. |
| About: near-full circle arcs | a | `idiom.full-circle`. |
| About: raw scroll region | a | `idiom.scroll-view`. |
| About: raw section-art image | c | Ordinary artwork is not a system-icon violation. Use `NSEImageView` where appropriate; `idiom.system-image` only establishes identifiable system artwork. Renderer ownership/art direction needs review. |
| About: dead bundle images | a | `idiom.unused-resource`, with explicit dynamic-reference limits. |
| About: room CSS gradients and animated floor | c | CSS artwork is allowed; animated geometry ownership requires renderer/layout evidence, not a blanket gradient ban. |
| About: unconfirmed alpha clamp / absent keyframes / arc count | c | Explicitly unconfirmed historical claims; no rule should assert those defects exist. |
| About: legitimate particle layer | c | Valid custom particle behavior must not be prohibited because a native emitter lacks the same public behavior. |
| About: dashed-path sampling / proposed point-at-length | c | Public path sampling remains an API proposal; do not invent a sampler name or outlaw legitimate dashing. |
| Invented controls: raw buttons | a | `idiom.nse-controls`; supported control-size/bezel/path-control APIs are the replacements. |
| Invented controls: arrow glyphs in titles | a | `idiom.button-glyph`; named navigation images exist. |
| Invented controls: private system artwork | a | `idiom.system-artwork` and `idiom.system-image`, with identifiable-artwork limits. |
| Invented controls: forced appearance | a | `idiom.appearance`, with a reasoned local exception mechanism. |
| Invented controls: workspace icon lookup | b | `5b86c6b`, `src/NSE/Application/NSEWorkspace.ts`, Open panel item-image implementation. |
| Invented controls: owner's folder/document artwork slots | c | Approved owner artwork is a resource/design dependency, not something an MCP rule can generate or approve. |
| Invented controls: phone panels fill screen | c | Compact sheet geometry and dim/shadow need browser evidence; declaring a full-screen surface is not always wrong. Existing compact Open sheet fix: `9d681d8`. |
| Invented controls: duplicate expanded title | b | Recorded fixes `c9d85f5`, `bc1a119`; current window toolbar/titlebar composition. Browser checks verify the actual title count. |
| Invented controls: all-caps eyebrows | a | `idiom.eyebrow`; source-list group/table headers remain legitimate. |
| Fusion adoption introduction: pinned old SDK/MCP | c | Package adoption is consumer state. This change does not install archives, migrate Fusion, or restart previews. |
| Fusion adoption: Blob-shaped byte consumer | c | Requires migration against `NSEData` type contracts; TypeScript reports invalid `.size`/`.text()`/`blob` usage after the matching SDK is installed. |
| Fusion adoption: old NSEUserDefaults import | a | `idiom.foundation-import` supplies the exact Foundation import. |
| Fusion adoption: old NumberFormatter import/name | a | `idiom.foundation-import` supplies `NSENumberFormatter` from Foundation. |
| Fusion adoption: report every breaking import with replacement | a | `idiom.foundation-import` covers the listed named imports; general installed TypeScript checking remains required. |
| Missing AVKit player view: raw video surface | a | `idiom.video` warns with real lower-level VideoFX types and says a full player view is absent. |
| Missing AVKit player view: new player API / controls / PiP / route UI | c | A higher-level AVKit-shaped view remains a framework design task; the validator must not fabricate its prefix or claim lower-level VideoFX supplies its UI. |

## Verification scope

Run focused source-rule fixtures with `npx vitest run tests/runtime/idiom-warnings.test.ts` and the integrated idiom audit tests. They establish rule findings, locations, counterexamples and comment handling. They do not verify Fusion's screenshots, controller interaction, actual compositor use, physical devices, portal event propagation or a running preview's installed package identity. Use the installed SDK receipt and matching companion archive for adoption checks.
