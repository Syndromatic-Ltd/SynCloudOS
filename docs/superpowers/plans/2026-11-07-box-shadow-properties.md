# Box and shadow properties implementation plan

Owner decision 7 authorises this implementation in the existing framework and site worktrees. No branches, pushes, shims or changes in another agent's owned directories.

**Goal:** replace the public rounded-box, shadow-view and smooth-surface components with AppKit box, view and layer properties.

**Architecture:** NSE projects property values and neutral data attributes. Atmo CSS selects the well (custom bezel), frame (custom line/groove), floating plate (custom with shadow), or plain box (no border). Explicit fill, border and transparency values win. `NSEShadow` is an immutable NSShadow-shaped value; offsets are NSSize with positive height upwards. `cornerCurve` is circular or continuous. Existing internal smooth geometry stays in use for window, menu, popover and toolbar rendering.

**Tech stack:** TypeScript, React, Atmo CSS, Vitest/jsdom, Chromium screenshots.

- [x] Capture gallery boxes and shadows before editing; record viewport and geometry.
- [x] Add failing tests in `tests/runtime/nse-box-shadow.test.tsx` for shadow validation, property projection, appearance suppression, corner properties and removed exports.
- [x] Implement `Graphics/NSEShadow.ts`, `Views/viewLayerProperties.ts`, and their use in `Views/NSEView.tsx` and `Controls/Fields/NSEFields.tsx`; put recipes in Atmo CSS. Run focused box tests and TypeScript.
- [x] Add `AFXLayer.cornerCurve`, project it in the browser surface and retained composition, and test the property with the existing layer suite.
- [x] Remove the three public components and their export, registry and counterpart entries; migrate affected GraphicsFX tests. Keep internal smooth geometry.
- [x] Update framework docs and commit explicit framework paths after focused tests, SDK build and packed export checks.
- [x] Migrate the seven gallery files, adopt current committed framework HEAD through a detached temporary build checkout with a node_modules junction, and remove that checkout.
- [x] Run site TypeScript and Vitest; capture packed-SDK after screenshots in light/dark at DPR 1/2, record the owned navigation blocker to a full-gallery after capture, update audit evidence, and commit only owned site/framework changes.
- [ ] Repeat the full-gallery after capture once the phase 7 owner fixes the window/split update loop. Implementation and isolated rendering checks are complete; this remaining acceptance check is recorded in the audit.

QA includes the three looks, explicit overrides, zero radius/border/margins, transparent boxes, shadow removal and reduced transparency/forced colours; circular/continuous layers; title positions; compact layout and long content. Fusion is searched and reported without edits. Screenshots are engineering evidence, not owner visual acceptance.
