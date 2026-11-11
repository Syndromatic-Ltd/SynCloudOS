# Privacy & Security pane integration

`src/Webspring/PrivacySecurityPane.tsx` renders the runtime privacy store for one user. Props are `store`, `userId`, optional `applicationNames` keyed by canonical lower-case bundle ID, and optional `text` (`SystemText`).

Integrate using a built-in preference definition in `src/Webspring/builtInPreferencePanes.ts`, following the existing Notifications or Storage definition. Its wrapper should select live runtime app names and the same current user ID used by mounted privacy ports, then render the component with `runtime.privacy` and `useSystemText()`. `useSystemPreferencePanes` and `SystemUILayer` already handle pane registration and presentation.

The pane uses existing `NSEBox`, `NSEStackView`, `NSESwitch` and `NSEButton` from the public controls entry. **Invented controls: none.** It introduces no artwork or glyph navigation. The switch changes local app consent; the pane explicitly says it cannot grant browser permission. The reset action returns local consent to prompt. Browser status remains visible separately.

Verification: six focused jsdom tests pass with real controls, covering empty state, user filtering, live changes, revocation from a switch, reset and browser refusal precedence. Full framework typecheck at the captured revision reported five concurrent FX wiring errors in useNetwork, useSpeechSynthesizer, useVideoPresentation and BrowserRuntimeEnvironment; no pane diagnostics. The boundary run raced a concurrent PassFX paymentJSON.ts move and stopped with ENOENT. Screenshots await parent integration into the live preferences surface; no server was started or stopped for this slice.
