# Box and shadow properties implementation plan

Owner decision 7 authorises this implementation in the existing framework and site worktrees. No branches, pushes, shims or changes in another agent's owned directories.

**Goal:** replace the public rounded-box, shadow-view and smooth-surface components with AppKit box, view and layer properties.

**Architecture:** NSE projects property values and neutral data attributes. Atmo CSS selects the well (custom bezel), frame (custom line/groove), floating plate (custom with shadow), or plain box (no border). Explicit fill, border and transparency values win. `NSEShadow` is an immutable NSShadow-shaped value; offsets are NSSize with positive height upwards. `cornerCurve` is circular or continuous. Existing internal smooth geometry stays in use for window, menu, popover and toolbar rendering.

**Tech stack:** TypeScript, React, Atmo CSS, Vitest/jsdom, Chromium screenshots.

- [ ] Capture gallery boxes and shadows before editing; record viewport and geometry.
- [ ] Add failing tests in `tests/runtime/nse-box-shadow.test.tsx` for shadow validation, property projection, appearance suppression, corner properties and removed exports.
- [ ] Implement `Graphics/NSEShadow.ts`, `Views/viewLayerProperties.ts`, and their use in `Views/NSEView.tsx` and `Controls/Fields/NSEFields.tsx`; put recipes in Atmo CSS. Run focused box tests and TypeScript.
- [ ] Add `AFXLayer.cornerCurve`, project it in the browser surface and retained composition, and test the property with the existing layer suite.
- [ ] Remove the three public components and their export, registry and counterpart entries; migrate affected GraphicsFX tests. Keep internal smooth geometry.
- [ ] Update framework docs and commit explicit framework paths after focused tests, SDK build and packed export checks.
- [ ] Migrate the seven gallery files, adopt current committed framework HEAD through a detached temporary build checkout with a node_modules junction, and remove that checkout.
- [ ] Run site TypeScript and Vitest; capture matching after screenshots, compact and HiDPI checks, update audit evidence, and commit only owned site/framework paths.

QA includes the three looks, explicit overrides, zero radius/border/margins, transparent boxes, shadow removal and reduced transparency/forced colours; circular/continuous layers; title positions; compact layout and long content. Fusion is searched and reported without edits. Screenshots are engineering evidence, not owner visual acceptance.
